from fastapi import FastAPI

app = FastAPI(
    title="Car Analytics Marketplace API",
    description="Backend API for the automotive marketplace",
    version="1.0.0",
)

@app.get("/")
def root():
    return "The Car Analytics Marketplace API is running."
