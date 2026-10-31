const destinations = document.querySelector('#destinations');
const resultCount = document.querySelector('#resultCount');
const emptyState = document.querySelector('#emptyState');
const dialog = document.querySelector('#destinationDialog');
const form = document.querySelector('#destinationForm');
const formMessage = document.querySelector('#formMessage');
const toast = document.querySelector('#toast');
const filterInputs = ['search', 'continent', 'type', 'maxBudget'].map((id) => document.querySelector(`#${id}`));

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function cardTemplate(destination, index) {
  const fallback = `https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=80`;
  return `<article class="destination-card" style="animation-delay:${index * 70}ms"><img class="destination-image" src="${escapeHtml(destination.imageUrl || fallback)}" alt="Landscape in ${escapeHtml(destination.name)}" loading="lazy" onerror="this.src='${fallback}'"><div class="destination-body"><div class="card-meta"><span>${escapeHtml(destination.continent)}</span><span>${escapeHtml(destination.type)}</span></div><h3>${escapeHtml(destination.name)}</h3><p>${escapeHtml(destination.description)}</p><div class="card-footer"><span>${escapeHtml(destination.country)} / ${escapeHtml(destination.bestSeason)}</span><span class="price">$${Number(destination.budget).toLocaleString()} / day</span></div></div></article>`;
}

async function loadDestinations() {
  const query = new URLSearchParams();
  filterInputs.forEach((input) => { if (input.value) query.set(input.id, input.value); });
  try {
    const response = await fetch(`/api/destinations?${query}`);
    if (!response.ok) throw new Error('Catalogue unavailable');
    const entries = await response.json();
    resultCount.textContent = entries.length;
    destinations.innerHTML = entries.map(cardTemplate).join('');
    emptyState.hidden = entries.length > 0;
  } catch (error) {
    destinations.innerHTML = '';
    emptyState.textContent = 'The catalogue could not be reached. Please try again.';
    emptyState.hidden = false;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

document.querySelector('#openForm').addEventListener('click', () => { form.reset(); formMessage.hidden = true; dialog.showModal(); });
document.querySelector('#closeForm').addEventListener('click', () => dialog.close());
document.querySelector('#clearFilters').addEventListener('click', () => { filterInputs.forEach((input) => { input.value = ''; }); loadDestinations(); });
filterInputs.forEach((input) => input.addEventListener(input.id === 'search' ? 'input' : 'change', loadDestinations));

dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const imageFile = document.querySelector('#imageFile').files[0];
  submitButton.disabled = true;
  submitButton.textContent = 'Saving...';
  formMessage.hidden = true;
  try {
    let imageUrl = formData.get('imageUrl');
    if (imageFile) {
      const uploadData = new FormData();
      uploadData.append('image', imageFile);
      const uploadResponse = await fetch('/api/upload', { method: 'POST', body: uploadData });
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadResult.error);
      imageUrl = uploadResult.imageUrl;
    }
    const payload = Object.fromEntries(formData.entries());
    payload.imageUrl = imageUrl;
    const response = await fetch('/api/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save destination.');
    dialog.close();
    showToast(`${result.name} was added to the atlas.`);
    await loadDestinations();
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Save to the atlas <span>→</span>';
  }
});

loadDestinations();
