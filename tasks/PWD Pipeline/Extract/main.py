import os
import pathlib
import requests
import functions_framework
import csv
from google.cloud import storage
import json

DIRNAME = pathlib.Path(__file__).parent
BUCKET_NAME = os.environ.get('DATA_LAKE_BUCKET', 'musa5090s26-team4-raw_data')

#Extract PWD Parcels

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
def extract_pwd_parcels(request):
    print('Extracting PWD Parcels data...')
    filename = DIRNAME / 'pwd_parcels.geojson'
    blobname = 'pwd_parcels/pwd_parcels.geojson'
    extract_data(
        'https://hub.arcgis.com/api/v3/datasets/84baed491de44f539889f2af178ad85c_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1',
        filename,
        blobname,
    )
    return f'Downloaded to {filename} and uploaded to gs://{BUCKET_NAME}/{blobname}'
