// ============================================================
//  Property Owner Widget — script.js
//  City of Philadelphia — Office of Property Assessment
//
//  Depends on: Leaflet, ../js/opa-api.js (OPA object)
// ============================================================

'use strict';

let widgetMap;
let widgetMarker = null;

const ADDRESS_ZOOM = 17;

// ── Property tile layer ──────────────────────────────────────
const PROPERTY_TILE_URL   = 'https://storage.googleapis.com/musa5090s26-team4-public/tiles/properties/{z}/{x}/{y}.pbf';
const PROPERTY_LAYER_NAME = 'property_tile_info';

let propertyTileLayer = null;
let propertyHoverPopup = null;

const VALUE_BREAKS = [
  { limit:   50_000, color: '#ffffb2' },
  { limit:  100_000, color: '#fecc5c' },
  { limit:  200_000, color: '#fd8d3c' },
  { limit:  350_000, color: '#f03b20' },
  { limit:  600_000, color: '#bd0026' },
  { limit: Infinity, color: '#67001f' },
];

function getValueColor(value) {
  const v = parseInt(value, 10);
  if (!v || v <= 0) return '#aaaaaa';
  for (const { limit, color } of VALUE_BREAKS) {
    if (v < limit) return color;
  }
  return '#67001f';
}

function tileFeatureStyle(properties) {
  return {
    fill:        true,
    fillColor:   getValueColor(properties.predicted_value),
    fillOpacity: 0.75,
    weight:      0.4,
    color:       '#666',
    opacity:     0.6,
  };
}

const LEGEND_HTML = `
  <div class="map-legend-title">Current Assessed Value</div>
  <div class="map-legend-item"><span class="map-legend-swatch" style="background:#aaaaaa"></span>No data</div>
  <div class="map-legend-item"><span class="map-legend-swatch" style="background:#ffffb2"></span>&lt; $50K</div>
  <div class="map-legend-item"><span class="map-legend-swatch" style="background:#fecc5c"></span>$50K – $100K</div>
  <div class="map-legend-item"><span class="map-legend-swatch" style="background:#fd8d3c"></span>$100K – $200K</div>
  <div class="map-legend-item"><span class="map-legend-swatch" style="background:#f03b20"></span>$200K – $350K</div>
  <div class="map-legend-item"><span class="map-legend-swatch" style="background:#bd0026"></span>$350K – $600K</div>
  <div class="map-legend-item"><span class="map-legend-swatch" style="background:#67001f"></span>$600K+</div>
`;

// ── Utilities ────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function fmtMoney(val) {
  const n = parseInt(val, 10);
  if (!n && n !== 0) return '—';
  const abs = Math.abs(n);
  return (n < 0 ? '-$' : '$') + abs.toLocaleString('en-US');
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

// ── Map ──────────────────────────────────────────────────────

function initMap() {
  widgetMap = L.map('widget-map', { center: [39.9526, -75.1652], zoom: 12, minZoom: 12, maxZoom: 18 });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO | City of Philadelphia OPA',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(widgetMap);

  initPropertyTileLayer();
}

