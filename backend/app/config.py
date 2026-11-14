from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables or backend/.env.

    DATABASE_URL defaults to a local SQLite file so the API runs with zero
    setup. Point it at PostgreSQL (the project's target store) with e.g.
    postgresql+psycopg://cityflow:cityflow@localhost:5432/cityflow
    """

    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    database_url: str = f"sqlite:///{BACKEND_DIR / 'cityflow.db'}"
    # Comma-separated list of origins allowed to call the API from a browser.
    cors_origins: str = ",".join(
        f"http://{host}:{port}"
        for host in ("localhost", "127.0.0.1")
        for port in (5173, 8080, 3000)
    )

    traffic_csv: Path = REPO_ROOT / "src" / "data" / "bangalore_traffic_pulse.csv"
    forecast_json: Path = REPO_ROOT / "ml" / "outputs" / "forecast_next_7_days.json"
    metrics_json: Path = REPO_ROOT / "ml" / "outputs" / "metrics.json"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
