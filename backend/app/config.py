from pathlib import Path

from pydantic import field_validator
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

    # Also allow the dashboard on any local port (Vite moves to 8081, 8082...
    # when 8080 is taken), and when opened from a phone or another computer on
    # the same private network (10.x, 172.16–31.x, 192.168.x), e.g. to use it
    # as a home-screen app over Wi-Fi.
    cors_origin_regex: str = (
        r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"
        r"|^http://(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+"
        r"|192\.168\.\d+\.\d+):(5173|3000|80[89]\d)$"
    )

    # Used to check incident photos (app/image_check.py). The first key that is
    # set wins: Gemini, then OpenAI, then Anthropic. With none, reports are
    # refused. All also work as plain environment variables.
    # Key required to add, edit, import or delete events and venues (sent as
    # the X-Admin-Token header). Unset means anyone can change them, which is
    # only acceptable on your own machine; always set it when deployed.
    admin_token: str | None = None

    # How many proxies (load balancers) sit in front of this server and append
    # to X-Forwarded-For. 0 = clients connect directly (local). On a host like
    # Render it's usually 1. Used to tell users apart for the report limit.
    trusted_proxy_hops: int = 0

    gemini_api_key: str | None = None
    gemini_image_check_model: str = "gemini-3.8-flash"
    openai_api_key: str | None = None
    openai_image_check_model: str = "gpt-4.1-mini"
    anthropic_api_key: str | None = None
    image_check_model: str = "claude-opus-5-5"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, url: str) -> str:
        """Hosts like Render and Heroku hand out postgres:// or postgresql://
        URLs; SQLAlchemy reads those as psycopg2, which isn't installed."""
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