function initPropertyTileLayer() {
  propertyTileLayer = L.vectorGrid.protobuf(PROPERTY_TILE_URL, {
    rendererFactory: L.canvas.tile,
    vectorTileLayerStyles: {
      [PROPERTY_LAYER_NAME]: tileFeatureStyle,
    },
    interactive:   true,
    maxNativeZoom: 16,
    getFeatureId:  f => f.properties.property_id,
  });

  propertyHoverPopup = L.popup({ closeButton: false, autoPan: false, className: 'property-hover-popup' });

  propertyTileLayer.on('mouseover', e => {
    const p = e.layer.properties;
    if (!p) return;
    const predicted = p.predicted_value != null ? fmtMoney(p.predicted_value) : '—';
    const market    = p.market_value    != null ? fmtMoney(parseFloat(p.market_value)) : '—';
    propertyHoverPopup
      .setLatLng(e.latlng)
      .setContent(
        `<div class="phover-id">ID: ${p.property_id}</div>` +
        `<div class="phover-row"><span>Predicted</span><span>${predicted}</span></div>` +
        `<div class="phover-row"><span>Market</span><span>${market}</span></div>`
      )
      .openOn(widgetMap);
  });

  propertyTileLayer.on('mouseout', () => {
    if (propertyHoverPopup) widgetMap.closePopup(propertyHoverPopup);
  });

  propertyTileLayer.addTo(widgetMap);

  const legendControl = L.control({ position: 'bottomleft' });
  legendControl.onAdd = function() {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = LEGEND_HTML;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  legendControl.addTo(widgetMap);
}

// ── Autocomplete ─────────────────────────────────────────────

function setupAutocomplete(inputId, onSelect) {
  const input    = el(inputId);
  const wrap     = input.closest('.search-input-wrap');
  const dropdown = document.createElement('ul');
  dropdown.className = 'autocomplete-list';
  wrap.appendChild(dropdown);

  let currentResults = [];

  const suggest = debounce(async (query) => {
    if (query.length < 6) { closeDropdown(); return; }

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
          // mousedown fires before blur, so preventDefault keeps focus
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

  input.addEventListener('input', () => suggest(input.value.trim()));

  input.addEventListener('blur', () => {
    // Slight delay so mousedown on item fires first
    setTimeout(closeDropdown, 150);
  });

  // Close on Escape
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDropdown();
  });

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
    currentResults = [];
  }
}

// ── Search ───────────────────────────────────────────────────

// Called when user types and hits Enter, or clicks Search button
async function lookupProperty(preloadedProp) {
  if (preloadedProp) {
    await processProp(preloadedProp);
    return;
  }

  const address = el('propertySearch').value.trim();
  if (!address) return;

  setSearchState(true);
  clearError();

  try {
    const results = await OPA.searchByAddress(address, 1);
    if (!results.length) {
      showError('No property found. Try a different format, e.g. "1500 Market St".');
      setSearchState(false);
      return;
    }
    await processProp(results[0]);
  } catch (err) {
    showError('Could not load property data. Please try again.');
    console.error('[widget] lookupProperty:', err);
    setSearchState(false);
  }
}

// Core flow once we have a property record
async function processProp(prop) {
  setSearchState(true);

  // Immediately show location on map
  placeMapMarker(prop);

  // Show basic data while async calls are in flight
  populateSummary(prop, null, null);

  // Fetch history, nearby, and city distribution in parallel
  const [history, nearby, distrib] = await Promise.all([
    OPA.getHistory(prop.parcel_number).catch(() => []),
    OPA.getNearby(prop.zip_code, prop.parcel_number, 5).catch(() => []),
    OPA.getCityDistribution().catch(() => []),
  ]);

  populateSummary(prop, history, nearby);
  renderYoyChart(history);
  renderDistChart(distrib, prop.market_value);
  renderNbrChart(nearby, prop);

  setSearchState(false);
}

// ── Map marker ───────────────────────────────────────────────

function placeMapMarker(prop) {
  if (widgetMarker) widgetMarker.remove();
  widgetMarker = L.marker([prop.lat, prop.lng])
    .bindPopup(
      `<div class="map-popup-address">${escHtml(titleCase(prop.location))}</div>`,
      { maxWidth: 240 }
    )
    .addTo(widgetMap)
    .openPopup();
  widgetMap.flyTo([prop.lat, prop.lng], ADDRESS_ZOOM, { duration: 0.8 });
  el('clearMarkerBtn').style.display = 'inline-block';
}

function clearMarker() {
  if (widgetMarker) {
    widgetMarker.remove();
    widgetMarker = null;
  }
  el('clearMarkerBtn').style.display = 'none';
}

// ── Summary card ─────────────────────────────────────────────

