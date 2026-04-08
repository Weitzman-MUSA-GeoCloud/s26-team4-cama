import os
import pathlib
import requests
import functions_framework
from google.cloud import storage
import json
from shapely.geometry import shape

DIRNAME = pathlib.Path(__file__).parent

#Prepare pwd parcels

@functions_framework.http
def prepare_pwd_parcels(request):
    print('Preparing PWD Parcels data...')

    raw_filename = DIRNAME / 'pwd_parcels.geojson'
    prepared_filename = DIRNAME / 'pwd_parcels/data.jsonl'


    raw_bucket_name = os.getenv('RAW_DATA_BUCKET', 'musa5090s26-team4-raw_data')
    prepared_bucket_name = os.getenv('PREPARED_DATA_BUCKET', 'musa5090s26-team4-prepared_data')
    storage_client = storage.Client()

    # Download the data from the bucket
    raw_blobname = 'pwd_parcels/pwd_parcels.geojson'
    raw_bucket = storage_client.bucket(raw_bucket_name)
    blob = raw_bucket.blob(raw_blobname)
    blob.download_to_filename(raw_filename)

    print(f'Downloaded to {raw_filename}')


    # Write the data to a JSONL file

    prepared_filename.parent.mkdir(parents=True, exist_ok=True)

    with open(raw_filename, 'r') as f:
        geojson = json.load(f)

    with open(prepared_filename, 'w') as f:
        for feature in geojson['features']:
            row = {k.lower(): v for k, v in feature['properties'].items()}
            if feature['geometry']:
                geom = shape(feature['geometry'])
                row['geog'] = geom.wkt
            else:
                row['geog'] = None
            f.write(json.dumps(row) + '\n')

    print(f'Processed data into {prepared_filename}')


    # Upload the prepared data to the bucket
    prepared_blobname = 'pwd_parcels/data.jsonl'
    prepared_bucket = storage_client.bucket(prepared_bucket_name)
    blob = prepared_bucket.blob(prepared_blobname)
    blob.upload_from_filename(prepared_filename)
    print(f'Uploaded to {prepared_blobname}')

    return f'Processed data into {prepared_filename} and uploaded to gs://{prepared_bucket_name}/{prepared_blobname}'