--if you update the predictors here you will also need to update them in the query that runs the model

CREATE OR REPLACE MODEL `core.home_price_model`
OPTIONS (
  model_type = 'linear_reg',
  input_label_cols = ['sale_price'],
  data_split_method = 'AUTO_SPLIT'
) AS
SELECT
  SAFE_CAST(p.sale_price AS FLOAT64) AS sale_price,
  p.sale_date,
  LN(SAFE_CAST(p.total_livable_area AS FLOAT64)) AS log_livable_area,
  p.number_of_bathrooms,
  p.interior_condition,
  p.quality_grade,
  p.garage_spaces,
  p.central_air,
  p.zip_code,

  -- Census features joined from zip-level table 
  c.median_hh_incomeE,
  c.pct_college_educated,
  c.pct_labor_forceE

FROM `core.opa_properties` p
LEFT JOIN `core.census_zip` c
  ON p.zip_code = CAST(c.zip_code AS STRING)

WHERE
  SAFE_CAST(p.sale_price AS FLOAT64) > 5000
  AND SAFE_CAST(p.sale_price AS FLOAT64) < 50000000
  AND SAFE_CAST(p.total_livable_area AS FLOAT64) > 0
  AND REGEXP_CONTAINS(p.quality_grade, r'^[A-Z][+-]?$')
  AND p.category_code IN ('1', '2', '3')
;