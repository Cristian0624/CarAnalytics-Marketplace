from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from models import Listing


SORTABLE_COLUMNS = {
    "score": Listing.score,
    "price_eur": Listing.price_eur,
    "year": Listing.year,
    "mileage": Listing.mileage,
}


class ListingsRepository:
    """Builds parameterized SQLAlchemy queries for the scraped inventory."""

    def __init__(self, db: Session):
        self.db = db

    def filtered_statement(self, filters) -> Select:
        statement = select(Listing)
        multi_value_columns = {
            "brand": Listing.brand,
            "generation": Listing.generation,
            "fuel_type": Listing.fuel_type,
            "gearbox": Listing.gearbox,
            "body_types": Listing.body_type,
            "state": Listing.state,
            "drivetrains": Listing.drivetrain,
            "seller_type": Listing.seller_type,
            "registration_country": Listing.registration_country,
            "classes": Listing.class_,
        }
        for name, column in multi_value_columns.items():
            values = getattr(filters, name)
            if values:
                statement = statement.where(column.in_(values))

        # The ordinary model filter remains available without same_model. When
        # explicitly false, the caller is asking for comparable vehicles across
        # models; when true, a selected model is required and used.
        if filters.model and filters.same_model is not False:
            statement = statement.where(Listing.model.in_(filters.model))

        ranges = {
            "price": (Listing.price_eur, filters.price_min, filters.price_max),
            "mileage": (Listing.mileage, filters.mileage_min, filters.mileage_max),
            "year": (Listing.year, filters.year_min, filters.year_max),
            "engine": (Listing.engine, filters.engine_min, filters.engine_max),
            "horsepower": (Listing.horsepower, filters.horsepower_min, filters.horsepower_max),
            "doors": (Listing.doors, filters.doors_min, filters.doors_max),
            "seats": (Listing.seats, filters.seats_min, filters.seats_max),
            "score": (Listing.score, filters.score_min, filters.score_max),
        }
        for column, lower, upper in ranges.values():
            if lower is not None:
                statement = statement.where(column >= lower)
            if upper is not None:
                statement = statement.where(column <= upper)

        return self._apply_ordering(statement, filters.sort_by, filters.sort_order)

    @staticmethod
    def _apply_ordering(statement: Select, sort_by: str | None, sort_order: str | None) -> Select:
        if sort_by is None:
            return statement.order_by(Listing.id.asc())
        column = SORTABLE_COLUMNS[sort_by]
        direction = sort_order or "asc"
        ordered_column = column.desc().nullslast() if direction == "desc" else column.asc().nullslast()
        return statement.order_by(ordered_column, Listing.id.asc())

    def get_all(self, filters):
        return self.db.scalars(self.filtered_statement(filters)).all()

    def get_page(self, filters, page: int, limit: int):
        statement = self.filtered_statement(filters)
        total = self.db.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
        items = self.db.scalars(statement.offset((page - 1) * limit).limit(limit)).all()
        return items, total

    def get_by_id(self, listing_id: int):
        return self.db.get(Listing, listing_id)
