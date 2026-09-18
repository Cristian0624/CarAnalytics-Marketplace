from datetime import datetime
from decimal import Decimal
from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field, model_validator

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


class Token(BaseModel):
    access_token : str
    token_type : str

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
