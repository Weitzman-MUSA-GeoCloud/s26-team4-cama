CREATE OR REPLACE TABLE `musa5090s26-team4.derived.tax_year_assessment_bins`
AS (
  SELECT
    EXTRACT(YEAR FROM SAFE_CAST(assessment_date AS TIMESTAMP)) AS tax_year,
    FLOOR(SAFE_CAST(market_value AS FLOAT64) / 50000) * 50000 + 50000 as upper_bound,
    FLOOR(SAFE_CAST(market_value AS FLOAT64) / 50000) * 50000  AS lower_bound,
    COUNT(*) AS property_count

  FROM
    `musa5090s26-team4.core.opa_assessments`
  WHERE SAFE_CAST(market_value AS FLOAT64) IS NOT NULL
  AND SAFE_CAST(market_value AS FLOAT64) > 0
  GROUP BY 1,2,3
  ORDER BY lower_bound
); 