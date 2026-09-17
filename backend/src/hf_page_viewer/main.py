from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from hf_page_viewer import __version__
from hf_page_viewer.api.xml import router as xml_router

app = FastAPI(
    title="HF Page Viewer API",
    version=__version__,
    description="Backend API for OCR/layout inspection and validation.",
)

app.include_router(xml_router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    """Return a minimal liveness payload for Spaces and container probes."""

    return {
        "status": "ok",
        "application": "HF Page Viewer",
        "version": __version__,
    }


STATIC_DIR = Path(os.getenv("HF_PAGE_VIEWER_STATIC_DIR", "/app/static"))

if STATIC_DIR.is_dir():
    assets_dir = STATIC_DIR / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{requested_path:path}", include_in_schema=False)
    def serve_spa(requested_path: str) -> FileResponse:
        """Serve built frontend files and fall back to the SPA entry point."""

        static_root = STATIC_DIR.resolve()
        candidate = (STATIC_DIR / requested_path).resolve()
        if candidate.is_relative_to(static_root) and candidate.is_file():
            return FileResponse(candidate)

        index = STATIC_DIR / "index.html"
        if index.is_file():
            return FileResponse(index)

        raise HTTPException(status_code=404, detail="Frontend build not found")
