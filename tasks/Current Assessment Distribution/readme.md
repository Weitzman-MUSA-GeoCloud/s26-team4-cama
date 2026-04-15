# generate-assessment-chart-configs

A Google Cloud Function (2nd gen, HTTP-triggered) that:

1. Queries `derived.current_assessment_bins` in BigQuery
2. Serialises the result as a JSON array
3. Writes it to `gs://musa5090s26-team4-public/configs/tax_year_assessment_bins.json`

The frontend fetches that file directly to populate the assessment value chart.

## Output shape

```json
[
  {"tax_year": 2023, "lower_bound": 0, "upper_bound": 50000, "property_count": 1420},
  {"tax_year": 2023, "lower_bound": 50000, "upper_bound": 100000, "property_count": 3812},
  ...
]
```

Rows are ordered by `tax_year ASC, lower_bound ASC`.

## Environment variables

| Variable      | Required | Default | Description                                                |
|---------------|----------|---------|------------------------------------------------------------|
| `GCP_PROJECT` | ✅        | —       | Set automatically by Cloud Functions runtime               |
| `BQ_LOCATION` |          | `US`    | BigQuery job location — change if your dataset is regional |

The output bucket and blob path are hardcoded:
- Bucket: `musa5090s26-team4-public`
- Blob: `configs/tax_year_assessment_bins.json`

## IAM requirements

The function's service account needs:

- **BigQuery Data Viewer** on the `derived` dataset (or the whole project)
- **BigQuery Job User** on the project
- **Storage Object Admin** on `musa5090s26-team4-public`

## Deploy

```bash
chmod +x deploy.sh
./deploy.sh
```

## Public URL (for the frontend)

```
https://storage.googleapis.com/musa5090s26-team4-public/configs/tax_year_assessment_bins.json
```

## Local development

```bash
pip install -r requirements.txt
export GCP_PROJECT=my-project
functions-framework --target=generate_assessment_chart_configs --debug
# Then: curl http://localhost:8080
```

## Scheduling (optional)

```bash
gcloud scheduler jobs create http generate-assessment-chart-configs-daily \
  --schedule="0 3 * * *" \
  --uri="$(gcloud functions describe generate-assessment-chart-configs --region=us-central1 --format='value(serviceConfig.uri)')" \
  --http-method=GET \
  --oidc-service-account-email=<YOUR_INVOKER_SA>
```