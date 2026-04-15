/* ============================================================
   Philadelphia OPA API Layer — opa-api.js
   Shared by widget (property owner) and reviewer (assessor).

   Address search: ArcGIS World Geocoder (no key required)
   Property data: backend stub (to be implemented)
   ============================================================ */

/* global OPA */
'use strict';

// eslint-disable-next-line no-unused-vars
const OPA = (() => {
  const GEOCODER_BASE =
    'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
  const PHILA_CENTER = '-75.1652,39.9526';

  return {
    /**
     * Address autocomplete / geocoding via ArcGIS World Geocoder.
     * Returns an array of candidate property-shaped objects with lat/lng.
     */
    async searchByAddress(query, limit = 8) {
      if (!query || query.length < 2) return [];
      try {
        const params = new URLSearchParams({
          f:             'json',
          singleLine:    query + ', Philadelphia, PA',
          maxLocations:  String(limit),
          outFields:     'StAddr,City,Region,Postal,PlaceName',
          location:      PHILA_CENTER,
          distance:      '50000',
          countryCode:   'USA',
        });
        const res = await fetch(`${GEOCODER_BASE}?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.candidates || [])
          .filter(c => c.score >= 50 && c.location)
          .map(c => ({
            location:                  c.attributes.StAddr || c.address.split(',')[0] || c.address,
            zip_code:                  c.attributes.Postal || '',
            lat:                       c.location.y,
            lng:                       c.location.x,
            // Fields below require a property-data backend (not yet integrated)
            parcel_number:             '',
            market_value:              null,
            building_code_description: '',
            owner_1:                   '',
            owner_2:                   '',
            zoning:                    '',
            year_built:                null,
            total_livable_area:        null,
            total_area:                null,
            number_of_bedrooms:        null,
            number_of_bathrooms:       null,
            sale_price:                null,
            sale_date:                 null,
          }));
      } catch (err) {
        console.error('[OPA] searchByAddress:', err);
        return [];
      }
    },

    async getHistory() {
      // TODO: implement via property-data backend
      return [];
    },

    async getNearby() {
      // TODO: implement via property-data backend
      return [];
    },

    async getCityDistribution() {
      // TODO: implement via property-data backend
      return [];
    },

    async filterProperties() {
      // TODO: implement via property-data backend
      return [];
    },
  };
})();
