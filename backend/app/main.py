"""Точка входа FastAPI. Swagger UI: /api/docs"""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import register_error_handlers
from app.routers import auth, bookings, rooms, users
from app.services.rooms import upload_dir

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="MeetSpace API",
    description="Сервис бронирования переговорных и коворкингов",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # только наш фронтенд, не "*"
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

register_error_handlers(app)

for r in (auth.router, users.router, rooms.router, bookings.router):
    app.include_router(r, prefix="/api")

app.mount("/uploads", StaticFiles(directory=upload_dir()), name="uploads")


@app.get("/api/health", tags=["Служебное"])
def health():
    return {"status": "ok"}


# Для бесплатного хостинга (один сервис): если рядом лежит собранный фронтенд —
# отдаём его сами. В docker compose фронт раздаёт Nginx, и эта ветка не используется.
STATIC_DIR = Path(settings.static_dir) if settings.static_dir else None
if STATIC_DIR and (STATIC_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise StarletteHTTPException(status_code=404, detail="Not Found")
        file = STATIC_DIR / path
        if path and file.is_file() and file.resolve().is_relative_to(STATIC_DIR.resolve()):
            return FileResponse(file)
        return FileResponse(STATIC_DIR / "index.html")
