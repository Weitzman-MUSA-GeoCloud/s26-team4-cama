#!/usr/bin/env bash
# deploy.sh – Deploy the assessment-bins Cloud Function
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project <YOUR_PROJECT_ID>
#
# Usage:
#   chmod +x deploy.sh
#   OUTPUT_BUCKET=my-bucket ./deploy.sh

set -euo pipefail

FUNCTION_NAME="generate-assessment-chart-configs"
REGION="${REGION:-us-central1}"
RUNTIME="${RUNTIME:-python312}"
BQ_LOCATION="${BQ_LOCATION:-US}"
# The service account used by the function must have:
#   - roles/bigquery.dataViewer  (on the derived dataset)
#   - roles/bigquery.jobUser     (on the project)
#   - roles/storage.objectAdmin  (on musa5090s26-team4-public)
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-}"  # leave blank to use the default SA

SA_FLAG=""
if [[ -n "$SERVICE_ACCOUNT" ]]; then
  SA_FLAG="--service-account=$SERVICE_ACCOUNT"
fi

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --runtime="$RUNTIME" \
  --region="$REGION" \
  --source=. \
  --entry-point=generate_assessment_chart_configs \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars="BQ_LOCATION=${BQ_LOCATION}" \
  --timeout=120s \
  --memory=256Mi \
  $SA_FLAG

echo ""
echo "✅ Deployed. Invoke with:"
echo "   gcloud functions call $FUNCTION_NAME --region=$REGION"