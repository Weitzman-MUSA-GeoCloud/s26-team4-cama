// ============================================================
//  Tax Assessor Review Interface — script.js
//  City of Philadelphia — Office of Property Assessment
//
//  Depends on: Leaflet, ../js/opa-api.js (OPA object)
// ============================================================

'use strict';

// ── State ────────────────────────────────────────────────────

let map;
let markers     = [];
let props       = [];
let selectedIdx = null;
let overlayMode = 'type';

const NOTES_KEY = 'opa_assessor_notes';

const NEIGHBORHOOD_ZIPS = {
  'Center City':        ['19103', '19102', '19107', '19106'],
  'Fishtown':           ['19125'],
  'Northern Liberties': ['19123'],
  'Kensington':         ['19134', '19133'],
  'West Philadelphia':  ['19143', '19139', '19104', '19151'],
  'South Philadelphia': ['19148', '19145', '19146', '19147'],
  'Germantown':         ['19144', '19138'],
  'Chestnut Hill':      ['19118'],
  'Roxborough':         ['19128'],
  'Manayunk':           ['19127'],
};

const TYPE_KEYWORDS = {
  'Residential (Single Family)': 'SINGLE',
  'Residential (Multi-Family)':  'MULTI',
  'Commercial':                  'COMMERCIAL',
  'Industrial':                  'INDUSTRIAL',
  'Vacant Land':                 'VACANT',
  'Mixed Use':                   'MIXED',
  'Tax Exempt':                  'EXEMPT',
};

// ── Utilities ────────────────────────────────────────────────

function fmtMoney(val) {
  const n = parseInt(val, 10);
  if (!n && n !== 0) return '—';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US');
}

function titleCase(str) {
  return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Autocomplete ─────────────────────────────────────────────

function setupAutocomplete(inputId, onSelect) {
  const input    = document.getElementById(inputId);
  const wrap     = input.closest('.search-input-wrap');
  const dropdown = document.createElement('ul');
  dropdown.className = 'autocomplete-list';
  wrap.appendChild(dropdown);

  let currentResults = [];

  const suggest = debounce(async (query) => {
    if (query.length < 3) { closeDropdown(); return; }

    dropdown.innerHTML = '<li class="autocomplete-status">Searching…</li>';
    dropdown.classList.add('open');

    try {
      const results = await OPA.searchByAddress(query, 8);
      currentResults = results;

      if (!results.length) {
        dropdown.innerHTML = '<li class="autocomplete-status">No addresses found.</li>';
        return;
      }

      dropdown.innerHTML = results.map((prop, i) => `
        <li class="autocomplete-item" data-idx="${i}" tabindex="0">
          <span class="autocomplete-item-addr">${escHtml(titleCase(prop.location))}</span>
          <span class="autocomplete-item-zip">${escHtml(prop.zip_code || '')}</span>
        </li>`).join('');

      dropdown.querySelectorAll('.autocomplete-item').forEach(li => {
        li.addEventListener('mousedown', e => {
          e.preventDefault();
          const prop = currentResults[parseInt(li.dataset.idx, 10)];
          input.value = titleCase(prop.location);
          closeDropdown();
          onSelect(prop);
        });
      });

    } catch {
      dropdown.innerHTML = '<li class="autocomplete-status">Error loading suggestions.</li>';
    }
  }, 320);

  input.addEventListener('input',  () => suggest(input.value.trim()));
  input.addEventListener('blur',   () => setTimeout(closeDropdown, 150));
  input.addEventListener('keydown', e => { if (e.key === 'Escape') closeDropdown(); });

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    currentResults = [];
  }
}

// ── Map ──────────────────────────────────────────────────────

