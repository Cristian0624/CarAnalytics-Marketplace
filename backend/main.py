import sys
from pathlib import Path

# Ensure backend directory is in sys.path so modules like routers, database, models are found
backend_dir = str(Path(__file__).resolve().parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.users import router as users_router
from routers.predictions import router as predictions_router
from routers.recommendations import router as recommendations_router
from routers.listings import router as listings_router
from routers.price_estimate import router as price_estimate_router
from routers.trends import router as trends_router
from database import Base, engine
import models
import threading
from contextlib import asynccontextmanager

Base.metadata.create_all(bind=engine)

def _run_eval():
    try:
        import eval
        eval.evaluate_and_update_db("listings_cleaned")
    except Exception as e:
        print(f"Background evaluation worker skipped: {e}")

    try:
        from database import SessionLocal
        from services.trends import sync_all_unprocessed_trends
        with SessionLocal() as db:
            synced = sync_all_unprocessed_trends(db)
            if synced:
                print(f"[TRENDS] Auto-synced {len(synced)} new trend snapshot(s).", flush=True)
    except Exception as e:
        print(f"[TRENDS] Background trends sync skipped: {e}", flush=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    thread = threading.Thread(target=_run_eval, daemon=True)
    thread.start()
    yield

app = FastAPI(
    title="Car Analytics Marketplace API",
    description="Backend API for the automotive marketplace with intelligent car recommendations",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, replace with frontend URL e.g. ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(predictions_router)
app.include_router(recommendations_router)
app.include_router(listings_router)
app.include_router(price_estimate_router)
app.include_router(trends_router)

@app.get("/")
def root():
    return {
        "message": "Welcome to the Car Analytics Marketplace API! Visit /docs for interactive Swagger UI."
    }

