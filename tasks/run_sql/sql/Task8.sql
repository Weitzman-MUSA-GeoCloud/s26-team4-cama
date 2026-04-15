CREATE OR REPLACE TABLE `musa5090s26-team4.derived.current_assessment_bins`
AS (
  SELECT
    FLOOR(SAFE_CAST(predicted_value AS FLOAT64) / 50000) * 50000 + 50000 as upper_bound,
    FLOOR(SAFE_CAST(predicted_value AS FLOAT64) / 50000) * 50000  AS lower_bound,
    COUNT(*) AS property_count

  FROM
    `musa5090s26-team4.derived.current_assessments`
  WHERE SAFE_CAST(predicted_value AS FLOAT64) IS NOT NULL
  GROUP BY 1,2
  ORDER BY lower_bound
); 