--you will need to update the predictors here if you update them in the model

CREATE OR REPLACE TABLE `musa5090s26-team4.derived.current_assessments`
AS (
SELECT
  property_id,
  predicted_sale_price AS predicted_value,
  CURRENT_TIMESTAMP() AS predicted_at
FROM ML.PREDICT(
  MODEL `core.home_price_model`,
  (
    SELECT
      p.property_id,
      p.sale_date,
      LN(SAFE_CAST(p.total_livable_area AS FLOAT64)) AS log_livable_area,
      p.number_of_bathrooms,
      p.interior_condition,
      p.quality_grade,
      p.garage_spaces,
      p.central_air,
      p.zip_code,

      -- Census features (must match exactly what the model was trained on)
      c.median_hh_incomeE,
      c.pct_college_educated,
      c.pct_labor_forceE

    FROM `core.opa_properties` p
    LEFT JOIN `core.census_zip` c
      ON p.zip_code = CAST(c.zip_code AS STRING)

    WHERE SAFE_CAST(p.total_livable_area AS FLOAT64) > 0
      AND REGEXP_CONTAINS(p.quality_grade, r'^[A-Z][+-]?$')
  )
)
);