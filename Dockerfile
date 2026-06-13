FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

# Install torch CPU first in isolation with no deps upgrade
RUN pip install --no-cache-dir \
    torch==2.2.2+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    --no-deps

# Install transformers pinned BEFORE sentence-transformers
RUN pip install --no-cache-dir \
    transformers==4.38.2 \
    tokenizers==0.15.2 \
    huggingface-hub==0.21.4 \
    safetensors==0.4.2 \
    numpy==1.26.4

# Install sentence-transformers without upgrading deps
RUN pip install --no-cache-dir sentence-transformers==2.6.1 --no-deps

# Install everything else
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
RUN mkdir -p /app/data

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
