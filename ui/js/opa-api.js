/* ============================================================
   Philadelphia OPA API Layer — opa-api.js
   Shared by widget (property owner) and reviewer (assessor).

   Data sources (no API key required):
     • phl.carto.com  — opa_properties_public table
     • data.phila.gov — OPA assessment history (Socrata)
   ============================================================ */

/* global OPA */
'use strict';

// eslint-disable-next-line no-unused-vars
const OPA = (() => {
  const CARTO   = 'https://phl.carto.com/api/v2/sql';
  const SOCRATA = 'https://data.phila.gov/resource/w7rb-qrn8.json';

  // In-session cache keyed by SQL / URL string
  const _cache = Object.create(null);

  // Sanitize user input for inline SQL: escape single-quotes only.
  function _esc(str) { return String(str).replace(/'/g, "''").trim(); }

  async function _carto(sql) {
    const key = sql.replace(/\s+/g, ' ');
    if (_cache[key]) return _cache[key];
    const res = await fetch(`${CARTO}?q=${encodeURIComponent(sql)}`);
    if (!res.ok) throw new Error(`CARTO HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(Array.isArray(json.error) ? json.error.join('; ') : json.error);
    _cache[key] = json.rows || [];
    return _cache[key];
  }

  const FIELDS = `
    parcel_number, location, owner_1, owner_2,
    market_value, sale_price, sale_date,
    year_built, total_livable_area, total_area,
    number_of_bathrooms, number_of_bedrooms,
    building_code_description, zoning, zip_code,
    ST_Y(the_geom) AS lat, ST_X(the_geom) AS lng
  `;

  return {
    /**
     * Search by address string.
     * Returns up to `limit` rows from opa_properties_public.
     */
    async searchByAddress(address, limit = 10) {
      const q = _esc(address.toUpperCase());
      return _carto(`
        SELECT ${FIELDS}
        FROM opa_properties_public
        WHERE UPPER(location) LIKE '%${q}%'
          AND the_geom IS NOT NULL
        ORDER BY location
        LIMIT ${limit}
      `);
    },

    /**
     * Fetch year-by-year market values from the OPA assessments dataset.
     * Returns rows sorted newest-first: [{year, market_value}, …]
     */
    async getHistory(parcelNumber) {
      const url = `${SOCRATA}?parcel_number=${encodeURIComponent(parcelNumber)}`
                + `&$order=year+DESC&$limit=6&$select=year,market_value`;
      if (_cache[url]) return _cache[url];
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Socrata HTTP ${res.status}`);
      const rows = await res.json();
      _cache[url] = rows;
      return rows;
    },

    /**
     * Random sample of properties in the same zip code for neighborhood comparison.
     */
    async getNearby(zipCode, excludeParcel, limit = 5) {
      return _carto(`
        SELECT parcel_number, location, market_value
        FROM opa_properties_public
        WHERE zip_code = '${_esc(zipCode)}'
          AND parcel_number != '${_esc(excludeParcel)}'
          AND market_value > 0
        ORDER BY RANDOM()
        LIMIT ${limit}
      `);
    },

    /**
     * City-wide market value distribution in 8 buckets of $125k.
     * Expensive but cached for the session.
     */
    async getCityDistribution() {
      return _carto(`
        SELECT
          CASE
            WHEN market_value <  125000 THEN 1
            WHEN market_value <  250000 THEN 2
            WHEN market_value <  375000 THEN 3
            WHEN market_value <  500000 THEN 4
            WHEN market_value <  625000 THEN 5
            WHEN market_value <  750000 THEN 6
            WHEN market_value <  875000 THEN 7
            ELSE 8
          END AS bucket,
          COUNT(*) AS cnt
        FROM opa_properties_public
        WHERE market_value > 0 AND market_value <= 1000000
        GROUP BY bucket
        ORDER BY bucket
      `);
    },

    /**
     * Filtered property query for the assessor review interface.
     * filters: { address, zipCodes[], minValue, maxValue, buildingKeyword }
     */
    async filterProperties(filters = {}, limit = 100) {
      const conds = ['the_geom IS NOT NULL', 'market_value > 0'];

      if (filters.address) {
        conds.push(`UPPER(location) LIKE '%${_esc(filters.address.toUpperCase())}%'`);
      }
      if (filters.zipCodes && filters.zipCodes.length) {
        const list = filters.zipCodes.map(z => `'${_esc(z)}'`).join(',');
        conds.push(`zip_code IN (${list})`);
      }
      if (filters.minValue) conds.push(`market_value >= ${parseInt(filters.minValue, 10)}`);
      if (filters.maxValue) conds.push(`market_value <= ${parseInt(filters.maxValue, 10)}`);
      if (filters.buildingKeyword) {
        conds.push(`UPPER(building_code_description) LIKE '%${_esc(filters.buildingKeyword.toUpperCase())}%'`);
      }

      return _carto(`
        SELECT ${FIELDS}
        FROM opa_properties_public
        WHERE ${conds.join(' AND ')}
        ORDER BY location
        LIMIT ${limit}
      `);
    },
  };
})();
