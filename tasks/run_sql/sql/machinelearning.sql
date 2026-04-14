--if you update the predictors here you will also need to update them in the query that runs the model

CREATE OR REPLACE MODEL `core.home_price_model`
OPTIONS (
  model_type = 'linear_reg',
  input_label_cols = ['sale_price'],
  data_split_method = 'AUTO_SPLIT'
) AS
SELECT
  SAFE_CAST(sale_price AS FLOAT64) AS sale_price,
  sale_date,
  LN(SAFE_CAST(total_livable_area AS FLOAT64)) AS log_livable_area,
  number_of_bathrooms,
  interior_condition,
  quality_grade,
  garage_spaces,
  central_air

FROM
  `core.opa_properties`
WHERE
  SAFE_CAST(sale_price AS FLOAT64) > 5000
  AND SAFE_CAST(sale_price AS FLOAT64) < 50000000
  AND SAFE_CAST(total_livable_area AS FLOAT64) > 0
  AND REGEXP_CONTAINS(quality_grade, r'^[A-Z][+-]?$');