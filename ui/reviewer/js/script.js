// ============================================================
//  Tax Assessor Review Interface — script.js
//  City of Philadelphia — Office of Property Assessment
//
//  Depends on: Leaflet, ../js/opa-api.js (OPA object)
// ============================================================

'use strict';

// ── State ────────────────────────────────────────────────────

let map;
let markers               = [];
let props                 = [];
let selectedIdx           = null;
let boundaryLayer         = null;
let currentBoundaryType   = 'none';
let selectedBoundaryLayer = null;   // currently highlighted polygon
const boundaryCache       = {};
let boundaryLoadId        = 0;      // incremented on each setBoundary call to cancel stale fetches

// Basemap layers (populated in initMap)
const baseLayers = {};
let currentBasemap = null;

// ── Boundary Configuration ────────────────────────────────────

const BOUNDARY_APIS = {
  // Local GeoJSON file (served relative to index.html)
  neighborhood: '../assets/philadelphia-neighborhoods.geojson',
  census:       'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Census_Tracts_2010/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson',
  zipcode:      'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Zipcodes_Poly/FeatureServer/0/query?outFields=*&where=1%3D1&f=geojson',
};

// Primary field for each boundary type's display name (checked first)
const BOUNDARY_NAME_FIELDS = {
  neighborhood: ['MAPNAME', 'NAME', 'name'],
  census:       ['NAMELSAD10', 'NAME10', 'TRACTCE10', 'GEOID10'],
  zipcode:      ['code', 'CODE', 'ZIP_CODE', 'ZIPCODE'],   // service uses lowercase 'code'
};

const BOUNDARY_LABELS = {
  none:         { filter: 'Neighborhood',    allOption: 'All Neighborhoods' },
  neighborhood: { filter: 'Neighborhood',    allOption: 'All Neighborhoods' },
  census:       { filter: 'Census Tract',    allOption: 'All Census Tracts' },
  zipcode:      { filter: 'ZIP Code',        allOption: 'All ZIP Codes' },
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

  input.addEventListener('input',   () => suggest(input.value.trim()));
  input.addEventListener('blur',    () => setTimeout(closeDropdown, 150));
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

  baseLayers.light = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { attribution: '&copy; OpenStreetMap contributors &copy; CARTO | City of Philadelphia OPA', subdomains: 'abcd', maxZoom: 20 }
  );
  baseLayers.dark = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    { attribution: '&copy; OpenStreetMap contributors &copy; CARTO | City of Philadelphia OPA', subdomains: 'abcd', maxZoom: 20 }
  );
  baseLayers.osm = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | City of Philadelphia OPA', maxZoom: 19 }
  );
  baseLayers.satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA | City of Philadelphia OPA', maxZoom: 19 }
  );
  baseLayers.topo = L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap | City of Philadelphia OPA', maxZoom: 17 }
  );

  currentBasemap = baseLayers.light;
  currentBasemap.addTo(map);
}

function setBasemap(value) {
  const next = baseLayers[value] || baseLayers.light;
  if (next === currentBasemap) return;
  if (currentBasemap) map.removeLayer(currentBasemap);
  currentBasemap = next;
  currentBasemap.addTo(map);
  // Keep boundary and markers on top
  if (boundaryLayer) boundaryLayer.bringToFront();
  markers.forEach(m => m.bringToFront && m.bringToFront());
}

function clearMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
}

