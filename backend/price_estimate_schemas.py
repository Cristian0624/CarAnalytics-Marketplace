"""Stateless price-estimation input and JSON response contracts."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Category = Annotated[str, Field(min_length=1, max_length=200)]
Year = Annotated[int, Field(ge=1886)]
Mileage = Annotated[int, Field(ge=0, le=10_000_000)]


class PriceEstimateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand: Category
    model: Category
    generation: Category
    year: Year
    mileage: Mileage
    fuel_type: Category
    engine: Decimal | None = Field(default=None, ge=0, le=20, allow_inf_nan=False)
    gearbox: Category
    drivetrain: Category
    body_type: Category
    year_min: Year
    year_max: Year
    mileage_min: Mileage
    mileage_max: Mileage

    @model_validator(mode="after")
    def validate_ranges(self):
        if max(self.year, self.year_min, self.year_max) > date.today().year + 1:
            raise ValueError("Years cannot exceed next calendar year")
        if not self.year_min <= self.year <= self.year_max:
            raise ValueError("year_min <= year <= year_max is required")
        if not self.mileage_min <= self.mileage <= self.mileage_max:
            raise ValueError("mileage_min <= mileage <= mileage_max is required")
        return self


class ListingOptionsResponse(BaseModel):
    brand: list[str]
    model: list[str]
    generation: list[str]
    fuel_type: list[str]
    engine: list[float]
    gearbox: list[str]
    drivetrain: list[str]
    body_type: list[str]
    class_: list[str] = Field(alias="class")


class PriceRange(BaseModel):
    min: float
    max: float
    percentile_range: str


class Estimate(BaseModel):
    market_price: float
    sell_fast: PriceRange
    normal: PriceRange
    higher_asking: PriceRange


class Comparison(BaseModel):
    comparison_mode: Literal[
        "direct", "normal_fallback", "emergency_fallback",
        "very_limited", "single_comparable", "no_comparables",
    ]
    limited_market_data: bool
    direct_count: int
    normal_fallback_added: int
    emergency_fallback_added: int
    same_model_only: bool
    same_model_count: int
    similar_model_count: int
    total_used: int
    fetched: int
    eligible: int
    direct_comparables_available: int
    outliers_removed: int
    message: str


class EstimateSearch(BaseModel):
    brand: str
    model: str
    generation: str
    target_year: int
    target_mileage: int
    requested_year_min: int
    requested_year_max: int
    effective_year_min: int
    effective_year_max: int
    mileage_min: int
    mileage_max: int


class MarketStats(BaseModel):
    average_price: float
    median_price: float
    lowest_price: float
    highest_price: float
    average_year: float
    average_mileage: float


class DistributionBar(BaseModel):
    min_price: float
    max_price: float
    count: int
    percentage: float
    average_year: float | None
    average_mileage: float | None


class Distribution(BaseModel):
    interval: float
    bar_count: int
    bars: list[DistributionBar]


class PriceEstimateResponse(BaseModel):
    currency: str = "EUR"
    estimate_available: bool
    estimate: Estimate | None
    reference_price: float | None = None
    comparison: Comparison
    search: EstimateSearch
    market_stats: MarketStats | None
    distribution: Distribution | None
