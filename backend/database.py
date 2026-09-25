import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from urllib.parse import quote_plus

env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

def _get_database_url() -> str:
    """Read a complete URL or construct the Aiven-compatible URL from DB_* vars."""
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(
            "Set DATABASE_URL or all DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD environment variables."
        )

    return (
        f"postgresql+psycopg2://{quote_plus(os.environ['DB_USER'])}:"
        f"{quote_plus(os.environ['DB_PASSWORD'])}@{os.environ['DB_HOST']}:"
        f"{os.environ['DB_PORT']}/{os.environ['DB_NAME']}?sslmode=require"
    )


DATABASE_URL = _get_database_url()

def _create_engine():
    try:
        import psycopg2  # noqa: F401
        return create_engine(DATABASE_URL)
    except Exception:
        # Fallback to pg8000 for environments where psycopg2 C-extensions are blocked (e.g. Windows WDAC)
        import ssl
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(DATABASE_URL)
        pg8000_url = urlunparse((
            "postgresql+pg8000",
            parsed.netloc,
            parsed.path,
            parsed.params,
            "",
            parsed.fragment
        ))
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        return create_engine(pg8000_url, connect_args={"ssl_context": ssl_ctx})

engine = _create_engine()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
