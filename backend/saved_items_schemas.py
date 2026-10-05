"""Validated inputs for saved searches, assessments and favourites."""
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

from anomaly_risk_schemas import AnomalyRiskRequest
from routers.listings import ListingFilters
from schemas import ListingResponse

Name = Annotated[str, Field(min_length=1, max_length=120)]
Values = Annotated[list[Annotated[str, Field(min_length=1, max_length=200)]], Field(min_length=1, max_length=100)]
NonnegativeDecimal = Annotated[Decimal, Field(ge=0, allow_inf_nan=False)]
NonnegativeInt = Annotated[int, Field(ge=0)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class SavedSearchFilters(InputModel):
    brand: Values | None = None
    model: Values | None = None
    generation: Values | None = None
    price_min: NonnegativeDecimal | None = None
    price_max: NonnegativeDecimal | None = None
    mileage_min: NonnegativeInt | None = None
    mileage_max: NonnegativeInt | None = None
    year_min: NonnegativeInt | None = None
    year_max: NonnegativeInt | None = None
    engine_min: NonnegativeDecimal | None = None
    engine_max: NonnegativeDecimal | None = None
    horsepower_min: NonnegativeInt | None = None
    horsepower_max: NonnegativeInt | None = None
    fuel_type: Values | None = None
    gearbox: Values | None = None
    body_types: Values | None = None
    state: Values | None = None
    drivetrains: Values | None = None
    doors_min: NonnegativeInt | None = None
    doors_max: NonnegativeInt | None = None
    is_comparison: bool | None = None
    cars: list | None = None
    seats_min: NonnegativeInt | None = None
    seats_max: NonnegativeInt | None = None
    seller_type: Values | None = None
    registration_country: Values | None = None
    # Accept historical saves, but never forward the retired flag to filtering.
    same_model: bool | None = Field(default=None, exclude=True)
    classes: Values | None = Field(default=None, alias="class")
    score_min: NonnegativeDecimal | None = None
    score_max: NonnegativeDecimal | None = None
    sort_by: Literal["score", "price_eur", "year", "mileage"] | None = None
    sort_order: Literal["asc", "desc"] | None = None

    @model_validator(mode="after")
    def validate_filters(self):
        # Reuse the live endpoint's range and vehicle selection checks.
        self.to_listing_filters()
        return self

    def to_listing_filters(self):
        # Supply all fields so FastAPI Query defaults never enter direct calls.
        return ListingFilters(**self.model_dump(exclude={"is_comparison", "cars"}))


class SavedSearchCreate(InputModel):
    name: Name
    filters: SavedSearchFilters


class SavedSearchUpdate(InputModel):
    name: Name | None = None
    filters: SavedSearchFilters | None = None

    @model_validator(mode="after")
    def require_changes(self):
        if not self.model_fields_set or any(getattr(self, key) is None for key in self.model_fields_set):
            raise ValueError("Provide name or filters; neither can be null")
        return self


class SavedRiskCreate(InputModel):
    name: Name
    input: AnomalyRiskRequest


class SavedRiskRename(InputModel):
    name: Name


class FavouriteCreate(InputModel):
    listing_id: int = Field(gt=0, le=9223372036854775807)
    notes: str | None = Field(default=None, max_length=1000)


class FavouriteUpdate(InputModel):
    notes: str | None = Field(max_length=1000)


class SavedItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime


class SavedSearchResponse(SavedItemResponse):
    name: str
    # Old combinations must remain readable/editable after validation changes.
    filters: dict[str, Any]


class SavedRiskResponse(SavedItemResponse):
    name: str
    # Historical payloads remain readable when the live endpoint schema changes.
    input: dict[str, Any]
    result: dict[str, Any]


class FavouriteResponse(SavedItemResponse):
    listing_id: int
    listing_url: str | None
    snapshot: dict[str, Any]
    notes: str | None


class FavouriteDetail(FavouriteResponse):
    available: bool
    current_listing: ListingResponse | None


T = TypeVar("T")


class SavedPage(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    limit: int
    pages: int
