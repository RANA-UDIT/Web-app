const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

let server;
let temporaryDirectory;
let originalFetch;
let mapsRequestUrl;
let app;
let validateTrail;

function request(pathname, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: pathname,
      method,
      headers: {}
    };
    if (body !== undefined) {
      requestOptions.headers['Content-Type'] = 'application/json';
    }

    const outgoing = http.request(requestOptions, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () => resolve({
        status: incoming.statusCode,
        headers: incoming.headers,
        body: Buffer.concat(chunks)
      }));
    });
    outgoing.on('error', reject);
    if (body !== undefined) outgoing.write(JSON.stringify(body));
    outgoing.end();
  });
}

before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'trek-stop-test-'));
  process.env.TRAILS_DATA_FILE = path.join(temporaryDirectory, 'trails.json');
  await fs.copyFile(path.join(__dirname, '..', 'trails.json'), process.env.TRAILS_DATA_FILE);
  process.env.AZURE_MAPS_SUBSCRIPTION_KEY = 'test-key-not-for-production';
  delete process.env.COSMOS_ENDPOINT;
  delete process.env.COSMOS_KEY;
  originalFetch = global.fetch;
  global.fetch = async (url) => {
    mapsRequestUrl = new URL(url);
    if (mapsRequestUrl.pathname.endsWith('/map/attribution')) {
      return new Response(JSON.stringify({
        copyrights: ['© Azure Maps'],
        generalCopyrights: []
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    });
  };
  ({ app, validateTrail } = require('../server'));
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
});

after(async () => {
  global.fetch = originalFetch;
  delete process.env.TRAILS_DATA_FILE;
  delete process.env.AZURE_MAPS_SUBSCRIPTION_KEY;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('lists and filters the local trail dataset', async () => {
  const healthResponse = await request('/api/health');
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(JSON.parse(healthResponse.body), {
    status: 'ok',
    dataStore: 'Local JSON',
    maps: 'Azure Maps configured'
  });

  const allResponse = await request('/api/trails');
  assert.equal(allResponse.status, 200);
  const trails = JSON.parse(allResponse.body);
  assert.equal(trails.length, 6);

  const filteredResponse = await request('/api/trails?difficulty=Hard');
  assert.equal(filteredResponse.status, 200);
  const hardTrails = JSON.parse(filteredResponse.body);
  assert.ok(hardTrails.length > 0);
  assert.ok(hardTrails.every((trail) => trail.difficulty === 'Hard'));
});

test('validates new trail records and saves valid records', async () => {
  const invalidResponse = await request('/api/trails', {
    method: 'POST',
    body: { trailName: 'No coordinates' }
  });
  assert.equal(invalidResponse.status, 400);

  const trail = {
    trailName: 'Test Ridge Walk',
    region: 'Himachal Pradesh',
    difficulty: 'Easy',
    distanceKm: 5,
    elevationGainM: 250,
    latitude: 32.1,
    longitude: 76.2,
    bestSeason: 'Spring',
    description: 'A sample route used to verify the Trek-Stop trail API.'
  };
  assert.equal(validateTrail(trail), null);
  assert.notEqual(validateTrail({ ...trail, elevationGainM: '' }), null);
  assert.notEqual(validateTrail({ ...trail, latitude: [] }), null);
  const savedResponse = await request('/api/trails', { method: 'POST', body: trail });
  assert.equal(savedResponse.status, 201);
  assert.equal(JSON.parse(savedResponse.body).trailName, trail.trailName);

  const listedResponse = await request('/api/trails?search=Test%20Ridge');
  assert.equal(JSON.parse(listedResponse.body).length, 1);
});

test('proxies Azure Maps tiles without returning the subscription key', async () => {
  const response = await request('/api/maps/tiles/3/4/2');
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'image/png');
  assert.equal(mapsRequestUrl.pathname, '/map/tile');
  assert.equal(mapsRequestUrl.searchParams.get('subscription-key'), 'test-key-not-for-production');
  assert.equal(mapsRequestUrl.searchParams.get('view'), 'IN');
  assert.equal(response.body.toString().includes('test-key-not-for-production'), false);
});

test('rejects invalid Azure Maps tile coordinates before making an upstream request', async () => {
  mapsRequestUrl = undefined;
  const response = await request('/api/maps/tiles/2/4/1');
  assert.equal(response.status, 400);
  assert.equal(mapsRequestUrl, undefined);
});

test('requests and returns Azure Maps attribution for the current viewport', async () => {
  const response = await request('/api/maps/attribution?bounds=75,29,79,33&zoom=6');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {
    copyrights: ['© Azure Maps'],
    generalCopyrights: []
  });
  assert.equal(mapsRequestUrl.pathname, '/map/attribution');
  assert.equal(mapsRequestUrl.searchParams.get('bounds'), '75,29,79,33');
  assert.equal(mapsRequestUrl.searchParams.get('view'), 'IN');
});

test('rejects invalid Azure Maps attribution bounds', async () => {
  mapsRequestUrl = undefined;
  const response = await request('/api/maps/attribution?bounds=181,29,79,33&zoom=6');
  assert.equal(response.status, 400);
  assert.equal(mapsRequestUrl, undefined);
});
