require('dotenv').config();

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const appInsights = require('applicationinsights');
  appInsights.setup().setAutoCollectRequests(true).setAutoCollectDependencies(true).start();
}

const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { CosmosClient } = require('@azure/cosmos');

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataFile = process.env.TRAILS_DATA_FILE || path.join(__dirname, 'trails.json');
const mapsApiVersion = '2024-04-01';
const mapsEndpoint = 'https://atlas.microsoft.com';
const mapsKey = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;
const mapRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Map request limit reached. Please wait before using the map again.' }
});

app.set('trust proxy', process.env.WEBSITE_SITE_NAME ? 1 : false);
app.use(express.json({ limit: '1mb' }));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules', 'leaflet', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

let localTrails;
let cosmosContainer;

async function getLocalTrails() {
  if (!localTrails) {
    localTrails = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  }
  return localTrails;
}

async function saveLocalTrails(trails) {
  await fs.writeFile(dataFile, `${JSON.stringify(trails, null, 2)}\n`);
  localTrails = trails;
}

async function getContainer() {
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  if (!endpoint && !key) return null;
  if (!endpoint || !key) throw new Error('Both COSMOS_ENDPOINT and COSMOS_KEY are required.');
  if (cosmosContainer) return cosmosContainer;

  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({
    id: process.env.COSMOS_DATABASE || 'trekStop'
  });
  const { container } = await database.containers.createIfNotExists({
    id: process.env.COSMOS_CONTAINER || 'trails',
    partitionKey: { paths: ['/region'] }
  });
  cosmosContainer = container;
  return cosmosContainer;
}

async function listTrails() {
  const container = await getContainer();
  if (container) {
    const { resources } = await container.items.query(
      'SELECT * FROM c ORDER BY c.createdAt DESC'
    ).fetchAll();
    return resources;
  }
  return [...await getLocalTrails()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function validateTrail(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return 'Please submit a trail object.';
  }

  const required = ['trailName', 'region', 'difficulty', 'bestSeason', 'description'];
  const missing = required.filter((field) => typeof input[field] !== 'string' || !input[field].trim());
  if (missing.length) return `Please provide: ${missing.join(', ')}.`;

  const difficulty = input.difficulty.trim();
  if (!['Easy', 'Moderate', 'Hard'].includes(difficulty)) {
    return 'Difficulty must be Easy, Moderate, or Hard.';
  }

  const numericFields = ['latitude', 'longitude', 'distanceKm', 'elevationGainM'];
  if (numericFields.some((field) => input[field] === undefined || input[field] === null
    || !['number', 'string'].includes(typeof input[field])
    || (typeof input[field] === 'string' && !input[field].trim()))) {
    return 'Provide latitude, longitude, distance, and elevation gain.';
  }

  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return 'Latitude must be between -90 and 90.';
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return 'Longitude must be between -180 and 180.';
  }

  const distanceKm = Number(input.distanceKm);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 1000) {
    return 'Distance must be greater than 0 and no more than 1,000 km.';
  }
  const elevationGainM = Number(input.elevationGainM);
  if (!Number.isFinite(elevationGainM) || elevationGainM < 0 || elevationGainM > 10000) {
    return 'Elevation gain must be between 0 and 10,000 m.';
  }
  if (input.trailName.trim().length > 80 || input.region.trim().length > 100) {
    return 'Trail name must be at most 80 characters and region at most 100 characters.';
  }
  if (input.bestSeason.trim().length > 40) return 'Best season must be at most 40 characters.';
  if (input.description.trim().length < 20 || input.description.trim().length > 500) {
    return 'Description must be between 20 and 500 characters.';
  }
  return null;
}

function requireMapsKey(response) {
  if (mapsKey) return true;
  response.status(503).json({
    error: 'Azure Maps is not configured. Add AZURE_MAPS_SUBSCRIPTION_KEY to the local .env file.'
  });
  return false;
}

function parseTileCoordinate(value) {
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

async function fetchMaps(url) {
  return fetch(url, { signal: AbortSignal.timeout(10000) });
}

app.get('/api/health', async (_request, response) => {
  const cosmosEndpoint = Boolean(process.env.COSMOS_ENDPOINT);
  const cosmosKey = Boolean(process.env.COSMOS_KEY);
  if (cosmosEndpoint !== cosmosKey) {
    return response.status(503).json({ error: 'Both Cosmos DB settings must be configured together.' });
  }
  return response.json({
    status: 'ok',
    dataStore: cosmosEndpoint ? 'Azure Cosmos DB configured' : 'Local JSON',
    maps: mapsKey ? 'Azure Maps configured' : 'Azure Maps not configured'
  });
});

app.get('/api/maps/status', (_request, response) => {
  response.json({ provider: 'Azure Maps', configured: Boolean(mapsKey) });
});

app.get('/api/maps/tiles/:z/:x/:y', mapRateLimit, async (request, response) => {
  if (!requireMapsKey(response)) return;

  const zoom = parseTileCoordinate(request.params.z);
  const x = parseTileCoordinate(request.params.x);
  const y = parseTileCoordinate(request.params.y);
  if (zoom === null || x === null || y === null || zoom > 18) {
    return response.status(400).json({ error: 'Invalid map tile coordinates.' });
  }
  const tileCount = 2 ** zoom;
  if (x >= tileCount || y >= tileCount) {
    return response.status(400).json({ error: 'Map tile coordinates are outside the selected zoom level.' });
  }

  const url = new URL('/map/tile', mapsEndpoint);
  url.search = new URLSearchParams({
    'api-version': mapsApiVersion,
    tilesetId: 'microsoft.base.road',
    zoom: String(zoom),
    x: String(x),
    y: String(y),
    tileSize: '256',
    view: 'IN',
    'subscription-key': mapsKey
  });

  try {
    const mapsResponse = await fetchMaps(url);
    if (!mapsResponse.ok) {
      console.error(`Azure Maps tile request failed with status ${mapsResponse.status}.`);
      return response.status(502).json({ error: 'Azure Maps could not provide this map tile.' });
    }

    const contentType = mapsResponse.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      console.error('Azure Maps returned a non-image tile response.');
      return response.status(502).json({ error: 'Azure Maps returned an invalid map tile.' });
    }
    response.set('Content-Type', contentType);
    response.set('Cache-Control', 'public, max-age=3600');
    return response.send(Buffer.from(await mapsResponse.arrayBuffer()));
  } catch (error) {
    console.error('Azure Maps tile request failed:', error.name);
    return response.status(502).json({ error: 'Azure Maps is temporarily unavailable.' });
  }
});

