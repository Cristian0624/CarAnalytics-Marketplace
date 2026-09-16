from sqlalchemy import Column, Integer, BigInteger, String, Text, Float, Boolean, DateTime, Numeric
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    password = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    seller_type = Column(String, nullable=False, default="private")


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