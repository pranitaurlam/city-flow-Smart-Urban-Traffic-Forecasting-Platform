"""Settings read from the environment of a hosted deployment."""

import pytest

from app.config import Settings


@pytest.mark.parametrize(
    "given, expected",
    [
        ("postgres://u:p@h:5432/db", "postgresql+psycopg://u:p@h:5432/db"),
        ("postgresql://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("postgresql+psycopg://u:p@h/db", "postgresql+psycopg://u:p@h/db"),
        ("sqlite:///x.db", "sqlite:///x.db"),
    ],
)
def test_hosted_postgres_urls_use_installed_driver(monkeypatch, given, expected):
    monkeypatch.setenv("DATABASE_URL", given)
    assert Settings().database_url == expected


def test_production_origins_from_env(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://cityflow.lovable.app, https://cityflow.app")
    assert Settings().cors_origin_list == ["https://cityflow.lovable.app", "https://cityflow.app"]
