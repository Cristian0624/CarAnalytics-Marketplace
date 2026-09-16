import sys
from pathlib import Path

# Ensure backend directory is in sys.path so modules like routers, database, models are found
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI
from routers.users import router as users_router
from routers.recommendations import router as recommendations_router
from database import Base, engine
import models

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Car Analytics Marketplace API",
    description="Backend API for the automotive marketplace with intelligent car recommendations",
    version="1.0.0",
)

app.include_router(users_router)
app.include_router(recommendations_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to the Car Analytics Marketplace API! Visit /docs for interactive Swagger UI."
    }