function populateSummary(prop, history, nearby) {
  const currentVal = parseInt(prop.market_value, 10) || 0;

  el('summaryAddress').textContent =
    titleCase(prop.location) + (prop.zip_code ? ', Philadelphia PA ' + prop.zip_code : '');
  el('summaryPid').textContent = 'Property ID: ' + (prop.parcel_number || '—');

  const sorted = (history || [])
    .map(h => ({ year: parseInt(h.year, 10), val: parseInt(h.market_value, 10) }))
    .filter(h => h.year && h.val)
    .sort((a, b) => b.year - a.year);

  const latestYear = sorted.length     ? sorted[0].year : null;
  const latestVal  = sorted.length     ? sorted[0].val  : currentVal;
  const prevYear   = sorted.length > 1 ? sorted[1].year : null;
  const prevVal    = sorted.length > 1 ? sorted[1].val  : null;

  el('summaryTaxYear').textContent       = latestYear || '—';
  el('summaryAssessedLabel').textContent = latestYear ? `${latestYear} Assessed Value` : 'Assessed Value';
  el('summaryAssessedValue').textContent = fmtMoney(latestVal);

  if (prevVal !== null) {
    el('summaryPrevLabel').textContent = prevYear ? `${prevYear} Assessed Value` : 'Previous Year Value';
    el('summaryPrevValue').textContent = fmtMoney(prevVal);

    const delta    = latestVal - prevVal;
    const deltaPct = ((delta / prevVal) * 100).toFixed(1);
    const sign     = delta >= 0 ? '+' : '';

    el('summaryDollarChange').textContent = sign + fmtMoney(delta);
    el('summaryPctChange').textContent    = sign + deltaPct + '%';

    ['dollarChangeBox', 'pctChangeBox'].forEach(id => {
      el(id).classList.toggle('positive', delta > 0);
      el(id).classList.toggle('negative', delta < 0);
    });

    let insight = `Your property's assessed value `
      + `<strong>${delta >= 0 ? 'increased' : 'decreased'} by ${Math.abs(deltaPct)}%</strong>`
      + ` (${prevYear || 'prior year'} → ${latestYear || 'current'})`;

    if (nearby && nearby.length) {
      const nbrVals = nearby.map(n => parseInt(n.market_value, 10)).filter(v => v > 0);
      if (nbrVals.length) {
        const avg = nbrVals.reduce((a, b) => a + b, 0) / nbrVals.length;
        const rel = latestVal > avg
          ? '<span class="insight-tag above">above</span>'
          : '<span class="insight-tag below">below</span>';
        insight += ` — ${rel} the surrounding ZIP ${escHtml(prop.zip_code)} average of <strong>${fmtMoney(avg)}</strong>.`;
      }
    } else {
      insight += '.';
    }
    el('summaryInsight').innerHTML = insight;

  } else {
    el('summaryPrevLabel').textContent    = 'Previous Year Value';
    el('summaryPrevValue').textContent    = '—';
    el('summaryDollarChange').textContent = '—';
    el('summaryPctChange').textContent    = '—';
    ['dollarChangeBox', 'pctChangeBox'].forEach(id => {
      el(id).classList.remove('positive', 'negative');
    });
    el('summaryInsight').textContent =
      'Historical assessment data is not yet available for this property.';
  }
}

// ── Charts ───────────────────────────────────────────────────

const EMPTY_HTML = '<div class="chart-empty">No data available.</div>';

function renderYoyChart(history) {
  const section = el('chartYoy');
  const sorted = (history || [])
    .map(h => ({ year: parseInt(h.year, 10), val: parseInt(h.market_value, 10) }))
    .filter(h => h.year && h.val)
    .sort((a, b) => a.year - b.year)
    .slice(-5);

  if (!sorted.length) { section.innerHTML = EMPTY_HTML; return; }

  const maxVal = Math.max(...sorted.map(h => h.val));
  const bars   = sorted.map((h, i) => {
    const pct    = Math.round((h.val / maxVal) * 82) + 12;
    const isLast = i === sorted.length - 1;
    return `
      <div class="bc-group">
        <div class="bc-value${isLast ? ' highlight-val' : ''}">${fmtMoney(h.val)}</div>
        <div class="bc-bar-wrap">
          <div class="bc-bar ${isLast ? 'gold' : 'blue'}" style="height:${pct}%"></div>
        </div>
        <div class="bc-year">${h.year}</div>
      </div>`;
  }).join('');

  section.className = '';
  section.innerHTML = `<div class="bar-compare">${bars}</div>`;
}

