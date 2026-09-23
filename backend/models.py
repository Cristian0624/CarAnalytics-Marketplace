from sqlalchemy import (
    Boolean, Column, DateTime, Date, ForeignKey, Integer, Numeric, String, Float,
    BigInteger, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    seller_type = Column(String, nullable=False, default="private")

    queries = relationship("UserQuery", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")

class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash = Column(String(128), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now()) 
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    user = relationship("User", back_populates="sessions")

class Listing(Base):
    """Read-only mapping for listings populated by the scraper."""

    __tablename__ = "listings_cleaned"

    id = Column(Integer, primary_key=True)
    url = Column(String)
    brand = Column(String, index=True)
    model = Column(String, index=True)
    price = Column(Numeric)
    currency = Column(String)
    generation = Column(String)
    year = Column(Integer, index=True)
    mileage = Column(Integer, index=True)
    engine = Column(Numeric)
    fuel_type = Column(String)
    gearbox = Column(String)
    state = Column(String)
    registration_country = Column(String)
    drivetrain = Column(String)
    body_type = Column(String)
    doors = Column(Integer)
    seats = Column(Integer)
    scraped_at = Column(DateTime(timezone=True))
    horsepower = Column(Integer)
    offer_type = Column(String)
    seller_type = Column(String)
    original_price = Column(Numeric)
    original_currency = Column(String)
    price_eur = Column(Numeric, index=True)
    mileage_was_corrected = Column(Boolean)
    class_ = Column("class", String)
    score = Column("Score", Numeric)


class UserQuery(Base):
    __tablename__ = "user_queries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    brand = Column(String)
    model = Column(String)
    generation = Column(String)
    price_eur = Column(Numeric)
    mileage = Column(Integer)
    year = Column(Integer)
    engine = Column(Numeric)
    horsepower = Column(Integer)
    fuel_type = Column(String)
    gearbox = Column(String)
    body_type = Column(String)
    state = Column(String)
    drivetrain = Column(String)
    doors = Column(Integer)
    seats = Column(Integer)
    seller_type = Column(String)
    registration_country = Column(String)
    same_model = Column(Boolean)
    class_ = Column("class", String)
    score = Column(Numeric)

    user = relationship("User", back_populates="queries")


class CarListing(Base):
    __tablename__ = "listings_cleaned"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True, index=True)
    url = Column(Text, nullable=True)
    brand = Column(Text, nullable=False, index=True)
    model = Column(Text, nullable=False, index=True)
    price = Column(Numeric, nullable=True)
    currency = Column(Text, nullable=True)
    generation = Column(Text, nullable=True)
    year = Column(Integer, nullable=True, index=True)
    mileage = Column(Integer, nullable=True, index=True)
    engine = Column(Text, nullable=True)
    fuel_type = Column(Text, nullable=True)
    gearbox = Column(Text, nullable=True)
    state = Column(Text, nullable=True)
    registration_country = Column(Text, nullable=True)
    drivetrain = Column(Text, nullable=True)
    body_type = Column(Text, nullable=True, index=True)
    doors = Column(Integer, nullable=True)
    seats = Column(Integer, nullable=True)
    scraped_at = Column(DateTime, nullable=True)
    horsepower = Column(Integer, nullable=True)
    offer_type = Column(Text, nullable=True)
    seller_type = Column(Text, nullable=True)
    original_price = Column(Float, nullable=True)
    original_currency = Column(Text, nullable=True)
    price_eur = Column(Float, nullable=True, index=True)
    mileage_was_corrected = Column(Boolean, nullable=True)
    class_ = Column("class", Text, nullable=True, index=True)


class ModelClass(Base):
    __tablename__ = "model_class"
    __table_args__ = {"extend_existing": True}

    id = Column(BigInteger, primary_key=True, index=True)
    brand = Column(Text, nullable=True)
    model = Column(Text, nullable=True)
    market_segment = Column(Text, nullable=True)
    counterpart_brand = Column(Text, nullable=True)
    counterpart_model = Column(Text, nullable=True)


class MarketTrend(Base):
    __tablename__ = "market_trends"
    __table_args__ = (
        UniqueConstraint("brand", "model", "year", "snapshot_date", name="uq_market_trend_entry"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    brand = Column(String, nullable=False, index=True)
    model = Column(String, nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    avg_price = Column(Float, nullable=False)
    median_price = Column(Float, nullable=False)
    min_price = Column(Float, nullable=True)
    max_price = Column(Float, nullable=True)
    listing_count = Column(Integer, nullable=False)


class ListingPriceHistory(Base):
    __tablename__ = "listing_price_history"
    __table_args__ = (
        UniqueConstraint("listing_id", "scraped_at", name="uq_listing_price_history"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    listing_id = Column(BigInteger, nullable=False, index=True)
    brand = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True, index=True)
    year = Column(Integer, nullable=True, index=True)
    price_eur = Column(Float, nullable=False)
    scraped_at = Column(DateTime(timezone=True), nullable=False, index=True)

