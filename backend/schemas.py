from datetime import date, datetime
from decimal import Decimal
from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

class UserCreate(BaseModel):
    name : str = Field(min_length=2, max_length=100)
    email : EmailStr
    password : str = Field(min_length=8, max_length=128)
    phone : str | None = Field(default=None, max_length=30)
    seller_type : str = Field(default="private", pattern="^(private|dealer)$")

class UserLogin(BaseModel):
    email : EmailStr
    password : str = Field(min_length=8, max_length=128)

class UserResponse(BaseModel):
    id : int
    name : str
    email : EmailStr
    phone : str | None
    seller_type : str

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    name : str | None = Field(default=None, min_length=2, max_length=100)
    email : EmailStr | None = None
    phone : str | None = Field(default=None, max_length=30)
    seller_type : str | None = Field(default=None, pattern="^(private|dealer)$")

class PasswordChange(BaseModel):
    current_password : str = Field(min_length=1, max_length=128)
    new_password : str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def diff_passwords(self):
        if self.current_password == self.new_password:
            raise ValueError("New password must be different from the current password")
        return self

class MessageResponse(BaseModel):
    message : str

class TokenData(BaseModel):
    email : str | None = None


class ListingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str | None = None
    brand: str | None = None
    model: str | None = None
    price: Decimal | None = None
    currency: str | None = None
    generation: str | None = None
    year: int | None = None
    mileage: int | None = None
    engine: Decimal | None = None
    fuel_type: str | None = None
    gearbox: str | None = None
    state: str | None = None
    registration_country: str | None = None
    drivetrain: str | None = None
    body_type: str | None = None
    doors: int | None = None
    seats: int | None = None
    scraped_at: datetime | None = None
    horsepower: int | None = None
    offer_type: str | None = None
    seller_type: str | None = None
    original_price: Decimal | None = None
    original_currency: str | None = None
    price_eur: Decimal | None = None
    mileage_was_corrected: bool | None = None
    class_: str | None = Field(default=None, serialization_alias="class")
    score: Decimal | None = None


class PaginatedListingsResponse(BaseModel):
    items: list[ListingResponse]
    total: int
    page: int
    limit: int
    pages: int


class UserQueryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand: str | None = None
    model: str | None = None
    generation: str | None = None
    price_eur: Decimal | None = Field(default=None, ge=0)
    mileage: int | None = Field(default=None, ge=0)
    year: int | None = Field(default=None, ge=0)
    engine: Decimal | None = Field(default=None, ge=0)
    horsepower: int | None = Field(default=None, ge=0)
    fuel_type: str | None = None
    gearbox: str | None = None
    body_type: str | None = None
    state: str | None = None
    drivetrain: str | None = None
    doors: int | None = Field(default=None, ge=0)
    seats: int | None = Field(default=None, ge=0)
    seller_type: str | None = None
    registration_country: str | None = None
    same_model: bool | None = None
    class_: str | None = Field(
        default=None,
        validation_alias=AliasChoices("class", "class_"),
        serialization_alias="class",
    )
    score: Decimal | None = Field(default=None, ge=0)


class UserQueryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand: str | None = None
    model: str | None = None
    generation: str | None = None
    price_eur: Decimal | None = Field(default=None, ge=0)
    mileage: int | None = Field(default=None, ge=0)
    year: int | None = Field(default=None, ge=0)
    engine: Decimal | None = Field(default=None, ge=0)
    horsepower: int | None = Field(default=None, ge=0)
    fuel_type: str | None = None
    gearbox: str | None = None
    body_type: str | None = None
    state: str | None = None
    drivetrain: str | None = None
    doors: int | None = Field(default=None, ge=0)
    seats: int | None = Field(default=None, ge=0)
    seller_type: str | None = None
    registration_country: str | None = None
    same_model: bool | None = None
    class_: str | None = Field(
        default=None,
        validation_alias=AliasChoices("class", "class_"),
        serialization_alias="class",
    )
    score: Decimal | None = Field(default=None, ge=0)


class UserQueryResponse(UserQueryCreate):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    user_id: int
    created_at: datetime


# Car Listing & Recommendation Schemas