function renderDistChart(distrib, propertyValue) {
  const section = el('chartDist');
  if (!distrib || !distrib.length) { section.innerHTML = EMPTY_HTML; return; }

  const LABELS = ['<125k', '125–250k', '250–375k', '375–500k',
                  '500–625k', '625–750k', '750–875k', '875k+'];
  const BOUNDS = [0, 125000, 250000, 375000, 500000, 625000, 750000, 875000, Infinity];

  const propVal    = parseInt(propertyValue, 10);
  const propBucket = BOUNDS.findIndex((b, i) => propVal >= b && propVal < BOUNDS[i + 1]);
  const counts     = new Array(8).fill(0);
  distrib.forEach(r => {
    const b = parseInt(r.bucket, 10);
    if (b >= 1 && b <= 8) counts[b - 1] = parseInt(r.cnt, 10);
  });
  const maxCnt = Math.max(...counts, 1);

  const cols = counts.map((cnt, i) => {
    const pct = Math.round((cnt / maxCnt) * 88) + 8;
    return `
      <div class="dc-col${(i + 1) === propBucket ? ' highlight' : ''}">
        <div class="dc-bar" style="height:${pct}%"></div>
        <div class="dc-tick">${LABELS[i]}</div>
      </div>`;
  }).join('');

  const youLabel = propBucket >= 1
    ? `&#8593; You (${LABELS[propBucket - 1]})`
    : '&#8593; Your property';

  section.className = '';
  section.innerHTML = `
    <div class="dist-chart">
      <div class="dist-bars">${cols}</div>
      <div class="dc-you-label">${youLabel}</div>
    </div>`;
}

function renderNbrChart(nearby, thisProp) {
  const section = el('chartNbr');
  if (!nearby || !nearby.length) { section.innerHTML = EMPTY_HTML; return; }

  const all = [
    { name: 'This Property', value: parseInt(thisProp.market_value, 10), isSelf: true },
    ...nearby.map(n => ({
      name:  titleCase(n.location).split(' ').slice(0, 3).join(' '),
      value: parseInt(n.market_value, 10),
    })),
  ].filter(p => p.value > 0).sort((a, b) => b.value - a.value);

  const maxVal = Math.max(...all.map(p => p.value), 1);
  const rows   = all.map(p => {
    const pct = Math.round((p.value / maxVal) * 94) + 4;
    return `
      <div class="hc-row${p.isSelf ? ' self' : ''}">
        <div class="hc-name">${escHtml(p.name)}</div>
        <div class="hc-bar-wrap">
          <div class="hc-bar" style="width:${pct}%"><span>${fmtMoney(p.value)}</span></div>
        </div>
      </div>`;
  }).join('');

  section.className = '';
  section.innerHTML = `<div class="horiz-chart">${rows}</div>`;
}

// ── UI state helpers ──────────────────────────────────────────

function setSearchState(loading) {
  const btn = el('searchBtn');
  btn.textContent = loading ? 'Searching…' : 'Search';
  btn.disabled    = loading;
}

function showError(msg) {
  const div = el('searchError');
  div.textContent   = msg;
  div.style.display = 'block';
}

function clearError() {
  const div = el('searchError');
  div.textContent   = '';
  div.style.display = 'none';
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  // Wire up autocomplete: on selection immediately run the full lookup
  setupAutocomplete('propertySearch', prop => {
    clearError();
    processProp(prop);
  });

  el('propertySearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupProperty();
  });
});