function initMap() {
  map = L.map('map', { center: [39.9526, -75.1652], zoom: 12 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO | City of Philadelphia OPA',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);
}

function clearMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
}

function addMarkers(propList) {
  propList.forEach((prop, idx) => {
    const color = getPropColor(prop);
    const m = L.circleMarker([prop.lat, prop.lng], {
      radius: 7, color: '#fff', weight: 2,
      fillColor: color, fillOpacity: 0.85,
    })
      .bindPopup(buildPopup(prop), { maxWidth: 220 })
      .addTo(map);
    m.on('click', () => selectProperty(idx, true));
    markers.push(m);
  });
}

function buildPopup(prop) {
  return `<div>
    <div class="map-popup-address">${escHtml(titleCase(prop.location))}</div>
    <div class="map-popup-pid">OPA #: ${escHtml(prop.parcel_number)}</div>
    <div class="map-popup-value">Value: ${fmtMoney(prop.market_value)}</div>
  </div>`;
}

function getPropColor(prop) {
  if (overlayMode === 'type') {
    const d = (prop.building_code_description || '').toUpperCase();
    if (d.includes('VACANT'))                                       return '#3a833c';
    if (d.includes('COMMERCIAL') || d.includes('STORE') || d.includes('OFFICE')) return '#f99300';
    if (d.includes('INDUSTRIAL') || d.includes('GARAGE'))          return '#888888';
    if (d.includes('MIXED'))                                        return '#9b59b6';
  }
  return '#0f4d90';
}

function fitAllMarkers() {
  if (!markers.length) return;
  map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15));
}

function locateUser() {
  map.locate({ setView: true, maxZoom: 16 });
}

// ── Legend ───────────────────────────────────────────────────

function renderLegend() {
  const LEGENDS = {
    type: `
      <div class="map-legend-title">Property Type</div>
      <div class="legend-item"><div class="legend-dot" style="background:#0f4d90"></div> Residential</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f99300"></div> Commercial</div>
      <div class="legend-item"><div class="legend-dot" style="background:#888888"></div> Industrial</div>
      <div class="legend-item"><div class="legend-dot" style="background:#3a833c"></div> Vacant Land</div>
      <div class="legend-item"><div class="legend-dot" style="background:#9b59b6"></div> Mixed Use</div>`,
    status: `
      <div class="map-legend-title">Review Status</div>
      <div class="legend-item"><div class="legend-dot" style="background:#0f4d90"></div> Pending Review</div>`,
    change: `
      <div class="map-legend-title">Value Change</div>
      <div class="legend-item"><div class="legend-dot" style="background:#0f4d90"></div> Properties</div>`,
  };
  document.getElementById('mapLegend').innerHTML = LEGENDS[overlayMode] || LEGENDS.type;
}

function updateMapOverlay(value) {
  overlayMode = value;
  markers.forEach((m, i) => m.setStyle({ fillColor: getPropColor(props[i]) }));
  renderLegend();
}

// ── Load properties ──────────────────────────────────────────

async function loadProperties(filters) {
  setLoadingState(true);
  try {
    const results = await OPA.filterProperties(filters, 100);
    props = results;
    clearMarkers();
    addMarkers(props);
    renderList(props);
    updateStats(props);
    renderLegend();
    if (props.length) fitAllMarkers();
    document.getElementById('mapCenter').textContent =
      props.length ? `${props.length} result${props.length !== 1 ? 's' : ''}` : 'No results';
  } catch (err) {
    renderListError('Error loading properties. Please try again.');
    console.error('[reviewer] loadProperties:', err);
  }
  setLoadingState(false);
}

// ── Search & Filters ─────────────────────────────────────────

function searchAddress() {
  const address = document.getElementById('addressSearch').value.trim();
  if (!address) return;
  loadProperties({ address });
}

function applyFilters() {
  const address  = document.getElementById('addressSearch').value.trim();
  const nbhLabel = document.getElementById('filterNeighborhood').value;
  const typeLabel = document.getElementById('filterType').value;
  const minVal   = document.getElementById('valMin').value.trim();
  const maxVal   = document.getElementById('valMax').value.trim();

  const filters = {};
  if (address)  filters.address = address;
  if (nbhLabel && NEIGHBORHOOD_ZIPS[nbhLabel]) filters.zipCodes = NEIGHBORHOOD_ZIPS[nbhLabel];
  if (typeLabel && TYPE_KEYWORDS[typeLabel])   filters.buildingKeyword = TYPE_KEYWORDS[typeLabel];
  if (minVal)   filters.minValue = minVal;
  if (maxVal)   filters.maxValue = maxVal;

  if (!Object.keys(filters).length) {
    alert('Please enter an address or select at least one filter.');
    return;
  }
  loadProperties(filters);
}

