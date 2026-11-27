FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

# data/ holds small runtime state (today's Cloud usage); docker-compose mounts a named volume there.
RUN useradd --create-home --uid 1001 app && mkdir -p /app/data && chown app /app/data
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
