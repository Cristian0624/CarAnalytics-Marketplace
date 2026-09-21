from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.users import router as users_router
from database import Base, engine
import models

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Car Analytics Marketplace API",
    description="Backend API for the automotive marketplace",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)

@app.get("/")
def root():
    return {
        "message": "Welcome to the Car Analytics Marketplace API!"
    }