function resetFilters() {
  ['addressSearch', 'filterNeighborhood', 'filterType',
   'valMin', 'valMax', 'filterStatus', 'changeThreshold']
    .forEach(id => { document.getElementById(id).value = ''; });

  clearMarkers();
  props = [];
  selectedIdx = null;
  renderList([]);
  updateStats([]);
  document.getElementById('mapCenter').textContent = 'Philadelphia, PA';
  document.getElementById('detailContent').innerHTML = `
    <div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      <span class="text-sm">Select a property to view details</span>
    </div>`;
}

// ── Property list ─────────────────────────────────────────────

function renderList(propList) {
  const ul = document.getElementById('propList');
  if (!propList.length) {
    ul.innerHTML = `
      <li style="padding:1.5rem;text-align:center;color:var(--phila-text-muted);font-size:13px;">
        No properties to display.<br>Use the search or filters to load results.
      </li>`;
    return;
  }
  ul.innerHTML = propList.map((p, i) => {
    const typeShort = (p.building_code_description || 'Unknown').split(/[(/]/)[0].trim();
    return `
      <li class="prop-item" onclick="selectProperty(${i})">
        <div class="prop-addr">${escHtml(titleCase(p.location))}</div>
        <div class="prop-meta">
          <span>OPA ${escHtml(p.parcel_number)}</span>
          <span>${fmtMoney(p.market_value)}</span>
        </div>
        <div class="prop-tags">
          <span class="badge badge-blue">${escHtml(typeShort)}</span>
          ${p.zip_code ? `<span class="badge badge-gray">${escHtml(p.zip_code)}</span>` : ''}
        </div>
      </li>`;
  }).join('');
}

function renderListError(msg) {
  document.getElementById('propList').innerHTML =
    `<li style="padding:1rem;color:var(--phila-red);font-size:13px;">${escHtml(msg)}</li>`;
}

// ── Property selection ───────────────────────────────────────

function selectProperty(idx, fromMap = false) {
  selectedIdx = idx;
  const prop = props[idx];
  if (!prop) return;

  document.querySelectorAll('.prop-item').forEach((li, i) =>
    li.classList.toggle('selected', i === idx));

  const items = document.querySelectorAll('.prop-item');
  if (items[idx]) items[idx].scrollIntoView({ block: 'nearest' });

  if (!fromMap && markers[idx]) {
    map.flyTo(markers[idx].getLatLng(), 17, { duration: 0.8 });
    markers[idx].openPopup();
  }

  switchTab('detail', document.querySelector('.tab-btn:nth-child(2)'));
  renderDetail(prop);

  document.getElementById('notePropLabel').textContent =
    titleCase(prop.location) + ' (OPA ' + prop.parcel_number + ')';

  const notes = getSavedNotes();
  document.getElementById('assessorNotes').value = notes[prop.parcel_number] || '';
  document.getElementById('recommendedAction').value = '';
}

// ── Detail pane ───────────────────────────────────────────────

function renderDetail(prop) {
  const addr    = titleCase(prop.location);
  const owner   = [prop.owner_1, prop.owner_2].filter(Boolean).map(titleCase).join(', ') || '—';
  const area    = prop.total_livable_area ? Number(prop.total_livable_area).toLocaleString() + ' sq ft' : '—';
  const lotArea = prop.total_area         ? Number(prop.total_area).toLocaleString() + ' sq ft' : '—';
  const saleDate = prop.sale_date ? prop.sale_date.split('T')[0] : '—';

  document.getElementById('detailContent').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Property Identification</div>
      <div class="detail-row"><span class="dl">Address</span><span class="dv">${escHtml(addr)}</span></div>
      <div class="detail-row"><span class="dl">OPA #</span><span class="dv">${escHtml(prop.parcel_number)}</span></div>
      <div class="detail-row"><span class="dl">ZIP Code</span><span class="dv">${escHtml(prop.zip_code || '—')}</span></div>
      <div class="detail-row"><span class="dl">Zoning</span><span class="dv">${escHtml(prop.zoning || '—')}</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Ownership</div>
      <div class="detail-row"><span class="dl">Owner(s)</span><span class="dv">${escHtml(owner)}</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Assessment &amp; Sales</div>
      <div class="detail-row"><span class="dl">Market Value</span><span class="dv">${fmtMoney(prop.market_value)}</span></div>
      <div class="detail-row"><span class="dl">Last Sale Price</span><span class="dv">${fmtMoney(prop.sale_price)}</span></div>
      <div class="detail-row"><span class="dl">Last Sale Date</span><span class="dv">${escHtml(saleDate)}</span></div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Property Characteristics</div>
      <div class="detail-row"><span class="dl">Type</span><span class="dv">${escHtml(prop.building_code_description || '—')}</span></div>
      <div class="detail-row"><span class="dl">Year Built</span><span class="dv">${escHtml(String(prop.year_built || '—'))}</span></div>
      <div class="detail-row"><span class="dl">Livable Area</span><span class="dv">${escHtml(area)}</span></div>
      <div class="detail-row"><span class="dl">Lot Area</span><span class="dv">${escHtml(lotArea)}</span></div>
      <div class="detail-row"><span class="dl">Bedrooms</span><span class="dv">${escHtml(String(prop.number_of_bedrooms || '—'))}</span></div>
      <div class="detail-row"><span class="dl">Bathrooms</span><span class="dv">${escHtml(String(prop.number_of_bathrooms || '—'))}</span></div>
    </div>`;
}

// ── Stats bar ─────────────────────────────────────────────────

function updateStats(propList) {
  const count = propList.length;
  const avg   = count
    ? Math.round(propList.reduce((s, p) => s + (parseInt(p.market_value, 10) || 0), 0) / count)
    : 0;
  document.getElementById('mapCount').textContent  = count;
  document.getElementById('statCount').textContent = count;
  document.getElementById('statAvg').textContent   = count ? fmtMoney(avg) : '—';
  document.getElementById('statFlagged').textContent = '—';
}

// ── Tabs ─────────────────────────────────────────────────────

function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const pane = document.getElementById(`pane-${name}`);
  if (pane) pane.classList.add('active');
}

// ── Notes ────────────────────────────────────────────────────

function getSavedNotes() {
  try { return JSON.parse(sessionStorage.getItem(NOTES_KEY) || '{}'); }
  catch { return {}; }
}

function saveNote() {
  if (selectedIdx === null) { alert('Select a property first.'); return; }
  const prop  = props[selectedIdx];
  const text  = document.getElementById('assessorNotes').value.trim();
  const notes = getSavedNotes();
  if (text) notes[prop.parcel_number] = text;
  else delete notes[prop.parcel_number];
  sessionStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  alert('Note saved.');
}

function clearNote() {
  document.getElementById('assessorNotes').value = '';
}

function submitReview() {
  if (selectedIdx === null) { alert('Select a property first.'); return; }
  const action = document.getElementById('recommendedAction').value;
  if (!action) { alert('Select a recommended action.'); return; }
  const prop = props[selectedIdx];
  const note = document.getElementById('assessorNotes').value.trim();
  // TODO: POST to CAMA backend when available
  alert(`Review submitted for ${titleCase(prop.location)}.\nAction: ${action}${note ? '\nNote: ' + note : ''}`);
}

// ── Loading state ─────────────────────────────────────────────

function setLoadingState(on) {
  const btn = document.querySelector('.sidebar-body button.btn-primary');
  if (btn) { btn.textContent = on ? 'Loading…' : 'Apply Filters'; btn.disabled = on; }
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderLegend();
  renderList([]);

  // Autocomplete: selecting a suggestion immediately triggers a property search
  setupAutocomplete('addressSearch', prop => {
    loadProperties({ address: prop.location });
  });

  document.getElementById('addressSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchAddress();
  });
});
