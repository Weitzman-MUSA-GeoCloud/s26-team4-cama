// ============================================================
//  Property Owner Widget — script.js
//  City of Philadelphia — Office of Property Assessment
//
//  Depends on: Leaflet
// ============================================================

'use strict';

let widgetMap;
let widgetMarker = null;

const ADDRESS_ZOOM = 17;

// ── Property tile layer ──────────────────────────────────────
const PROPERTY_TILE_URL   = 'https://storage.googleapis.com/musa5090s26-team4-public/tiles/properties/{z}/{x}/{y}.pbf';
const PROPERTY_LAYER_NAME = 'property_tile_info';

let propertyTileLayer  = null;
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

  propertyTileLayer.on('click', e => {
    L.DomEvent.stopPropagation(e);
    const tileProps = (e.layer && e.layer.properties) || {};

    if (propertyHoverPopup) widgetMap.closePopup(propertyHoverPopup);

    populateSummary(tileProps);
    placeMapMarker(tileProps, e.latlng);
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

// ── Map marker ───────────────────────────────────────────────

function placeMapMarker(tileProps, latlng) {
  if (!latlng) return;
  if (widgetMarker) widgetMarker.remove();
  const address = tileProps.address ? titleCase(tileProps.address) : '';
  const market  = tileProps.market_value != null ? fmtMoney(tileProps.market_value) : null;
  const value   = market ? `<div class="map-popup-value">Market: ${market}</div>` : '';
  widgetMarker = L.marker(latlng)
    .bindPopup(
      `<div class="map-popup-address">${escHtml(address || '—')}</div>${value}`,
      { maxWidth: 260 }
    )
    .addTo(widgetMap)
    .openPopup();
  widgetMap.flyTo(latlng, ADDRESS_ZOOM, { duration: 0.8 });
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

function populateSummary(tileProps) {
  const address = tileProps.address ? titleCase(tileProps.address) : '—';

  el('summaryAddress').textContent = address;
  el('summaryPid').textContent     = 'Property ID: ' + (tileProps.property_id != null ? tileProps.property_id : '—');

  const assessed = Number(tileProps.predicted_value);
  const market   = Number(tileProps.market_value);
  const hasAssessed = Number.isFinite(assessed) && assessed > 0;
  const hasMarket   = Number.isFinite(market)   && market   > 0;

  el('summaryAssessedValue').textContent = hasAssessed ? fmtMoney(assessed) : '—';
  el('summaryMarketValue').textContent   = hasMarket   ? fmtMoney(market)   : '—';

  const insight = el('summaryInsight');
  if (hasAssessed && hasMarket) {
    const diff = assessed - market;
    const pct  = Math.round((diff / market) * 100);
    const tag  = diff >= 0
      ? '<span class="insight-tag above">above</span>'
      : '<span class="insight-tag below">below</span>';
    insight.innerHTML =
      `Predicted assessed value is ${tag} market by <strong>${fmtMoney(Math.abs(diff))}</strong> (${Math.abs(pct)}%).`;
  } else {
    insight.textContent = 'Click any property on the map to see its predicted and market values.';
  }
}

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initMap);
