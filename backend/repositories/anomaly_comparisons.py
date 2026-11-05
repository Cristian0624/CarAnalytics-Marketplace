"""Database listings used by anomaly price, mileage, and specification checks."""
import re
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from models import CarListing, Listing


class AnomalyComparisonsRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_prices(self, brand, model, generation, listing_id=None, year=None, fuel_type=None, engine=None, min_samples=15):
        statement = select(Listing.price_eur).where(
            Listing.brand == brand,
            Listing.model == model,
        )
        if generation is not None:
            statement = statement.where(Listing.generation == generation)
        if listing_id is not None:
            statement = statement.where(Listing.id != listing_id)

        if year is None:
            return self.db.scalars(statement).all()

        # Tier 1 (Tight): fuel_type + engine +-0.3 + year +-1
        if fuel_type is not None and engine is not None:
            try:
                eng_val = float(engine)
                if eng_val > 0:
                    stmt_t1 = statement.where(
                        Listing.fuel_type == fuel_type,
                        Listing.engine.between(eng_val - 0.35, eng_val + 0.35),
                        Listing.year.between(year - 1, year + 1)
                    )
                    prices = self.db.scalars(stmt_t1).all()
                    if len(prices) >= min_samples:
                        return prices
            except (ValueError, TypeError):
                pass

        # Tier 1b: fuel_type + year +- 1
        if fuel_type is not None:
            stmt_t1b = statement.where(
                Listing.fuel_type == fuel_type,
                Listing.year.between(year - 1, year + 1)
            )
            prices = self.db.scalars(stmt_t1b).all()
            if len(prices) >= min_samples:
                return prices

        # Tier 2: Exact Year (all fuels)
        stmt_exact = statement.where(Listing.year == year)
        prices = self.db.scalars(stmt_exact).all()
        if len(prices) >= min_samples:
            return prices

        # Tier 3: Dynamic Window +- 1 Year
        stmt_w1 = statement.where(Listing.year.between(year - 1, year + 1))
        prices = self.db.scalars(stmt_w1).all()
        if len(prices) >= min_samples:
            return prices

        # Tier 4: Dynamic Window +- 2 Years
        stmt_w2 = statement.where(Listing.year.between(year - 2, year + 2))
        prices = self.db.scalars(stmt_w2).all()
        if len(prices) >= min_samples:
            return prices

        # Tier 5: Fallback to entire generation
        return self.db.scalars(statement).all()

    def get_characteristics(self, brand, model, generation, listing_id=None, year=None, fuel_type=None, engine=None, min_samples=15):
        statement = select(
            CarListing.year, CarListing.mileage, CarListing.engine, CarListing.fuel_type,
            CarListing.gearbox, CarListing.drivetrain, CarListing.body_type,
        ).where(CarListing.brand == brand, CarListing.model == model)
        if generation is not None:
            statement = statement.where(CarListing.generation == generation)
        if listing_id is not None:
            statement = statement.where(CarListing.id != listing_id)

        if year is None:
            return self.db.execute(statement).mappings().all()

        # Tier 1 (Tight): fuel_type + engine +-0.3 + year +-1
        if fuel_type is not None and engine is not None:
            try:
                eng_val = float(engine)
                if eng_val > 0:
                    stmt_t1 = statement.where(
                        CarListing.fuel_type == fuel_type,
                        func.cast(CarListing.engine, func.numeric).between(eng_val - 0.35, eng_val + 0.35),
                        CarListing.year.between(year - 1, year + 1)
                    )
                    chars = self.db.execute(stmt_t1).mappings().all()
                    if len(chars) >= min_samples:
                        return chars
            except (ValueError, TypeError, Exception):
                pass

        # Tier 1b: fuel_type + year +- 1
        if fuel_type is not None:
            try:
                stmt_t1b = statement.where(
                    CarListing.fuel_type == fuel_type,
                    CarListing.year.between(year - 1, year + 1)
                )
                chars = self.db.execute(stmt_t1b).mappings().all()
                if len(chars) >= min_samples:
                    return chars
            except Exception:
                pass

        # Tier 2: Exact Year
        stmt_exact = statement.where(CarListing.year == year)
        chars = self.db.execute(stmt_exact).mappings().all()
        if len(chars) >= min_samples:
            return chars

        # Tier 3: Dynamic Window +- 1 Year
        stmt_w1 = statement.where(CarListing.year.between(year - 1, year + 1))
        chars = self.db.execute(stmt_w1).mappings().all()
        if len(chars) >= min_samples:
            return chars

        # Tier 4: Dynamic Window +- 2 Years
        stmt_w2 = statement.where(CarListing.year.between(year - 2, year + 2))
        chars = self.db.execute(stmt_w2).mappings().all()
        if len(chars) >= min_samples:
            return chars

        # Tier 5: Fallback to entire generation
        return self.db.execute(statement).mappings().all()

    def get_listing_text_signals(self, listing_id):
        if not listing_id:
            return {"is_urgent": False, "is_defective": False}
        try:
            row = self.db.execute(
                text("SELECT title, description_ro, description_ru, state FROM listings_cleaned WHERE id = :lid"),
                {"lid": listing_id}
            ).fetchone()
            if not row:
                return {"is_urgent": False, "is_defective": False}

            combined = " ".join([str(x) for x in row if x is not None]).lower()
            cleaned = re.sub(
                r'(?:f[aă]r[aă]|nu\s+necesit[aă]|f[aă]r[aă]\s+nici\s*o?)\s+(?:investi[tț]ii[^\s]*|probleme|defecte|accidente|repara[tț]ii)',
                ' ', combined
            )
            cleaned = re.sub(
                r'(?:не\s+требует|без)\s+(?:вложений|проблем|нареканий|дтп|замечаний)',
                ' ', cleaned
            )

            urgency_pattern = (
                r'\bсрочн[оа-я]*\b|нужны деньги|в связи с отъездом|ниже рынка|\burgent\b|\burgen[tț][aă]\b|pre[tț]\s+redus|plec\s+din\s+[tț]ar[aă]|am\s+nevoie\s+de\s+bani|sub\s+pia[tț][aă]'
            )
            defect_pattern = (
                r'требует[ся\s]*вложени[йя]|требуются вложения|не на ходу|после дтп|на запчасти|без документов|аварийный|аварийное состояние|проблем[аы] с (?:мотор|двигател|коробк|акпп|кпп|ходовой|кузов)|necesit[aă]\s+investi[tț]ii|investi[tț]ii\s+necesare|nu porne[sș]te|nu merge|lovit[aă]?|avariat[aă]?|pentru piese|f[aă]r[aă]\s+acte|probleme\s+la\s+(?:motor|cutie|cutia)'
            )

            is_urgent = bool(re.search(urgency_pattern, cleaned))
            is_defective = bool(re.search(defect_pattern, cleaned))
            return {"is_urgent": is_urgent, "is_defective": is_defective}
        except Exception:
            return {"is_urgent": False, "is_defective": False}

    def get_model_count(self, brand, model, listing_id=None):
        statement = select(func.count()).select_from(Listing).where(
            Listing.brand == brand,
            Listing.model == model,
        )
        if listing_id is not None:
            statement = statement.where(Listing.id != listing_id)
        return self.db.scalar(statement) or 0
