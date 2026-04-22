import json
from google.cloud import bigquery, storage


def export_assessment_bins(request):
    bq_client = bigquery.Client()
    gcs_client = storage.Client()

    # Query the table
    query = """
        SELECT *
        FROM `musa5090s26-team4.derived.current_assessment_bins`
        ORDER BY lower_bound
    """
    rows = bq_client.query(query).result()

    # Convert to JSON
    data = [dict(row) for row in rows]
    json_bytes = json.dumps(data).encode("utf-8")

    # Write to GCS with a fixed filename
    bucket = gcs_client.bucket("musa5090s26-team4-public")
    blob = bucket.blob("prediction_bins/current_assessment_bins.json")
    blob.upload_from_string(json_bytes, content_type="application/json")

    return ("Exported assessment bins to GCS", 200)