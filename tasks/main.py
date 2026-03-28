import os
import pathlib
import requests
import functions_framework
import csv
import pyproj
from google.cloud import storage
import json
from shapely import wkt

DIRNAME = pathlib.Path(__file__).parent
BUCKET_NAME = os.environ.get('DATA_LAKE_BUCKET', 'musa5090s26-team4-raw_data')


def extract_data(url, filename, blobname):
    response = requests.get(url)
    response.raise_for_status()

    with open(filename, 'wb') as f:
        f.write(response.content)

    print(f'Downloaded {filename}')

    # Upload the downloaded file to cloud storage
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(blobname)
    blob.upload_from_filename(filename)

    print(f'Uploaded {blobname} to {BUCKET_NAME}')


@functions_framework.http
def extract_phl_opa_properties(request):
    print('Extracting OPA Properties data...')
    filename = DIRNAME / 'phl_opa_properties.csv'
    blobname = 'raw/phl_opa_properties/phl_opa_properties.csv'
    extract_data(
        'https://opendata-downloads.s3.amazonaws.com/opa_properties_public.csv',
        filename,
        blobname,
    )
    return f'Downloaded to {filename} and uploaded to gs://{BUCKET_NAME}/{blobname}'



#Prepare opa data

@functions_framework.http
def prepare_phl_opa_properties(request):
    print('Preparing OPA Properties data...')

    raw_filename = DIRNAME / 'phl_opa_properties.csv'
    prepared_filename = DIRNAME / 'phl_opa_properties.jsonl'


    raw_bucket_name = os.getenv('RAW_DATA_BUCKET', 'musa5090s26-team4-raw_data')
    prepared_bucket_name = os.getenv('PREPARED_DATA_BUCKET', 'musa5090s26-team4-prepared_data')
    storage_client = storage.Client()

    # Download the data from the bucket
    raw_blobname = 'raw/phl_opa_properties/phl_opa_properties.csv'
    raw_bucket = storage_client.bucket(raw_bucket_name)
    blob = raw_bucket.blob(raw_blobname)
    blob.download_to_filename(raw_filename)

    print(f'Downloaded to {raw_filename}')

    # Load the data from the CSV file
    with open(raw_filename, 'r') as f:
        reader = csv.DictReader(f)
        data = list(reader)

    # Set up the projection
    transformer = pyproj.Transformer.from_crs('epsg:2272', 'epsg:4326', always_xy=True)

    # Write the data to a JSONL file
    with open(prepared_filename, 'w') as f:
        for i, row in enumerate(data):
            shape = row.pop('shape')
            parts = shape.split(';')
            geom_wkt = parts[1] if len(parts) > 1 else parts[0]
            if not geom_wkt or geom_wkt.strip() == '' or geom_wkt == 'POINT EMPTY':
                row['geog'] = None
            else:
                geom = wkt.loads(geom_wkt)
                x, y = transformer.transform(geom.x, geom.y)
                row['geog'] = f'POINT({x} {y})'
            row = {k.lower(): v for k, v in row.items()}
            f.write(json.dumps(row) + '\n')

    print(f'Processed data into {prepared_filename}')

    # Upload the prepared data to the bucket
    prepared_blobname = 'tables/phl_opa_properties/phl_opa_properties.jsonl'
    prepared_bucket = storage_client.bucket(prepared_bucket_name)
    blob = prepared_bucket.blob(prepared_blobname)
    blob.upload_from_filename(prepared_filename)
    print(f'Uploaded to {prepared_blobname}')

    return f'Processed data into {prepared_filename} and uploaded to gs://{prepared_bucket_name}/{prepared_blobname}'