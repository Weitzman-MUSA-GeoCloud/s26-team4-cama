// ============================================================
//  Tax Assessor Review Interface — script.js
//  City of Philadelphia — Office of Property Assessment
// ============================================================

'use strict';

let map;

function initMap() {
  map = L.map('map', { center: [39.9526, -75.1652], zoom: 12 });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO | City of Philadelphia OPA',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);
}

function fitAllMarkers() {
  // TODO: fit map to loaded property markers
}

function locateUser() {
  map.locate({ setView: true, maxZoom: 16 });
}

function updateMapOverlay(_value) {
  // TODO: re-symbolize markers by the chosen overlay mode
}

function applyFilters() {
  // TODO: filter property list and map markers based on sidebar inputs
}

function resetFilters() {
  // TODO: clear all filter inputs and reload full dataset
}

function searchAddress() {
  // TODO: search loaded properties by address string
}

function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const pane = document.getElementById(`pane-${name}`);
  if (pane) pane.classList.add('active');
}

function saveNote() {
  // TODO: persist assessor note for selected property
}

function clearNote() {
  document.getElementById('assessorNotes').value = '';
}

function submitReview() {
  // TODO: submit review action for selected property
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  document.getElementById('addressSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') searchAddress();
  });
});
