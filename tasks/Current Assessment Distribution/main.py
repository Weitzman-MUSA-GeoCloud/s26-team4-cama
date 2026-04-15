import json
import logging
import os
import functions_framework

from google.cloud import bigquery, storage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuration ---
PROJECT_ID = os.environ.get("GCP_PROJECT")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "us-east4")
OUTPUT_BUCKET = "musa5090s26-team4-public"
OUTPUT_BLOB = "configs/tax_year_assessment_bins.json"

QUERY = """
SELECT
    tax_year,
    lower_bound,
    upper_bound,
    property_count
FROM `derived.tax_year_assessment_bins`
WHERE tax_year = (SELECT MAX(tax_year) FROM `derived.tax_year_assessment_bins`)
ORDER BY lower_bound
"""


@functions_framework.http
def generate_assessment_chart_configs(request):
    """HTTP Cloud Function.

    Queries derived.tax_year_assessment_bins in BigQuery for the most recent
    tax year, serialises the result as a JSON array, and writes it to a GCS
    bucket so the frontend can fetch it directly.

    Returns a JSON response summarising what was written.
    """
    missing = [v for v in ("GCP_PROJECT",) if not os.environ.get(v)]
    if missing:
        msg = f"Missing required environment variables: {', '.join(missing)}"
        logger.error(msg)
        return (json.dumps({"error": msg}), 500, {"Content-Type": "application/json"})

    try:
        rows = _query_bigquery()
        record_count = len(rows)
        logger.info("Fetched %d rows from BigQuery", record_count)

        gcs_uri = _write_to_gcs(rows)
        logger.info("Wrote output to %s", gcs_uri)

        result = {
            "status": "ok",
            "record_count": record_count,
            "destination": gcs_uri,
        }
        return (json.dumps(result), 200, {"Content-Type": "application/json"})

    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Function failed: %s", exc)
        return (
            json.dumps({"error": str(exc)}),
            500,
            {"Content-Type": "application/json"},
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _query_bigquery() -> list[dict]:
    """Run the assessment-bins query and return a list of plain dicts."""
    client = bigquery.Client(project=PROJECT_ID, location=BQ_LOCATION)
    query_job = client.query(QUERY)
    rows = query_job.result()  # blocks until complete

    return [
        {
            "tax_year": row.tax_year,
            "lower_bound": row.lower_bound,
            "upper_bound": row.upper_bound,
            "property_count": row.property_count,
        }
        for row in rows
    ]


def _write_to_gcs(rows: list[dict]) -> str:
    """Serialise *rows* as JSON and upload to GCS. Returns the gs:// URI."""
    payload = json.dumps(rows, indent=2)

    storage_client = storage.Client(project=PROJECT_ID)
    bucket = storage_client.bucket(OUTPUT_BUCKET)
    blob = bucket.blob(OUTPUT_BLOB)

    blob.upload_from_string(
        payload,
        content_type="application/json",
    )

    return f"gs://{OUTPUT_BUCKET}/{OUTPUT_BLOB}"