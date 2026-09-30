from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from database import get_db
from schemas import (
    MarketTrendResponse,
    TrendFilterOptionsResponse,
    ListingPriceHistoryResponse,
    TrendsSyncResponse,
)
from services import trends as trends_service

router = APIRouter(prefix="/trends", tags=["trends"])


@router.get(
    "",
    response_model=MarketTrendResponse,
    summary="Get historical price trendline for a vehicle",
    description="Returns chronological median and average price trend data points for a specific vehicle brand, model, and year.",
)
def get_vehicle_trends(
    brand: Annotated[str, Query(description="Vehicle brand (e.g. Volkswagen, BMW, KIA)", examples=["Volkswagen"])],
    model: Annotated[str, Query(description="Vehicle model (e.g. Passat, 3 Series, Sportage)", examples=["Passat"])],
    year: Annotated[int, Query(description="Manufacturing year (e.g. 2010)", ge=1970, le=2030, examples=[2010])],
    db: Session = Depends(get_db),
):
    return trends_service.get_market_trends(
        brand=brand,
        model=model,
        year=year,
        db=db,
    )


@router.get(
    "/options",
    response_model=TrendFilterOptionsResponse,
    summary="Get available filter options for trends",
    description="Provides cascading dropdown options for Brand, Model, and Year that have historical market trend records.",
)
def get_trends_filter_options(
    brand: Annotated[str | None, Query(description="Selected brand to list corresponding models")] = None,
    model: Annotated[str | None, Query(description="Selected model to list corresponding manufacturing years")] = None,
    db: Session = Depends(get_db),
):
    return trends_service.get_trend_options(
        brand=brand,
        model=model,
        db=db,
    )


@router.get(
    "/listings/{listing_id}",
    response_model=ListingPriceHistoryResponse,
    summary="Get price history and price-drop tracking for a specific car listing",
    description="Returns all recorded price observations over time for an individual car listing, showing any seller price reductions.",
)
def get_listing_price_history(
    listing_id: int,
    db: Session = Depends(get_db),
):
    return trends_service.get_listing_price_history(
        listing_id=listing_id,
        db=db,
    )


@router.post(
    "/sync",
    response_model=TrendsSyncResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate and synchronize market trends",
    description="Aggregates cleaned listing prices into historical time-series snapshots and individual car price history. If target_date is omitted, the latest scrape date in the database is automatically processed.",
)
def trigger_trends_sync(
    target_date: Annotated[date | None, Query(description="Specific scrape date to process (YYYY-MM-DD). If omitted, latest scrape date is used.")] = None,
    db: Session = Depends(get_db),
):
    return trends_service.sync_market_trends(
        target_date=target_date,
        db=db,
    )
