FROM python:3.13-slim
WORKDIR /app
COPY export_property_tile_info.py .
RUN pip install google-cloud-bigquery google-cloud-storage
CMD ["python", "export_property_tile_info.py", "--project", "musa5090s26-team4"]