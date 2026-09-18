from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from repositories.listings import ListingsRepository
from repositories.user_queries import UserQueriesRepository
from routers.users import get_current_user
from schemas import ListingResponse, PaginatedListingsResponse, UserQueryCreate, UserQueryResponse, UserQueryUpdate
from services.listings import ListingsService, UserQueriesService


router = APIRouter(tags=["listings"])


class ListingFilters:
    def __init__(
        self,
        brand: list[str] | None = Query(None), model: list[str] | None = Query(None), generation: list[str] | None = Query(None),
        price_min: Decimal | None = Query(None, ge=0), price_max: Decimal | None = Query(None, ge=0),
        mileage_min: int | None = Query(None, ge=0), mileage_max: int | None = Query(None, ge=0),
        year_min: int | None = Query(None, ge=0), year_max: int | None = Query(None, ge=0),
        engine_min: Decimal | None = Query(None, ge=0), engine_max: Decimal | None = Query(None, ge=0),
        horsepower_min: int | None = Query(None, ge=0), horsepower_max: int | None = Query(None, ge=0),
        fuel_type: list[str] | None = Query(None), gearbox: list[str] | None = Query(None), body_types: list[str] | None = Query(None),
        state: list[str] | None = Query(None), drivetrains: list[str] | None = Query(None),
        doors_min: int | None = Query(None, ge=0), doors_max: int | None = Query(None, ge=0),
        seats_min: int | None = Query(None, ge=0), seats_max: int | None = Query(None, ge=0),
        seller_type: list[str] | None = Query(None), registration_country: list[str] | None = Query(None),
        same_model: bool | None = Query(None), classes: list[str] | None = Query(None, alias="class"),
        score_min: Decimal | None = Query(None, ge=0), score_max: Decimal | None = Query(None, ge=0),
        sort_by: str | None = Query(None, pattern="^(score|price_eur|year|mileage)$"),
        sort_order: str | None = Query(None, pattern="^(asc|desc)$"),
    ):
        self.brand = _split_values(brand)
        self.model = _split_values(model)
        self.generation = _split_values(generation)
        self.fuel_type = _split_values(fuel_type)
        self.gearbox = _split_values(gearbox)
        self.body_types = _split_values(body_types)
        self.state = _split_values(state)
        self.drivetrains = _split_values(drivetrains)
        self.seller_type = _split_values(seller_type)
        self.registration_country = _split_values(registration_country)
        self.classes = _split_values(classes)
        self.same_model = same_model
        self.sort_by = sort_by
        self.sort_order = sort_order
        for name, value in locals().items():
            if name.endswith("_min") or name.endswith("_max"):
                setattr(self, name, value)
        for minimum, maximum, label in (
            (price_min, price_max, "price"), (mileage_min, mileage_max, "mileage"),
            (year_min, year_max, "year"), (engine_min, engine_max, "engine"),
            (horsepower_min, horsepower_max, "horsepower"), (doors_min, doors_max, "doors"),
            (seats_min, seats_max, "seats"), (score_min, score_max, "score"),
        ):
            if minimum is not None and maximum is not None and minimum > maximum:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"{label}_min must be less than or equal to {label}_max")

        if self.same_model is True and not self.model:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="model must be provided when same_model is true",
            )


def _split_values(value: list[str] | None) -> list[str] | None:
    if value is None:
        return None
    values = [part.strip() for item in value for part in item.split(",") if part.strip()]
    if not values:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Comma-separated filters must contain at least one value")
    return values


def get_listings_service(db: Session = Depends(get_db)) -> ListingsService:
    return ListingsService(ListingsRepository(db))


def get_user_queries_service(db: Session = Depends(get_db)) -> UserQueriesService:
    return UserQueriesService(UserQueriesRepository(db))


@router.get("/listings", response_model=list[ListingResponse])
def search_listings(filters: Annotated[ListingFilters, Depends()], service: Annotated[ListingsService, Depends(get_listings_service)]):
    return service.search(filters)


@router.get("/listings/paginated", response_model=PaginatedListingsResponse)
def search_listings_paginated(
    filters: Annotated[ListingFilters, Depends()],
    service: Annotated[ListingsService, Depends(get_listings_service)],
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    return service.search_paginated(filters, page, limit)


@router.get("/listings/{listing_id}", response_model=ListingResponse)
def get_listing(listing_id: int, service: Annotated[ListingsService, Depends(get_listings_service)]):
    listing = service.get_listing(listing_id)
    if listing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    return listing


@router.get("/analysis", response_model=list[UserQueryResponse])
def list_analyses(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[UserQueriesService, Depends(get_user_queries_service)],
):
    return service.list_for_user(current_user.id)


@router.get("/analysis/{user_query_id}", response_model=UserQueryResponse)
def get_analysis(
    user_query_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[UserQueriesService, Depends(get_user_queries_service)],
):
    query = service.get(user_query_id, current_user.id)
    if query is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis query not found")
    return query


@router.post("/analysis", response_model=UserQueryResponse, status_code=status.HTTP_201_CREATED)
def create_analysis(
    payload: UserQueryCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[UserQueriesService, Depends(get_user_queries_service)],
):
    return service.create(current_user.id, payload.model_dump(exclude_unset=True, by_alias=False))


@router.patch("/analysis/{user_query_id}", response_model=UserQueryResponse)
def update_analysis(
    user_query_id: int,
    payload: UserQueryUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[UserQueriesService, Depends(get_user_queries_service)],
):
    query = service.update(
        user_query_id,
        current_user.id,
        payload.model_dump(exclude_unset=True, by_alias=False),
    )
    if query is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis query not found")
    return query


@router.delete("/analysis/{user_query_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_analysis(
    user_query_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[UserQueriesService, Depends(get_user_queries_service)],
):
    if not service.delete(user_query_id, current_user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis query not found")
