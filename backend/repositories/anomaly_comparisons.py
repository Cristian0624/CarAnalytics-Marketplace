"""Database listings used by anomaly price, mileage, and specification checks."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import CarListing, Listing


class AnomalyComparisonsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_prices(self, brand, model, generation, listing_id=None):
        statement = select(Listing.price_eur).where(
            Listing.brand == brand,
            Listing.model == model,
        )
        if generation is not None:
            statement = statement.where(Listing.generation == generation)
        if listing_id is not None:
            statement = statement.where(Listing.id != listing_id)

        return self.db.scalars(statement).all()

    def get_characteristics(self, brand, model, generation, listing_id=None):
        statement = select(
            CarListing.year, CarListing.mileage, CarListing.engine, CarListing.fuel_type,
            CarListing.gearbox, CarListing.drivetrain, CarListing.body_type,
        ).where(CarListing.brand == brand, CarListing.model == model)
        if generation is not None:
            statement = statement.where(CarListing.generation == generation)
        if listing_id is not None:
            statement = statement.where(CarListing.id != listing_id)

        return self.db.execute(statement).mappings().all()

    def get_model_count(self, brand, model, listing_id=None):
        statement = select(func.count()).select_from(Listing).where(
            Listing.brand == brand,
            Listing.model == model,
        )
        if listing_id is not None:
            statement = statement.where(Listing.id != listing_id)
        return self.db.scalar(statement) or 0