app.get('/api/maps/attribution', mapRateLimit, async (request, response) => {
  if (!requireMapsKey(response)) return;

  const bounds = typeof request.query.bounds === 'string'
    ? request.query.bounds.split(',').map(Number)
    : [];
  const zoom = typeof request.query.zoom === 'string' ? Number(request.query.zoom) : NaN;
  const validBounds = bounds.length === 4 && bounds.every(Number.isFinite)
    && bounds[0] >= -180 && bounds[0] <= 180
    && bounds[2] >= -180 && bounds[2] <= 180
    && bounds[1] >= -90 && bounds[1] <= 90
    && bounds[3] >= -90 && bounds[3] <= 90
    && bounds[0] < bounds[2] && bounds[1] < bounds[3];
  if (!validBounds || !Number.isInteger(zoom) || zoom < 0 || zoom > 18) {
    return response.status(400).json({ error: 'Provide valid map bounds and a zoom level from 0 to 18.' });
  }

  const url = new URL('/map/attribution', mapsEndpoint);
  url.search = new URLSearchParams({
    'api-version': mapsApiVersion,
    tilesetId: 'microsoft.base.road',
    zoom: String(zoom),
    bounds: bounds.join(','),
    view: 'IN',
    'subscription-key': mapsKey
  });

  try {
    const mapsResponse = await fetchMaps(url);
    if (!mapsResponse.ok) {
      console.error(`Azure Maps attribution request failed with status ${mapsResponse.status}.`);
      return response.status(502).json({ error: 'Azure Maps attribution is temporarily unavailable.' });
    }
    return response.json(await mapsResponse.json());
  } catch (error) {
    console.error('Azure Maps attribution request failed:', error.name);
    return response.status(502).json({ error: 'Azure Maps attribution is temporarily unavailable.' });
  }
});

app.get('/api/trails', async (request, response) => {
  const filters = ['search', 'region', 'difficulty'];
  if (filters.some((field) => request.query[field] !== undefined && typeof request.query[field] !== 'string')) {
    return response.status(400).json({ error: 'Search, region, and difficulty filters must be single text values.' });
  }

  try {
    const trails = await listTrails();
    const search = (request.query.search || '').trim().toLowerCase();
    const region = (request.query.region || '').trim().toLowerCase();
    const difficulty = (request.query.difficulty || '').trim().toLowerCase();
    const filtered = trails.filter((trail) => {
      const matchesSearch = !search || [trail.trailName, trail.region, trail.description]
        .some((value) => value.toLowerCase().includes(search));
      const matchesRegion = !region || trail.region.toLowerCase().includes(region);
      const matchesDifficulty = !difficulty || trail.difficulty.toLowerCase() === difficulty;
      return matchesSearch && matchesRegion && matchesDifficulty;
    });
    return response.json(filtered);
  } catch (error) {
    console.error('Trail listing failed:', error.message);
    return response.status(500).json({ error: 'The trail catalogue is temporarily unavailable.' });
  }
});

app.post('/api/trails', async (request, response) => {
  const validationError = validateTrail(request.body);
  if (validationError) return response.status(400).json({ error: validationError });

  const trail = {
    id: crypto.randomUUID(),
    trailName: request.body.trailName.trim(),
    region: request.body.region.trim(),
    difficulty: request.body.difficulty.trim(),
    distanceKm: Number(request.body.distanceKm),
    elevationGainM: Number(request.body.elevationGainM),
    latitude: Number(request.body.latitude),
    longitude: Number(request.body.longitude),
    bestSeason: request.body.bestSeason.trim(),
    description: request.body.description.trim(),
    createdAt: new Date().toISOString()
  };

  try {
    const container = await getContainer();
    if (container) {
      await container.items.create(trail);
    } else {
      await saveLocalTrails([trail, ...await getLocalTrails()]);
    }
    return response.status(201).json(trail);
  } catch (error) {
    console.error('Saving the trail failed:', error.message);
    return response.status(500).json({ error: 'The trail could not be saved.' });
  }
});

app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));
app.get(/.*/, (_request, response) => response.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
  app.listen(port, () => console.log(`Trek-Stop running at http://localhost:${port}`));
}

module.exports = { app, validateTrail };
