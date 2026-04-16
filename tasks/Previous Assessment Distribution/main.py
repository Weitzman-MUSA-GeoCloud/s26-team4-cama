"""
Cloud Function: generate-assessment-chart-configs

Queries the `derived.current_assessment_bins` table in BigQuery and writes a
JSON config file to GCS that the front end uses to populate the tax-year
assessment value distribution chart.

Output: gs://musa5090s26-team4-public/configs/tax_year_assessment_bins.json

Format:
[
  {"tax_year": ..., "lower_bound": ..., "upper_bound": ..., "property_count": ...},
  ...
]
"""

import json
import logging
import os

import functions_framework
from google.cloud import bigquery, storage

PROJECT_ID = os.environ.get("GCP_PROJECT", "musa5090s26-team4")
DATASET = os.environ.get("BQ_DATASET", "derived")
TABLE = os.environ.get("BQ_TABLE", "tax_year_assessment_bins")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "musa5090s26-team4-public")
OBJECT_PATH = os.environ.get("OBJECT_PATH", "configs/tax_year_assessment_bins.json")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def build_rows():
    """Query BigQuery and return a list of row dicts ready for JSON serialization."""
    client = bigquery.Client(project=PROJECT_ID)

    query = f"""
        SELECT
            tax_year,
            lower_bound,
            upper_bound,
            property_count
        FROM `{PROJECT_ID}.{DATASET}.{TABLE}`
        ORDER BY tax_year, lower_bound
    """

    logger.info("Running BigQuery query against %s.%s.%s", PROJECT_ID, DATASET, TABLE)
    rows = client.query(query).result()

    return [
        {
            "tax_year": int(row["tax_year"]) if row["tax_year"] is not None else None,
            "lower_bound": float(row["lower_bound"]) if row["lower_bound"] is not None else None,
            "upper_bound": float(row["upper_bound"]) if row["upper_bound"] is not None else None,
            "property_count": int(row["property_count"]) if row["property_count"] is not None else 0,
        }
        for row in rows
    ]


def upload_json(payload):
    """Upload the JSON payload to the configured GCS bucket/object."""
    storage_client = storage.Client(project=PROJECT_ID)
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(OBJECT_PATH)

    blob.cache_control = "public, max-age=300"
    blob.upload_from_string(
        data=json.dumps(payload, separators=(",", ":")),
        content_type="application/json",
    )
    logger.info("Wrote gs://%s/%s (%d records)", BUCKET_NAME, OBJECT_PATH, len(payload))


@functions_framework.http
def generate_assessment_chart_configs(request):
    """HTTP Cloud Function entry point."""
    try:
        rows = build_rows()
        upload_json(rows)
        return (
            json.dumps(
                {
                    "status": "ok",
                    "records": len(rows),
                    "destination": f"gs://{BUCKET_NAME}/{OBJECT_PATH}",
                }
            ),
            200,
            {"Content-Type": "application/json"},
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to generate assessment chart config")
        return (
            json.dumps({"status": "error", "message": str(exc)}),
            500,
            {"Content-Type": "application/json"},
        )