
from dotenv import load_dotenv
load_dotenv()
import os
import functions_framework
from google.cloud import bigquery

#Load

SOURCE_DATASET = os.getenv('SOURCE_DATASET', 'source')
CORE_DATASET = os.getenv('CORE_DATASET', 'core')
PREPARED_DATA_BUCKET = os.getenv('PREPARED_DATA_BUCKET', 'musa5090s26-team4-prepared_data')


@functions_framework.http
def load_pwd_parcels(request):
    bigquery_client = bigquery.Client()

    # Step 1: Create/update the external table in source dataset
    source_query = f'''
        CREATE OR REPLACE EXTERNAL TABLE `{SOURCE_DATASET}.pwd_parcels` (
    objectid STRING, 
    parcelid STRING, 
    tencode STRING, 
    address STRING, 
    owner1 STRING, 
    owner2 STRING, 
    bldg_code STRING, 
    bldg_desc STRING, 
    brt_id STRING, 
    num_brt INTEGER, 
    num_accounts INTEGER, 
    gross_area FLOAT64, 
    pin STRING, 
    parcel_id STRING, 
    shape__area FLOAT64, 
    shape__length FLOAT64,
    geog STRING        
        )
        OPTIONS (
            format = 'JSON',
            uris = ['gs://{PREPARED_DATA_BUCKET}/pwd_parcels/data.jsonl']
        )
    '''
    bigquery_client.query_and_wait(source_query)
    print(f'Created/updated {SOURCE_DATASET}.pwd_parcels')

    # Step 2: Create/update the internal core table with property_id
    core_query = f'''
        CREATE OR REPLACE TABLE `{CORE_DATASET}.pwd_parcels` AS
        SELECT
            parcel_id AS property_id,
            * EXCEPT (geog),
            ST_GEOGFROMTEXT(geog) AS geog
        FROM `{SOURCE_DATASET}.pwd_parcels`
    '''
    bigquery_client.query_and_wait(core_query)
    print(f'Created/updated {CORE_DATASET}.pwd_parcels')

    return f'Successfully loaded pwd_parcels into {SOURCE_DATASET} and {CORE_DATASET} datasets'