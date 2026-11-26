"""Vercel entry point: Vercel's Python runtime serves the ASGI `app` here.

All paths are rewritten to this function (see backend/vercel.json), and
FastAPI routes them as usual.
"""

from app.main import app  # noqa: F401