class CarListingBase(BaseModel):
    id: int
    brand: str
    model: str
    year: int | None = None
    mileage: int | None = None
    price: float | None = None
    currency: str | None = None
    price_eur: float | None = None
    engine: str | None = None
    fuel_type: str | None = None
    gearbox: str | None = None
    body_type: str | None = None
    generation: str | None = None
    horsepower: int | None = None
    drivetrain: str | None = None
    url: str | None = None
    link_999: str | None = Field(default=None, description="Direct link to listing on 999.md")
    seller_type: str | None = None
    car_class: str | None = Field(default=None, alias="class", validation_alias=None)

    @field_validator("engine", mode="before")
    @classmethod
    def convert_engine(cls, v):
        if v is None:
            return None
        return str(v)

    @classmethod
    def from_orm_listing(cls, listing):
        raw_url = getattr(listing, "url", None)
        if not raw_url:
            resolved_url = f"https://999.md/ro/{listing.id}"
        elif raw_url.startswith("http"):
            resolved_url = raw_url
        else:
            resolved_url = f"https://999.md{raw_url}"

        return cls(
            id=listing.id,
            brand=listing.brand,
            model=listing.model,
            year=listing.year,
            mileage=listing.mileage,
            price=float(listing.price) if listing.price is not None else None,
            currency=listing.currency,
            price_eur=listing.price_eur,
            engine=str(listing.engine) if listing.engine is not None else None,
            fuel_type=listing.fuel_type,
            gearbox=listing.gearbox,
            body_type=listing.body_type,
            generation=listing.generation,
            horsepower=listing.horsepower,
            drivetrain=listing.drivetrain,
            url=resolved_url,
            link_999=resolved_url,
            seller_type=listing.seller_type,
            car_class=getattr(listing, "class_", None),
        )

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class CarCategories(BaseModel):
    brand: str = Field(description="Car brand, e.g. Volkswagen, Audi")
    model: str = Field(description="Car model, e.g. Passat, A6")
    price_eur: float = Field(description="Price in EUR")
    mileage: int = Field(description="Mileage in km")
    year: int | None = Field(default=None, description="Model year")
    body: str | None = Field(default=None, description="Body style, e.g. Sedan, Universal")
    link_999: str | None = Field(default=None, description="Direct URL to listing on 999.md")


class RecommendedCarItem(CarListingBase):
    link_999: str = Field(description="Direct URL to the recommended listing on 999.md")
    similarity_score: float = Field(description="Match score from 0 to 100")
    price_diff_eur: float = Field(description="Price difference in EUR relative to target car")
    price_diff_percent: float = Field(description="Percentage price difference relative to target car")
    mileage_diff_km: int = Field(description="Mileage difference in KM relative to target car")
    mileage_diff_percent: float = Field(description="Percentage mileage difference relative to target car")
    match_reasons: list[str] = Field(default_factory=list, description="Explanations for why this car is recommended")
    categories: CarCategories = Field(description="Key category attributes: brand, model, price, mileage, year, body, link_999")


class RecommendationTarget(BaseModel):
    id: int | None = None
    brand: str
    model: str
    year: int
    mileage: int
    price_eur: float
    body_type: str | None = None
    car_class: str | None = Field(default=None, alias="class")
    categories: CarCategories | None = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class RecommendationResponse(BaseModel):
    target: RecommendationTarget
    total_found: int
    price_range_applied: dict[str, float]
    mileage_range_applied: dict[str, int]
    allowed_classes: list[str] = Field(default_factory=list)
    excluded_body_types: list[str] = Field(default_factory=list, description="Excluded body styles (none excluded)")
    recommendations: list[RecommendedCarItem] = Field(description="All recommendations sorted by similarity score")
    same_model_recommendations: list[RecommendedCarItem] = Field(default_factory=list, description="Recommendations of the same model (e.g. other Passats)")
    peer_competitor_recommendations: list[RecommendedCarItem] = Field(default_factory=list, description="Recommendations from competitor brands in the same vehicle class (e.g. Audi A6, BMW, Mercedes)")


class PaginatedCarsResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[CarListingBase]


# Market Trends Schemas
class TrendPoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    snapshot_date: date
    median_price: float
    avg_price: float
    min_price: float | None = None
    max_price: float | None = None
    listing_count: int


class MarketTrendResponse(BaseModel):
    brand: str
    model: str
    year: int
    total_snapshots: int
    earliest_date: date | None = None
    latest_date: date | None = None
    latest_median_price: float | None = None
    overall_change_eur: float | None = None
    overall_change_pct: float | None = None
    trend_direction: str = "stable"  # "up", "down", or "stable"
    data_points: list[TrendPoint]


class YearPriceSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    year: int
    median_price: float
    avg_price: float
    listing_count: int


class TrendFilterOptionsResponse(BaseModel):
    brands: list[str] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    years: list[YearPriceSummary] = Field(default_factory=list)


class ListingPricePoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    price_eur: float
    scraped_at: datetime


class ListingPriceHistoryResponse(BaseModel):
    listing_id: int
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    first_observed_price: float | None = None
    latest_price: float | None = None
    price_change_eur: float | None = None
    price_change_pct: float | None = None
    is_price_drop: bool = False
    history: list[ListingPricePoint]


class TrendsSyncResponse(BaseModel):
    message: str
    snapshot_date: date
    trends_records_processed: int
    observations_recorded: int


