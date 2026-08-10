"""Конфіг застосунку. Усе — з env, жодних секретів у коді."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # postgresql+asyncpg://user:pass@host:port/db
    database_url: str = "postgresql+asyncpg://poker:poker@localhost:5433/poker_trainer"

    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_ttl_hours: int = 24

    cookie_name: str = "pt_access"
    cookie_domain: str | None = None
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    # Кома-розділений список у env: CORS_ORIGINS=http://localhost:5173,https://app.example.com
    cors_origins: str = "http://localhost:5173"

    environment: str = "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