function addMarkers(propList) {
  propList.forEach((prop, idx) => {
    if (!prop.lat || !prop.lng) return;
    const m = L.circleMarker([prop.lat, prop.lng], {
      radius: 7, color: '#fff', weight: 2,
      fillColor: '#0f4d90', fillOpacity: 0.85,
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
    <div class="map-popup-pid">OPA #: ${escHtml(prop.parcel_number || 'N/A')}</div>
    <div class="map-popup-value">Value: ${fmtMoney(prop.market_value)}</div>
  </div>`;
}

function fitAllMarkers() {
  if (!markers.length) return;
  map.fitBounds(L.featureGroup(markers).getBounds().pad(0.15));
}

function locateUser() {
  map.locate({ setView: true, maxZoom: 16 });
}

// ── Boundary Layers ───────────────────────────────────────────

function getBoundaryDisplayName(properties, type) {
  const fields = BOUNDARY_NAME_FIELDS[type] || [];
  for (const f of fields) {
    if (properties[f] != null && String(properties[f]).trim() !== '') {
      return String(properties[f]).trim();
    }
  }
  // Fallback: first non-null primitive value
  for (const [, v] of Object.entries(properties)) {
    if (v != null && typeof v !== 'object' && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return 'Unknown';
}

// ── Boundary highlight ────────────────────────────────────────

const STYLE_DEFAULT  = { color: '#0f4d90', weight: 1.5, fillOpacity: 0.04, fillColor: '#0f4d90', opacity: 0.65 };
const STYLE_SELECTED = { color: '#0f4d90', weight: 2.5, fillOpacity: 0.18, fillColor: '#0f4d90', opacity: 0.9 };

function selectBoundaryPolygon(layer, name) {
  // Reset previous highlight
  if (selectedBoundaryLayer) selectedBoundaryLayer.setStyle(STYLE_DEFAULT);
  layer.setStyle(STYLE_SELECTED);
  layer.bringToFront();
  selectedBoundaryLayer = layer;

  // Auto-fill the sidebar filter
  const select = document.getElementById('filterBoundary');
  for (const opt of select.options) {
    if (opt.value === name) { select.value = name; break; }
  }
}

async function setBoundary(type, btn) {
  // Increment the load ID — any in-flight fetch for a previous call will see
  // its ID is stale and bail out, preventing layer overlap.
  const myLoadId = ++boundaryLoadId;

  currentBoundaryType   = type;
  selectedBoundaryLayer = null;
  document.querySelectorAll('.boundary-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  // Remove existing boundary layer immediately (synchronous — no race here)
  if (boundaryLayer) { map.removeLayer(boundaryLayer); boundaryLayer = null; }

  const conf = BOUNDARY_LABELS[type] || BOUNDARY_LABELS.none;
  document.getElementById('boundaryFilterLabel').textContent = conf.filter;

  if (type === 'none') {
    document.getElementById('filterBoundary').innerHTML =
      `<option value="">${conf.allOption}</option>`;
    return;
  }

  // Show loading indicator in the dropdown while fetching
  document.getElementById('filterBoundary').innerHTML = '<option>Loading…</option>';

  try {
    if (!boundaryCache[type]) {
      const res = await fetch(BOUNDARY_APIS[type]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      boundaryCache[type] = await res.json();
    }

    // Another setBoundary call was made while we were awaiting — discard this result
    if (myLoadId !== boundaryLoadId) return;

    const geojson = boundaryCache[type];

    // Render boundary polygons on the map
    boundaryLayer = L.geoJSON(geojson, {
      style: STYLE_DEFAULT,
      onEachFeature: (feature, layer) => {
        const name = getBoundaryDisplayName(feature.properties, type);
        layer.bindTooltip(escHtml(name), {
          sticky:    true,
          className: 'boundary-tooltip',
          direction: 'top',
        });
        // Click polygon → highlight + auto-fill sidebar filter
        layer.on('click', () => selectBoundaryPolygon(layer, name));
      },
    }).addTo(map);

    // Build sorted, deduplicated list of area names for the filter dropdown
    const names = [
      ...new Set(
        geojson.features
          .map(f => getBoundaryDisplayName(f.properties, type))
          .filter(n => n && n !== 'Unknown')
      ),
    ].sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });

    document.getElementById('filterBoundary').innerHTML =
      `<option value="">${conf.allOption}</option>` +
      names.map(n => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');

  } catch (err) {
    if (myLoadId !== boundaryLoadId) return;
    console.error('[reviewer] setBoundary failed:', err);
    document.getElementById('filterBoundary').innerHTML =
      `<option value="">${conf.allOption}</option>`;
  }
}

// ── Load properties ──────────────────────────────────────────

async function loadProperties(filters) {
  setLoadingState(true);
  try {
    // Fly to geocoded location immediately if coordinates were provided
    if (filters._lat && filters._lng) {
      map.flyTo([filters._lat, filters._lng], 16, { duration: 0.8 });
    }

    const results = await OPA.filterProperties(filters, 100);
    props = results;
    clearMarkers();
    addMarkers(props);
    updateStats(props);
    if (props.length) fitAllMarkers();
    document.getElementById('mapCenter').textContent =
      props.length ? `${props.length} result${props.length !== 1 ? 's' : ''}` : 'No results';
  } catch (err) {
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
  const address     = document.getElementById('addressSearch').value.trim();
  const boundaryVal = document.getElementById('filterBoundary').value;
  const typeLabel   = document.getElementById('filterType').value;
  const minVal      = document.getElementById('valMin').value.trim();
  const maxVal      = document.getElementById('valMax').value.trim();

  const filters = {};
  if (address)     filters.address = address;
  if (boundaryVal && currentBoundaryType !== 'none') {
    filters.boundaryType  = currentBoundaryType;
    filters.boundaryValue = boundaryVal;
  }
  if (typeLabel)   filters.buildingKeyword = typeLabel;
  if (minVal)      filters.minValue = minVal;
  if (maxVal)      filters.maxValue = maxVal;

  if (!Object.keys(filters).length) {
    alert('Please enter an address or select at least one filter.');
    return;
  }
  loadProperties(filters);
}

function resetFilters() {
  // Cancel any in-flight boundary fetch
  boundaryLoadId++;

  // Clear form fields
  ['addressSearch', 'filterType', 'valMin', 'valMax', 'filterStatus', 'changeThreshold']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

  // Remove boundary layer from map and reset all boundary UI state
  if (boundaryLayer) { map.removeLayer(boundaryLayer); boundaryLayer = null; }
  selectedBoundaryLayer = null;
  currentBoundaryType   = 'none';
  document.querySelectorAll('.boundary-btn').forEach(b => b.classList.remove('active'));
  const noneBtn = document.querySelector('.boundary-btn[data-boundary="none"]');
  if (noneBtn) noneBtn.classList.add('active');
  document.getElementById('boundaryFilterLabel').textContent = BOUNDARY_LABELS.none.filter;
  document.getElementById('filterBoundary').innerHTML =
    `<option value="">${BOUNDARY_LABELS.none.allOption}</option>`;

  clearMarkers();
  props = [];
  selectedIdx = null;
  updateStats([]);
  deselectProperty();
  document.getElementById('mapCenter').textContent = 'Philadelphia, PA';
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
          <span>OPA ${escHtml(p.parcel_number || 'N/A')}</span>
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

  if (!fromMap && markers[idx]) {
    map.flyTo(markers[idx].getLatLng(), 17, { duration: 0.8 });
    markers[idx].openPopup();
  }

  renderPropertyCard(prop);
}

// ── Property card (right panel, replaces City Overview on selection) ──

function renderPropertyCard(prop) {
  // -- Values to display (all sourced from real data; shown as — until backend provides them)
  const addr          = prop.location        ? titleCase(prop.location)          : '—';
  const propertyId    = prop.parcel_number   || '—';
  const taxYearVal    = prop.tax_year_assessed_value  != null
                          ? fmtMoney(prop.tax_year_assessed_value)  : '—';
  const currentVal    = prop.current_assessed_value   != null
                          ? fmtMoney(prop.current_assessed_value)   : '—';

  // Difference and percent change (computed when both values available)
  let diffDollars = '—';
  let diffPct     = '—';
  let diffClass   = '';
  if (prop.tax_year_assessed_value != null && prop.current_assessed_value != null) {
    const delta = prop.current_assessed_value - prop.tax_year_assessed_value;
    const pct   = prop.tax_year_assessed_value !== 0
                    ? (delta / prop.tax_year_assessed_value) * 100 : null;
    diffDollars = (delta >= 0 ? '+' : '') + fmtMoney(delta);
    diffPct     = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%' : '—';
    diffClass   = delta > 0 ? 'pc-positive' : delta < 0 ? 'pc-negative' : '';
  }

  // Update DOM
  document.getElementById('pcAddress').textContent       = addr;
  document.getElementById('pcPropertyId').textContent    = propertyId;
  document.getElementById('pcAddressDetail').textContent = addr;
  document.getElementById('pcTaxYearValue').textContent  = taxYearVal;
  document.getElementById('pcCurrentValue').textContent  = currentVal;

  const diffDolEl = document.getElementById('pcDiffDollars');
  diffDolEl.textContent = diffDollars;
  diffDolEl.className   = 'pc-value pc-change-dollars ' + diffClass;

  const diffPctEl = document.getElementById('pcDiffPct');
  diffPctEl.textContent = diffPct;
  diffPctEl.className   = 'pc-value pc-change-pct ' + diffClass;

  // Toggle panels
  document.getElementById('cityOverviewPanel').style.display   = 'none';
  document.getElementById('propertyCardPanel').style.display   = '';
}

function deselectProperty() {
  selectedIdx = null;
  document.getElementById('propertyCardPanel').style.display = 'none';
  document.getElementById('cityOverviewPanel').style.display = '';
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
}

// ── Loading state ─────────────────────────────────────────────

function setLoadingState(on) {
  const btn = document.querySelector('.sidebar-body button.btn-primary');
  if (btn) { btn.textContent = on ? 'Loading…' : 'Apply Filters'; btn.disabled = on; }
}

// ── Assessment Distribution Chart ────────────────────────────

const DIST_DATA_URL = 'https://storage.googleapis.com/musa5090s26-team4-public/configs/tax_year_assessment_bins.json';
const DISPLAY_CAP   = 1_500_000;
const TAIL_LABEL    = '≥$1.5M';

let distChartInstance = null;
let distAllData       = null;   // cached raw data
let distActiveYear    = null;   // currently displayed year

// Build {labels, counts} for a given year from raw data
function buildChartData(rawData, year) {
  const rows = rawData
    .filter(r => r.tax_year === year)
    .sort((a, b) => a.lower_bound - b.lower_bound);

  const labels = [];
  const counts = [];
  let tailCount = 0;

  for (const row of rows) {
    if (row.lower_bound >= DISPLAY_CAP) {
      tailCount += row.property_count;
    } else {
      const lo = row.lower_bound;
      const hi = row.upper_bound;
      labels.push(lo === 0 ? `<$${(hi / 1000).toFixed(0)}K` : `$${(lo / 1000).toFixed(0)}K`);
      counts.push(row.property_count);
    }
  }
  if (tailCount > 0) { labels.push(TAIL_LABEL); counts.push(tailCount); }
  return { labels, counts };
}

// Switch the chart to a different year (data already loaded)
function switchDistYear(year) {
  distActiveYear = year;

  // Update button active state
  document.querySelectorAll('.year-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.year) === year);
  });

  const { labels, counts } = buildChartData(distAllData, year);

  if (distChartInstance) {
    distChartInstance.updateOptions({
      series:  [{ name: 'Properties', data: counts }],
      xaxis:   { categories: labels },
    }, false, true);
  }
}

// Initial load: fetch data, build year buttons, render default year
async function loadTaxYearDistribution() {
  const msgEl = document.getElementById('ovDistMsg');
  try {
    const res = await fetch(DIST_DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    distAllData = await res.json();

    // Collect years sorted ascending; exclude years with incomplete data
    const EXCLUDED_YEARS = new Set([2021, 2023]);
    const countByYear = {};
    for (const row of distAllData) {
      if (EXCLUDED_YEARS.has(row.tax_year)) continue;
      countByYear[row.tax_year] = (countByYear[row.tax_year] || 0) + row.property_count;
    }
    const sortedYears = Object.keys(countByYear).map(Number).sort((a, b) => a - b);
    const defaultYear = sortedYears.reduce((best, y) =>
      countByYear[y] > countByYear[best] ? y : best, sortedYears[0]);

    // Build year selector buttons
    const selectorEl = document.getElementById('yearSelector');
    if (selectorEl) {
      selectorEl.innerHTML = sortedYears.map(y => `
        <button type="button"
          class="year-btn${y === defaultYear ? ' active' : ''}"
          data-year="${y}"
          onclick="switchDistYear(${y})"
          title="${countByYear[y].toLocaleString()} properties"
        >${y}</button>`).join('');
    }

    // Remove loading placeholder and create chart
    if (msgEl) msgEl.remove();
    if (distChartInstance) { distChartInstance.destroy(); distChartInstance = null; }

    distActiveYear = defaultYear;
    const { labels, counts } = buildChartData(distAllData, defaultYear);

    const el = document.getElementById('ovDistChart');
    distChartInstance = new ApexCharts(el, {
      chart: {
        type:       'bar',
        height:     200,
        toolbar:    { show: false },
        animations: { enabled: false },
        fontFamily: 'Open Sans, sans-serif',
      },
      series: [{ name: 'Properties', data: counts }],
      xaxis: {
        categories: labels,
        tickAmount: 10,
        labels: {
          rotate: -45,
          style:  { fontSize: '9px', colors: '#555' },
        },
        axisBorder: { show: false },
        axisTicks:  { show: false },
      },
      yaxis: {
        labels: {
          style:     { fontSize: '9px', colors: '#555' },
          formatter: v => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v,
        },
      },
      plotOptions: {
        bar: { borderRadius: 1, columnWidth: '95%' },
      },
      dataLabels: { enabled: false },
      colors:     ['#0f4d90'],
      grid: {
        borderColor:     '#e8e8e8',
        strokeDashArray: 3,
        xaxis:           { lines: { show: false } },
      },
      tooltip: {
        followCursor: true,
        y: { formatter: v => v.toLocaleString('en-US') + ' properties' },
      },
    });
    distChartInstance.render();

  } catch (err) {
    console.error('[reviewer] loadTaxYearDistribution:', err);
    if (msgEl) msgEl.textContent = 'Failed to load distribution data.';
  }
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadTaxYearDistribution();

  // Autocomplete: geocode the address and fly map to result, then attempt property search
  setupAutocomplete('addressSearch', prop => {
    if (prop.lat && prop.lng) {
      map.flyTo([prop.lat, prop.lng], 16, { duration: 0.8 });
    }
    loadProperties({ address: prop.location, _lat: prop.lat, _lng: prop.lng });
  });

  document.getElementById('addressSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchAddress();
  });
});
