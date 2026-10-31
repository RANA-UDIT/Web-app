require('dotenv').config();

if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const appInsights = require('applicationinsights');
  appInsights.setup().setAutoCollectRequests(true).setAutoCollectDependencies(true).start();
}

const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { CosmosClient } = require('@azure/cosmos');
const { BlobServiceClient } = require('@azure/storage-blob');

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataFile = path.join(__dirname, 'data.json');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let localDestinations;
let cosmosContainer;

async function getLocalDestinations() {
  if (!localDestinations) {
    localDestinations = JSON.parse(await fs.readFile(dataFile, 'utf8'));
  }
  return localDestinations;
}

async function saveLocalDestinations(destinations) {
  localDestinations = destinations;
  await fs.writeFile(dataFile, `${JSON.stringify(destinations, null, 2)}\n`);
}

async function getContainer() {
  if (cosmosContainer || !process.env.COSMOS_ENDPOINT || !process.env.COSMOS_KEY) return cosmosContainer;
  const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
  const { database } = await client.databases.createIfNotExists({ id: process.env.COSMOS_DATABASE || 'travelCatalogue' });
  const { container } = await database.containers.createIfNotExists({
    id: process.env.COSMOS_CONTAINER || 'destinations',
    partitionKey: { paths: ['/continent'] }
  });
  cosmosContainer = container;
  return cosmosContainer;
}

async function listDestinations() {
  const container = await getContainer();
  if (container) {
    const { resources } = await container.items.query('SELECT * FROM c ORDER BY c.createdAt DESC').fetchAll();
    return resources;
  }
  return [...await getLocalDestinations()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function validateDestination(input) {
  const required = ['name', 'country', 'continent', 'type', 'bestSeason', 'description'];
  const missing = required.filter((field) => typeof input[field] !== 'string' || !input[field].trim());
  const budget = Number(input.budget);
  if (missing.length) return `Please provide: ${missing.join(', ')}.`;
  if (!Number.isFinite(budget) || budget < 1 || budget > 10000) return 'Daily budget must be between $1 and $10,000.';
  if (input.description.trim().length < 20) return 'Description must be at least 20 characters.';
  if (input.imageUrl && !/^https?:\/\//i.test(input.imageUrl)) return 'Image URL must start with http:// or https://.';
  return null;
}

app.get('/api/destinations', async (request, response) => {
  try {
    const destinations = await listDestinations();
    const { search = '', continent = '', type = '', maxBudget = '' } = request.query;
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = destinations.filter((destination) => {
      const matchesSearch = !normalizedSearch || [destination.name, destination.country, destination.description]
        .some((value) => value.toLowerCase().includes(normalizedSearch));
      const matchesContinent = !continent || destination.continent === continent;
      const matchesType = !type || destination.type === type;
      const matchesBudget = !maxBudget || destination.budget <= Number(maxBudget);
      return matchesSearch && matchesContinent && matchesType && matchesBudget;
    });
    response.json(filtered);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'The catalogue is temporarily unavailable.' });
  }
});

app.post('/api/destinations', async (request, response) => {
  const validationError = validateDestination(request.body);
  if (validationError) return response.status(400).json({ error: validationError });

  const destination = {
    id: crypto.randomUUID(),
    name: request.body.name.trim(),
    country: request.body.country.trim(),
    continent: request.body.continent.trim(),
    type: request.body.type.trim(),
    budget: Number(request.body.budget),
    bestSeason: request.body.bestSeason.trim(),
    description: request.body.description.trim(),
    imageUrl: request.body.imageUrl?.trim() || '',
    createdAt: new Date().toISOString()
  };

  try {
    const container = await getContainer();
    if (container) await container.items.create(destination);
    else await saveLocalDestinations([destination, ...await getLocalDestinations()]);
    response.status(201).json(destination);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'The destination could not be saved.' });
  }
});

app.post('/api/upload', upload.single('image'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'Choose a JPG, PNG, or WEBP image under 5 MB.' });
  if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return response.status(503).json({ error: 'Image storage is not configured yet. Add an image URL instead.' });
  }
  try {
    const service = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    const container = service.getContainerClient(process.env.AZURE_STORAGE_CONTAINER || 'destination-images');
    await container.createIfNotExists({ access: 'blob' });
    const blob = container.getBlockBlobClient(`${crypto.randomUUID()}-${request.file.originalname.replace(/[^a-z0-9.]/gi, '-')}`);
    await blob.uploadData(request.file.buffer, { blobHTTPHeaders: { blobContentType: request.file.mimetype } });
    response.status(201).json({ imageUrl: blob.url });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'The image upload failed.' });
  }
});

app.get(/.*/, (_request, response) => response.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(port, () => console.log(`Travel catalogue running at http://localhost:${port}`));
