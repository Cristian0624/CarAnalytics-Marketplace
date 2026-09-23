import sys
from pathlib import Path

# Ensure backend directory is in sys.path so modules like routers, database, models are found
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.users import router as users_router
from routers.recommendations import router as recommendations_router
from routers.listings import router as listings_router
from database import Base, engine
import models
import threading
from contextlib import asynccontextmanager

Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # run scoring in the background; skip if pandas isn't installed
    try:
        import eval
        thread = threading.Thread(target=eval.evaluate_and_update_db, args=("listings_cleaned",), daemon=True)
        thread.start()
    except ImportError as e:
        print(f"Skipping background scoring (missing dependency): {e}")
    yield

app = FastAPI(
    title="Car Analytics Marketplace API",
    description="Backend API for the automotive marketplace with intelligent car recommendations",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(recommendations_router)
app.include_router(listings_router)


@app.get("/")
def root():
    return {
        "message": "Welcome to the Car Analytics Marketplace API! Visit /docs for interactive Swagger UI."
    }

