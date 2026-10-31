const trailList = document.querySelector('#trails');
const resultCount = document.querySelector('#resultCount');
const listSummary = document.querySelector('#listSummary');
const emptyState = document.querySelector('#emptyState');
const mapNotice = document.querySelector('#mapNotice');
const mapStatusText = document.querySelector('#mapStatusText');
const mapAttribution = document.querySelector('#mapAttribution');
const dialog = document.querySelector('#trailDialog');
const form = document.querySelector('#trailForm');
const formMessage = document.querySelector('#formMessage');
const toast = document.querySelector('#toast');
const filterInputs = ['search', 'region', 'difficulty'].map((id) => document.querySelector(`#${id}`));
const markerLayer = L.layerGroup();
const trailMarkers = new Map();
const map = L.map('trailMap', {
  scrollWheelZoom: false,
  zoomControl: true,
  minZoom: 2,
  maxBounds: [[-85, -180], [85, 180]],
  maxBoundsViscosity: 1
}).setView([30.9, 78.1], 5);
map.addLayer(markerLayer);
let mapTiles;
let attributionTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function trailCardTemplate(trail) {
  return `<article class="trail-card" data-trail-id="${escapeHtml(trail.id)}">
    <button class="trail-card-button" type="button" aria-label="Show ${escapeHtml(trail.trailName)} on map">
      <span class="trail-card-top"><span class="difficulty-badge difficulty-${escapeHtml(trail.difficulty.toLowerCase())}">${escapeHtml(trail.difficulty)}</span><span class="trail-region">${escapeHtml(trail.region)}</span></span>
      <span class="trail-name">${escapeHtml(trail.trailName)}</span>
      <span class="trail-description">${escapeHtml(trail.description)}</span>
      <span class="trail-facts"><span>${Number(trail.distanceKm).toLocaleString()} km</span><span>↗ ${Number(trail.elevationGainM).toLocaleString()} m</span><span>${escapeHtml(trail.bestSeason)}</span></span>
    </button>
  </article>`;
}

function showMapNotice(message) {
  mapNotice.textContent = message;
  mapNotice.hidden = false;
}

function clearMapNotice() {
  mapNotice.hidden = true;
  mapNotice.textContent = '';
}

function populateRegions(trails) {
  const regionSelect = document.querySelector('#region');
  const selectedRegion = regionSelect.value;
  const regions = [...new Set(trails.map((trail) => trail.region))].sort((a, b) => a.localeCompare(b));
  regionSelect.innerHTML = '<option value="">All regions</option>' + regions
    .map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)
    .join('');
  if (regions.includes(selectedRegion)) regionSelect.value = selectedRegion;
}

function focusTrail(trail) {
  const marker = trailMarkers.get(trail.id);
  if (marker) {
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 9), { animate: true });
    marker.openPopup();
  }
  document.querySelectorAll('.trail-card').forEach((card) => {
    card.classList.toggle('is-selected', card.dataset.trailId === trail.id);
  });
}

function renderTrails(trails) {
  trailList.innerHTML = trails.map(trailCardTemplate).join('');
  resultCount.textContent = trails.length;
  listSummary.textContent = `${trails.length} ${trails.length === 1 ? 'ROUTE' : 'ROUTES'}`;
  emptyState.hidden = trails.length > 0;
  markerLayer.clearLayers();
  trailMarkers.clear();

  trails.forEach((trail) => {
    const marker = L.marker([Number(trail.latitude), Number(trail.longitude)])
      .bindPopup(`<strong>${escapeHtml(trail.trailName)}</strong><br>${escapeHtml(trail.region)} · ${escapeHtml(trail.difficulty)}`)
      .addTo(markerLayer);
    marker.on('click', () => focusTrail(trail));
    trailMarkers.set(trail.id, marker);
  });

  trailList.querySelectorAll('.trail-card-button').forEach((button, index) => {
    button.addEventListener('click', () => focusTrail(trails[index]));
  });
}

