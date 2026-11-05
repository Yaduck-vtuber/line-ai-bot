FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py main.py ./
COPY templates/ ./templates/

EXPOSE 8080

CMD exec gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 120
