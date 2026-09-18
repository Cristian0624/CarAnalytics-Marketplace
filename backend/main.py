from contextlib import asynccontextmanager
from fastapi import FastAPI
from routers.users import router as users_router
from routers.listings import router as listings_router
from database import Base, engine
import models
import eval
import threading

Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # run in the background
    thread = threading.Thread(target=eval.evaluate_and_update_db, args=("listings_cleaned",), daemon=True)
    thread.start()
    yield

app = FastAPI(
    title="Car Analytics Marketplace API",
    description="Backend API for the automotive marketplace",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(users_router)
app.include_router(listings_router)

@app.get("/")
def root():
    return {
        "message": "Welcome to the Car Analytics Marketplace API!"
    }
