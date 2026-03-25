// ============================================================
//  Property Owner Widget Interface — script.js
//  City of Philadelphia — Office of Property Assessment
// ============================================================

'use strict';

let widgetMap;

function initMap() {
  widgetMap = L.map('widget-map', { center: [39.9526, -75.1652], zoom: 12 });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO | City of Philadelphia OPA',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(widgetMap);
}

function lookupProperty() {
  const address = document.getElementById('propertySearch').value.trim();
  if (!address) return;

  // TODO: query property data API with address
  // TODO: update map view and place marker at property location
  // TODO: render assessment details in #assessmentCard
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  document.getElementById('propertySearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupProperty();
  });
});
