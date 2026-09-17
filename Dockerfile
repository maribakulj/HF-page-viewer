FROM node:22-alpine AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_PAGE_VIEWER_STATIC_DIR=/app/static

WORKDIR /app

COPY backend/ /app/backend/
RUN pip install --no-cache-dir /app/backend

COPY --from=frontend-build /build/frontend/dist /app/static

RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 7860

CMD ["uvicorn", "hf_page_viewer.main:app", "--host", "0.0.0.0", "--port", "7860"]
