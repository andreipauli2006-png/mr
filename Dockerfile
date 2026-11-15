# Образ «всё в одном» для бесплатного хостинга (Render): фронтенд собирается
# и раздаётся самим FastAPI. Для локального запуска используйте docker compose.
FROM node:22-alpine AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STATIC_DIR=/app/static UPLOAD_DIR=/app/uploads
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=frontend /fe/dist /app/static
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
