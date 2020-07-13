from functools import lru_cache

from pydantic import BaseSettings

class Settings(BaseSettings):
    db_host: str
    db_name: str = "conduit"
    db_user: str
    db_pass: str
    db_segment_collection: str = "annotated_segments"

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()