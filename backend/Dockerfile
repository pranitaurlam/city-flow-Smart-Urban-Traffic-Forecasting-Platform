# Build from the repo root so the dataset and ml outputs are available:
#   docker build -f backend/Dockerfile .
FROM python:3.12-slim

WORKDIR /srv/backend

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY src/data/bangalore_traffic_pulse.csv /srv/src/data/
COPY ml/outputs/forecast_next_7_days.json ml/outputs/metrics.json /srv/ml/outputs/

EXPOSE 8000
# Seed on start so the database always reflects the bundled data, then serve.
# Hosts like Render pass the port to listen on in $PORT.
CMD ["sh", "-c", "python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
