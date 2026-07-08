from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # LLM
    groq_api_key: str = ""
    openai_api_key: str = ""
    llm_model: str = "llama3-70b-8192"

    # Neo4j
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"

    # App
    app_env: str = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173,http://localhost:8501"
    api_auth_token: str = ""
    admin_auth_token: str = ""
    allow_system_reset: bool = False

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"

    # FAISS
    faiss_index_path: str = "./data/faiss_index"

    # MLflow
    mlflow_tracking_uri: str = "./mlruns"

    model_config = {
        "env_file": ".env",
        "case_sensitive": False,
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
