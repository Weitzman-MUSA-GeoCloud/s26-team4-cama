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
      property_id,
      sale_date,
      LN(SAFE_CAST(total_livable_area AS FLOAT64)) AS log_livable_area,
      number_of_bathrooms,
      interior_condition,
      quality_grade,
      garage_spaces,
      central_air
    FROM `core.opa_properties`
    WHERE SAFE_CAST(total_livable_area AS FLOAT64) > 0
      AND REGEXP_CONTAINS(quality_grade, r'^[A-Z][+-]?$')
  )
)
);