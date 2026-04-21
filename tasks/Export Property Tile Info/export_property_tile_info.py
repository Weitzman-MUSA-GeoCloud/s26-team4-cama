"""
Joins derived.current_assessments, core.pwd_parcels, and core.opa_assessments
in BigQuery, streams the result as GeoJSON directly to GCS.

Usage:
    python export_property_tile_info.py --project <your-gcp-project>

Requirements:
    pip install google-cloud-bigquery google-cloud-storage
"""

import argparse
import json
from google.cloud import bigquery, storage


BUCKET_NAME = "musa5090s26-team4-temp_data"
OUTPUT_BLOB = "property_tile_info.geojson"

SQL = """
WITH latest_assessments AS (
    SELECT
        property_id,
        market_value,
        market_value_date,
        ROW_NUMBER() OVER (
            PARTITION BY property_id
            ORDER BY market_value_date DESC
        ) AS rn
    FROM `musa5090s26-team4.core.opa_assessments`
)
SELECT
    a.*,
    la.market_value,
    ST_ASGEOJSON(p.geog) AS geometry
FROM
    `musa5090s26-team4.derived.current_assessments` AS a
INNER JOIN
    `musa5090s26-team4.core.pwd_parcels` AS p
    ON a.property_id = p.brt_id
INNER JOIN
    latest_assessments AS la
    ON a.property_id = la.property_id
    AND la.rn = 1
"""


def row_to_feature(row: dict) -> str | None:
    """Convert a single BigQuery row to a GeoJSON Feature string, or None if invalid."""
    row = dict(row)
    geometry_str = row.pop("geometry", None)

    if not geometry_str:
        return None

    try:
        geometry = json.loads(geometry_str)
    except (json.JSONDecodeError, TypeError):
        return None

    properties = {}
    for k, v in row.items():
        if isinstance(v, (int, float, str, bool)) or v is None:
            properties[k] = v
        else:
            properties[k] = str(v)

    return json.dumps({
        "type": "Feature",
        "geometry": geometry,
        "properties": properties,
    }, ensure_ascii=False)


def stream_to_gcs(project: str) -> str:
    """Stream BigQuery rows directly to GCS as a GeoJSON FeatureCollection."""
    bq_client = bigquery.Client(project=project)
    gcs_client = storage.Client(project=project)

    print("Running BigQuery join...")
    query_job = bq_client.query(SQL)
    rows = query_job.result()

    print(f"Streaming to gs://{BUCKET_NAME}/{OUTPUT_BLOB} ...")
    bucket = gcs_client.bucket(BUCKET_NAME)
    blob = bucket.blob(OUTPUT_BLOB)

    count = 0
    skipped = 0

    with blob.open("w", content_type="application/geo+json") as f:
        f.write('{"type":"FeatureCollection","features":[\n')
        first = True
        for row in rows:
            feature = row_to_feature(row)
            if feature is None:
                skipped += 1
                continue
            if not first:
                f.write(",\n")
            f.write(feature)
            first = False
            count += 1
            if count % 10000 == 0:
                print(f"  → {count} features written...")
        f.write("\n]}")

    if skipped:
        print(f"  → Skipped {skipped} rows with null/invalid geometry")
    print(f"  → Done: {count} features written")

    uri = f"gs://{BUCKET_NAME}/{OUTPUT_BLOB}"
    print(f"  → Upload complete: {uri}")
    return uri


def main():
    parser = argparse.ArgumentParser(description="Export property tile info to GCS as GeoJSON")
    parser.add_argument(
        "--project",
        required=True,
        help="GCP project ID (used for both BigQuery and GCS clients)",
    )
    args = parser.parse_args()

    uri = stream_to_gcs(args.project)
    print(f"\nDone! File available at: {uri}")


if __name__ == "__main__":
    main()
