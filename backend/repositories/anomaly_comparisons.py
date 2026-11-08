"""Database listings used by anomaly price, mileage, and specification checks."""
from datetime import datetime, timezone
import logging
import re
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from models import CarListing, Listing
from repositories.listings import clear_options_cache

logger = logging.getLogger(__name__)


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

    def get_stored_deal_score(self, listing_id):
        if not listing_id:
            return None
        try:
            score = self.db.scalar(select(Listing.score).where(Listing.id == listing_id))
            return float(score) if score is not None else None
        except Exception:
            return None

    def get_listing_by_id(self, listing_id: int):
        """Look up a listing by ID in listings_cleaned (database-first resolution)."""
        try:
            stmt = select(
                CarListing.id,
                CarListing.url,
                CarListing.brand,
                CarListing.model,
                CarListing.generation,
                CarListing.price,
                CarListing.currency,
                CarListing.price_eur,
                CarListing.original_price,
                CarListing.original_currency,
                CarListing.year,
                CarListing.mileage,
                CarListing.engine,
                CarListing.fuel_type,
                CarListing.gearbox,
                CarListing.drivetrain,
                CarListing.body_type,
                CarListing.score.label("score"),
            ).where(CarListing.id == listing_id)
            row = self.db.execute(stmt).mappings().first()
            if not row:
                return None

            price_val = row["price_eur"] if row["price_eur"] is not None else row["price"]
            if price_val is None or float(price_val) <= 0:
                return None

            engine_val = None
            if row["engine"] is not None:
                try:
                    eng_f = float(row["engine"])
                    if 0 <= eng_f <= 20:
                        engine_val = eng_f
                except (ValueError, TypeError):
                    pass

            data = {
                "listing_id": int(row["id"]),
                "url": row["url"] or f"https://999.md/ro/{row['id']}",
                "source": "database",
                "title": None,
                "image_url": None,
                "brand": str(row["brand"]).strip(),
                "model": str(row["model"]).strip(),
                "generation": str(row["generation"]).strip() if row["generation"] else None,
                "price": round(float(price_val), 2),
                "original_price": float(row["original_price"]) if row["original_price"] is not None else (float(row["price"]) if row["price"] is not None else None),
                "original_currency": str(row["original_currency"] or row["currency"] or "EUR").strip(),
                "year": int(row["year"]) if row["year"] is not None else None,
                "mileage": int(row["mileage"]) if row["mileage"] is not None else None,
                "engine": engine_val,
                "fuel_type": str(row["fuel_type"]).strip() if row["fuel_type"] else None,
                "gearbox": str(row["gearbox"]).strip() if row["gearbox"] else None,
                "drivetrain": str(row["drivetrain"]).strip() if row["drivetrain"] else None,
                "body_type": str(row["body_type"]).strip() if row["body_type"] else None,
                "stored_score": float(row["score"]) if row["score"] is not None else None,
            }

            try:
                extra = self.db.execute(
                    text("SELECT title, image_url FROM listings_cleaned WHERE id = :lid"),
                    {"lid": listing_id}
                ).mappings().first()
                if extra:
                    if extra.get("title"):
                        data["title"] = str(extra["title"]).strip()
                    if extra.get("image_url"):
                        data["image_url"] = str(extra["image_url"]).strip()
            except Exception:
                pass

            return data
        except Exception:
            return None

    def save_scraped_listing(self, listing_data: dict, deal_score: float | None = None) -> bool:
        """Persist a newly scraped 999.md vehicle into listings_cleaned (and listings if present)."""
        listing_id = listing_data.get("listing_id")
        brand = listing_data.get("brand")
        model = listing_data.get("model")
        price_eur = listing_data.get("price")
        if not listing_id or not brand or not model or price_eur is None or float(price_eur) <= 0:
            return False

        try:
            existing_id = self.db.scalar(select(CarListing.id).where(CarListing.id == int(listing_id)))
            if existing_id is not None:
                return False

            market_segment = None
            try:
                with self.db.begin_nested():
                    seg_row = self.db.execute(
                        text(
                            "SELECT market_segment FROM model_class "
                            "WHERE LOWER(TRIM(brand)) = LOWER(TRIM(:brand)) "
                            "AND LOWER(TRIM(model)) = LOWER(TRIM(:model)) "
                            "AND market_segment IS NOT NULL LIMIT 1"
                        ),
                        {"brand": brand, "model": model},
                    ).fetchone()
                    if seg_row and seg_row[0]:
                        market_segment = str(seg_row[0]).strip()
            except Exception:
                pass

            now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
            orig_price = float(listing_data.get("original_price") or price_eur)
            orig_currency = str(listing_data.get("original_currency") or "EUR").strip()
            url_str = listing_data.get("url") or f"https://999.md/ro/{listing_id}"

            record = CarListing(
                id=int(listing_id),
                url=url_str,
                brand=str(brand).strip(),
                model=str(model).strip(),
                generation=listing_data.get("generation"),
                price=orig_price,
                currency="EUR",
                original_price=orig_price,
                original_currency=orig_currency,
                price_eur=round(float(price_eur), 2),
                year=listing_data.get("year"),
                mileage=listing_data.get("mileage"),
                engine=listing_data.get("engine"),
                horsepower=listing_data.get("horsepower"),
                fuel_type=listing_data.get("fuel_type"),
                gearbox=listing_data.get("gearbox"),
                state=listing_data.get("state") or "Cu rulaj",
                registration_country=listing_data.get("registration_country") or "Republica Moldova",
                drivetrain=listing_data.get("drivetrain"),
                body_type=listing_data.get("body_type"),
                doors=listing_data.get("doors"),
                seats=listing_data.get("seats"),
                offer_type=listing_data.get("offer_type") or "Vând",
                seller_type=listing_data.get("seller_type"),
                scraped_at=now_utc,
                mileage_was_corrected=bool(listing_data.get("mileage_was_corrected", False)),
                class_=market_segment,
                score=round(float(deal_score), 2) if deal_score is not None else None,
            )
            self.db.add(record)
            self.db.flush()

            try:
                with self.db.begin_nested():
                    self.db.execute(
                        text(
                            "UPDATE listings_cleaned SET "
                            "title = :title, description_ro = :description_ro, "
                            "description_ru = :description_ru, image_url = :image_url, "
                            "vin = :vin, score = :score "
                            "WHERE id = :id"
                        ),
                        {
                            "id": int(listing_id),
                            "title": listing_data.get("title"),
                            "description_ro": listing_data.get("description_ro"),
                            "description_ru": listing_data.get("description_ru"),
                            "image_url": listing_data.get("image_url"),
                            "vin": listing_data.get("vin"),
                            "score": round(float(deal_score), 2) if deal_score is not None else None,
                        },
                    )
            except Exception:
                pass

            try:
                with self.db.begin_nested():
                    raw_exists = self.db.execute(
                        text("SELECT 1 FROM listings WHERE id = :id LIMIT 1"),
                        {"id": int(listing_id)},
                    ).fetchone()
                    if not raw_exists:
                        self.db.execute(
                            text(
                                "INSERT INTO listings ("
                                "id, url, brand, model, price, currency, generation, year, "
                                "mileage, engine, horsepower, fuel_type, gearbox, state, "
                                "registration_country, drivetrain, body_type, doors, seats, "
                                "scraped_at, offer_type, seller_type, score, vin, title, "
                                "description_ro, description_ru, image_url"
                                ") VALUES ("
                                ":id, :url, :brand, :model, :price, :currency, :generation, :year, "
                                ":mileage, :engine, :horsepower, :fuel_type, :gearbox, :state, "
                                ":registration_country, :drivetrain, :body_type, :doors, :seats, "
                                ":scraped_at, :offer_type, :seller_type, :score, :vin, :title, "
                                ":description_ro, :description_ru, :image_url"
                                ")"
                            ),
                            {
                                "id": int(listing_id),
                                "url": url_str,
                                "brand": str(brand).strip(),
                                "model": str(model).strip(),
                                "price": orig_price,
                                "currency": orig_currency,
                                "generation": listing_data.get("generation"),
                                "year": listing_data.get("year"),
                                "mileage": listing_data.get("mileage"),
                                "engine": str(listing_data["engine"]) if listing_data.get("engine") is not None else None,
                                "horsepower": listing_data.get("horsepower"),
                                "fuel_type": listing_data.get("fuel_type"),
                                "gearbox": listing_data.get("gearbox"),
                                "state": listing_data.get("state") or "Cu rulaj",
                                "registration_country": listing_data.get("registration_country") or "Republica Moldova",
                                "drivetrain": listing_data.get("drivetrain"),
                                "body_type": listing_data.get("body_type"),
                                "doors": listing_data.get("doors"),
                                "seats": listing_data.get("seats"),
                                "scraped_at": now_utc,
                                "offer_type": listing_data.get("offer_type") or "Vând",
                                "seller_type": listing_data.get("seller_type"),
                                "score": round(float(deal_score), 2) if deal_score is not None else None,
                                "vin": listing_data.get("vin"),
                                "title": listing_data.get("title"),
                                "description_ro": listing_data.get("description_ro"),
                                "description_ru": listing_data.get("description_ru"),
                                "image_url": listing_data.get("image_url"),
                            },
                        )
            except Exception:
                pass

            self.db.commit()
            clear_options_cache()
            return True
        except Exception:
            logger.exception("Failed to persist scraped listing %s to database", listing_id)
            self.db.rollback()
            return False


