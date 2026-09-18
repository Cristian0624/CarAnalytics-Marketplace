from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String
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
