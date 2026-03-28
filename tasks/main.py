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
    prepared_blobname = 'opa_properties/data.jsonl'
    prepared_bucket = storage_client.bucket(prepared_bucket_name)
    blob = prepared_bucket.blob(prepared_blobname)
    blob.upload_from_filename(prepared_filename)
    print(f'Uploaded to {prepared_blobname}')

    return f'Processed data into {prepared_filename} and uploaded to gs://{prepared_bucket_name}/{prepared_blobname}'

#Load

from dotenv import load_dotenv
load_dotenv()

import os
import functions_framework
from google.cloud import bigquery

SOURCE_DATASET = os.getenv('SOURCE_DATASET', 'source')
CORE_DATASET = os.getenv('CORE_DATASET', 'core')
PREPARED_DATA_BUCKET = os.getenv('PREPARED_DATA_BUCKET', 'musa5090s26-team4-prepared_data')


@functions_framework.http
def load_opa_properties(request):
    bigquery_client = bigquery.Client()

    # Step 1: Create/update the external table in source dataset
    source_query = f'''
        CREATE OR REPLACE EXTERNAL TABLE `{SOURCE_DATASET}.opa_properties` (
            `objectid` STRING,
            `assessment_date` STRING,
            `basements` STRING,
            `beginning_point` STRING,
            `book_and_page` STRING,
            `building_code` STRING,
            `building_code_description` STRING,
            `category_code` STRING,
            `category_code_description` STRING,
            `census_tract` STRING,
            `central_air` STRING,
            `cross_reference` STRING,
            `date_exterior_condition` STRING,
            `depth` STRING,
            `exempt_building` STRING,
            `exempt_land` STRING,
            `exterior_condition` STRING,
            `fireplaces` STRING,
            `frontage` STRING,
            `fuel` STRING,
            `garage_spaces` STRING,
            `garage_type` STRING,
            `general_construction` STRING,
            `geographic_ward` STRING,
            `homestead_exemption` STRING,
            `house_extension` STRING,
            `house_number` STRING,
            `interior_condition` STRING,
            `location` STRING,
            `mailing_address_1` STRING,
            `mailing_address_2` STRING,
            `mailing_care_of` STRING,
            `mailing_city_state` STRING,
            `mailing_street` STRING,
            `mailing_zip` STRING,
            `market_value` STRING,
            `market_value_date` STRING,
            `number_of_bathrooms` STRING,
            `number_of_bedrooms` STRING,
            `number_of_rooms` STRING,
            `number_stories` STRING,
            `off_street_open` STRING,
            `other_building` STRING,
            `owner_1` STRING,
            `owner_2` STRING,
            `parcel_number` STRING,
            `parcel_shape` STRING,
            `quality_grade` STRING,
            `recording_date` STRING,
            `registry_number` STRING,
            `sale_date` STRING,
            `sale_price` STRING,
            `separate_utilities` STRING,
            `sewer` STRING,
            `site_type` STRING,
            `state_code` STRING,
            `street_code` STRING,
            `street_designation` STRING,
            `street_direction` STRING,
            `street_name` STRING,
            `suffix` STRING,
            `taxable_building` STRING,
            `taxable_land` STRING,
            `topography` STRING,
            `total_area` STRING,
            `total_livable_area` STRING,
            `type_heater` STRING,
            `unfinished` STRING,
            `unit` STRING,
            `utility` STRING,
            `view_type` STRING,
            `year_built` STRING,
            `year_built_estimate` STRING,
            `zip_code` STRING,
            `zoning` STRING,
            `pin` STRING,
            `building_code_new` STRING,
            `building_code_description_new` STRING,
            `geog` STRING
        )
        OPTIONS (
            format = 'JSON',
            uris = ['gs://{PREPARED_DATA_BUCKET}/opa_properties/data.jsonl']
        )
    '''
    bigquery_client.query_and_wait(source_query)
    print(f'Created/updated {SOURCE_DATASET}.opa_properties')

    # Step 2: Create/update the internal core table with property_id
    core_query = f'''
        CREATE OR REPLACE TABLE `{CORE_DATASET}.opa_properties` AS
        SELECT
            parcel_number AS property_id,
            *
        FROM `{SOURCE_DATASET}.opa_properties`
    '''
    bigquery_client.query_and_wait(core_query)
    print(f'Created/updated {CORE_DATASET}.opa_properties')

    return f'Successfully loaded opa_properties into {SOURCE_DATASET} and {CORE_DATASET} datasets'