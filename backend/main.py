from fastapi import FastAPI
from routers.users import router as users_router
from database import Base, engine
import models

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Car Analytics Marketplace API",
    description="Backend API for the automotive marketplace",
    version="1.0.0",
)

app.include_router(users_router)

@app.get("/")
def root():
    return {
        "message": "Welcome to the Car Analytics Marketplace API!"
    }
