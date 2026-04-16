import os
import json
from google.cloud import bigquery
from google.cloud import storage

# Constants
PROJECT_ID = "musa5090s26-team4"
DATASET = "derived"
TABLE = "tax_year_assessment_bins"
BUCKET_NAME = "musa5090s26-team4-public"
DESTINATION_BLOB = "configs/tax_year_assessment_bins.json"


def generate_assessment_chart_configs(request):
    """
    Cloud Function to generate assessment bin JSON config
    and upload it to GCS.
    """

    # Initialize clients
    bq_client = bigquery.Client(project=PROJECT_ID)
    storage_client = storage.Client()

    # Query
    query = f"""
       SELECT
           tax_year,
           lower_bound,
           upper_bound,
           property_count
       FROM `{PROJECT_ID}.{DATASET}.{TABLE}`
       WHERE tax_year = (SELECT MAX(tax_year) FROM `{PROJECT_ID}.{DATASET}.{TABLE}`)
       ORDER BY lower_bound
   """

    query_job = bq_client.query(query)
    results = query_job.result()

    # Format results
    output = []
    for row in results:
        output.append({
            "tax_year": row["tax_year"],
            "lower_bound": row["lower_bound"],
            "upper_bound": row["upper_bound"],
            "property_count": row["property_count"]
        })

    # Convert to JSON string
    json_data = json.dumps(output, indent=2)

    # Upload to GCS
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(DESTINATION_BLOB)
    blob.upload_from_string(json_data, content_type="application/json")

    return {
        "status": "success",
        "message": f"File written to gs://{BUCKET_NAME}/{DESTINATION_BLOB}",
        "record_count": len(output)
    }