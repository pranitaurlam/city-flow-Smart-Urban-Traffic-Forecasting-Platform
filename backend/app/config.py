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

    # Also allow the dashboard when opened from a phone or another computer on
    # the same private network (10.x, 172.16–31.x, 192.168.x), e.g. to use it as
    # a home-screen app over Wi-Fi.
    cors_origin_regex: str = (
        r"^http://(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+"
        r"|192\.168\.\d+\.\d+):(5173|8080|3000)$"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
