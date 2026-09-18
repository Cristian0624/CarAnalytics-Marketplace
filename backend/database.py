import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from urllib.parse import quote_plus

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

engine = create_engine(DATABASE_URL)

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
