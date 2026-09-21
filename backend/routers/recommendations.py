from typing import Optional, Annotated, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
from models import CarListing
from schemas import (
    CarListingBase,
    RecommendationResponse,
)
from services.recommendation_service import (
    get_recommendations_for_listing,
    get_recommendations_by_attributes,
)

# Single tag to prevent duplicate sections in Swagger UI
router = APIRouter(
    tags=["recommendations"],
)


@router.get(
    "/recommendations/{car_id}",
    response_model=RecommendationResponse,
    summary="Get car recommendations for a specific listing",
    description="Recommends similar cars from the database within strict 10% price and 20% mileage tolerances, sorted by lowest tolerance deviation.",
)
def get_recommendations_by_id(
    car_id: int,
    db: Session = Depends(get_db),
):
    try:
        return get_recommendations_for_listing(
            db=db,
            listing_id=car_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/recommendations",
    response_model=RecommendationResponse,
    summary="Get recommendations based on chosen car attributes",
    description="Recommends cars based on brand, model, price, mileage, year, and body style within strict 10% price and 20% mileage tolerances. Car class is resolved internally from the database.",
)
def get_recommendations_custom(
    brand: Annotated[str, Query(description="Car brand (e.g. 'Volkswagen')")],
    model: Annotated[str, Query(description="Car model (e.g. 'Passat')")],
    price_eur: Annotated[float, Query(gt=0, description="Price in EUR (e.g. 10000)")],
    mileage: Annotated[int, Query(ge=0, description="Mileage in km (e.g. 180000)")],
    year: Annotated[int, Query(ge=1970, le=2030, description="Model year (e.g. 2015)")],
    body_type: Annotated[Optional[str], Query(description="Body style (e.g. 'Sedan', 'Universal', 'Hatchback')")] = None,
    db: Session = Depends(get_db),
):
    return get_recommendations_by_attributes(
        db=db,
        brand=brand,
        model=model,
        price_eur=price_eur,
        mileage=mileage,
        year=year,
        body_type=body_type,
    )


@router.get(
    "/cars/{car_id}",
    response_model=CarListingBase,
    summary="Get single car listing details",
)
def get_car_by_id(
    car_id: int,
    db: Session = Depends(get_db),
):
    listing = db.query(CarListing).filter(CarListing.id == car_id).first()
    if not listing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Car listing {car_id} not found",
        )
    return CarListingBase.from_orm_listing(listing)


@router.get(
    "/cars",
    response_model=List[CarListingBase],
    summary="Search all cars from the database",
    description="Searches all matching cars across categories: brand, model, price, mileage, year, body style.",
)
def search_cars(
    brand: Annotated[Optional[str], Query(description="Filter by brand")] = None,
    model: Annotated[Optional[str], Query(description="Filter by model")] = None,
    min_price: Annotated[Optional[float], Query(ge=0, description="Minimum price in EUR")] = None,
    max_price: Annotated[Optional[float], Query(ge=0, description="Maximum price in EUR")] = None,
    min_mileage: Annotated[Optional[int], Query(ge=0, description="Minimum mileage in km")] = None,
    max_mileage: Annotated[Optional[int], Query(ge=0, description="Maximum mileage in km")] = None,
    min_year: Annotated[Optional[int], Query(description="Minimum model year")] = None,
    max_year: Annotated[Optional[int], Query(description="Maximum model year")] = None,
    body_type: Annotated[Optional[str], Query(description="Filter by body style (e.g. Sedan, Universal, SUV)")] = None,
    db: Session = Depends(get_db),
):
    query = db.query(CarListing)

    if brand and isinstance(brand, str) and brand.strip():
        query = query.filter(CarListing.brand.ilike(f"%{brand.strip()}%"))
    if model and isinstance(model, str) and model.strip():
        query = query.filter(CarListing.model.ilike(f"%{model.strip()}%"))
    if min_price is not None and isinstance(min_price, (int, float)):
        query = query.filter(CarListing.price_eur >= min_price)
    if max_price is not None and isinstance(max_price, (int, float)):
        query = query.filter(CarListing.price_eur <= max_price)
    if min_mileage is not None and isinstance(min_mileage, int):
        query = query.filter(CarListing.mileage >= min_mileage)
    if max_mileage is not None and isinstance(max_mileage, int):
        query = query.filter(CarListing.mileage <= max_mileage)
    if min_year is not None and isinstance(min_year, int):
        query = query.filter(CarListing.year >= min_year)
    if max_year is not None and isinstance(max_year, int):
        query = query.filter(CarListing.year <= max_year)
    if body_type and isinstance(body_type, str) and body_type.strip():
        query = query.filter(CarListing.body_type.ilike(f"%{body_type.strip()}%"))

    items = query.all()
    return [CarListingBase.from_orm_listing(i) for i in items]