async function loadTrails() {
  const query = new URLSearchParams();
  filterInputs.forEach((input) => {
    if (input.value) query.set(input.id, input.value);
  });

  try {
    const response = await fetch(`/api/trails?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The trail catalogue could not be loaded.');
    renderTrails(result);
  } catch (error) {
    trailList.innerHTML = '';
    markerLayer.clearLayers();
    resultCount.textContent = '—';
    listSummary.textContent = 'UNAVAILABLE';
    emptyState.textContent = error.message || 'The trail catalogue could not be reached. Please try again.';
    emptyState.hidden = false;
  }
}

async function loadMapAttribution() {
  if (!mapTiles) return;
  const bounds = map.getBounds();
  const boundsText = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth()
  ].join(',');
  const query = new URLSearchParams({ bounds: boundsText, zoom: String(map.getZoom()) });

  try {
    const response = await fetch(`/api/maps/attribution?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Map attribution could not be loaded.');
    const stripMarkup = (markup) => new DOMParser()
      .parseFromString(markup, 'text/html')
      .body.textContent;
    const copyright = Array.isArray(result.copyrights)
      ? result.copyrights.map(stripMarkup).join(' ')
      : '';
    const generalCopyright = Array.isArray(result.generalCopyrights)
      ? result.generalCopyrights.map(stripMarkup).join(' ')
      : '';
    mapAttribution.textContent = [copyright, generalCopyright].filter(Boolean).join(' ');
  } catch (error) {
    showMapNotice(error.message || 'Azure Maps attribution could not be loaded.');
  }
}

async function initializeMapService() {
  try {
    const response = await fetch('/api/maps/status');
    const status = await response.json();
    if (!response.ok) throw new Error(status.error || 'Map service status is unavailable.');

    if (!status.configured) {
      mapStatusText.textContent = 'Add Azure Maps key';
      showMapNotice('Map tiles need an Azure Maps key. Follow the local setup instructions in README.md.');
      return;
    }

    mapStatusText.textContent = 'Azure Maps connected';
    clearMapNotice();
    mapTiles = L.tileLayer('/api/maps/tiles/{z}/{x}/{y}', {
      minZoom: 2,
      maxZoom: 18,
      tileSize: 256,
      attribution: ''
    }).addTo(map);
    mapTiles.on('tileerror', () => {
      showMapNotice('Azure Maps could not load a tile. Check the key, account access, or network, then try again.');
    });
    mapTiles.on('load', clearMapNotice);
    map.on('moveend', () => {
      clearTimeout(attributionTimer);
      attributionTimer = setTimeout(loadMapAttribution, 250);
    });
    await loadMapAttribution();
  } catch (error) {
    mapStatusText.textContent = 'Map service unavailable';
    showMapNotice(error.message || 'Azure Maps service status could not be reached.');
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

document.querySelector('#openTrailForm').addEventListener('click', () => {
  form.reset();
  formMessage.hidden = true;
  dialog.showModal();
});
document.querySelector('#closeTrailForm').addEventListener('click', () => dialog.close());
document.querySelector('#clearFilters').addEventListener('click', () => {
  filterInputs.forEach((input) => { input.value = ''; });
  loadTrails();
});

let searchTimer;
filterInputs.forEach((input) => {
  input.addEventListener(input.id === 'search' ? 'input' : 'change', () => {
    if (input.id === 'search') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadTrails, 180);
    } else {
      loadTrails();
    }
  });
});

dialog.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form).entries());
  submitButton.disabled = true;
  submitButton.textContent = 'Saving trail…';
  formMessage.hidden = true;

  try {
    const response = await fetch('/api/trails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The trail could not be saved.');
    dialog.close();
    showToast(`${result.trailName} was added to the trail board.`);
    await loadTrails();
  } catch (error) {
    formMessage.textContent = error.message || 'The trail could not be saved. Please try again.';
    formMessage.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save trail <span aria-hidden="true">→</span>';
  }
});

async function initialize() {
  try {
    const response = await fetch('/api/trails');
    const trails = await response.json();
    if (!response.ok) throw new Error(trails.error || 'The trail catalogue could not be loaded.');
    populateRegions(trails);
    renderTrails(trails);
  } catch (error) {
    trailList.innerHTML = '';
    resultCount.textContent = '—';
    listSummary.textContent = 'UNAVAILABLE';
    emptyState.textContent = error.message || 'The trail catalogue could not be reached. Please try again.';
    emptyState.hidden = false;
  }
  await initializeMapService();
}

initialize();
