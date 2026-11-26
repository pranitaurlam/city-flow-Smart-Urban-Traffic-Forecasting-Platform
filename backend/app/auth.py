"""Admin key check for endpoints that change shared data (events, venues)."""

import logging
import secrets

from fastapi import Header, HTTPException

from app.config import settings

log = logging.getLogger(__name__)


def require_admin(x_admin_token: str | None = Header(default=None)) -> None:
    expected = settings.admin_token
    if not expected:
        return  # Local development: no key configured.
    if not x_admin_token or not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(
            status_code=401,
            detail="Admin key missing or wrong. Enter the admin key to change events.",
        )


def warn_if_open() -> None:
    if not settings.admin_token:
        log.warning(
            "ADMIN_TOKEN is not set: anyone who can reach this API can add, edit "
            "and delete events. Set ADMIN_TOKEN before deploying."
        )
