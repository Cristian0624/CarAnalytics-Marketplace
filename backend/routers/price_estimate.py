from datetime import date
from decimal import Decimal
import logging
import re
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from anomaly_risk_schemas import ExtractedVehicle
from database import get_db
from price_estimate_schemas import (
    PriceEstimateRequest,
    PriceEstimateResponse,
    PriceEstimateUrlRequest,
    PriceEstimateUrlResponse,
)
from repositories.anomaly_comparisons import AnomalyComparisonsRepository
from services.price_estimate import PriceEstimateError, PriceEstimateService
from services.url_scraper import (
    InvalidListingUrlError,
    ListingNotFoundError,
    NonVehicleListingError,
    extract_999_listing_id,
    scrape_live_999_listing,
)


router = APIRouter(tags=["price-estimate"])
logger = logging.getLogger(__name__)


async def get_price_estimate_service(request: Request):
    # Dispatch real GET requests through the app's listings router, without
    # relying on a public host, another worker, or a second running server.
    transport = httpx.ASGITransport(app=request.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://internal") as client:
        yield PriceEstimateService(client)


def _match_case_insensitive(value: str | None, candidates: list[str]) -> str | None:
    if not value or not candidates:
        return None
    val_clean = str(value).strip()
    if val_clean in candidates:
        return val_clean
    val_cf = val_clean.casefold()
    for c in candidates:
        if c.strip().casefold() == val_cf:
            return c
    return None


def _parse_gen_years(gen: str) -> tuple[int, int] | None:
    match = re.search(r"\((\d{4})\s*[-–—]\s*(\d{4}|prezent|present)\)", gen or "", re.IGNORECASE)
    if not match:
        return None
    start = int(match[1])
    end = int(match[2]) if match[2].isdigit() else date.today().year + 1
    return start, end


def _choose_generation(raw_gen: str | None, year: int | None, candidates: list[str]) -> str | None:
    matched = _match_case_insensitive(raw_gen, candidates)
    if matched and _parse_gen_years(matched):
        return matched
    valid_gens = [(g, _parse_gen_years(g)) for g in candidates]
    valid_gens = [(g, yrs) for g, yrs in valid_gens if yrs is not None]
    if not valid_gens:
        return candidates[0] if candidates else raw_gen
    if year is not None:
        containing = [g for g, (s, e) in valid_gens if s <= year <= e]
        if containing:
            return containing[0]
        return min(valid_gens, key=lambda item: min(abs(year - item[1][0]), abs(year - item[1][1])))[0]
    return valid_gens[0][0]


@router.post("/price-estimate", response_model=PriceEstimateResponse)
async def estimate_price(
    payload: PriceEstimateRequest,
    service: Annotated[PriceEstimateService, Depends(get_price_estimate_service)],
):
    try:
        return await service.estimate(payload)
    except PriceEstimateError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


@router.post("/price-estimate/from-url", response_model=PriceEstimateUrlResponse)
async def estimate_price_from_url(
    payload: PriceEstimateUrlRequest,
    service: Annotated[PriceEstimateService, Depends(get_price_estimate_service)],
    db: Session = Depends(get_db),
):
    try:
        listing_id = extract_999_listing_id(payload.url)
    except InvalidListingUrlError as exc:
        raise HTTPException(422, str(exc)) from None

    repository = AnomalyComparisonsRepository(db)

    # 1. Database-first lookup
    listing_data = repository.get_listing_by_id(listing_id)
    stored_score = listing_data.pop("stored_score", None) if listing_data else None
    was_scraped_live = False

    # 2. Live scrape fallback if not in database
    if listing_data is None:
        try:
            listing_data = scrape_live_999_listing(listing_id)
            was_scraped_live = True
        except ListingNotFoundError as exc:
            raise HTTPException(404, str(exc)) from None
        except NonVehicleListingError as exc:
            raise HTTPException(422, str(exc)) from None
        except Exception:
            logger.exception("Failed to scrape live 999.md listing %s for price estimate", listing_id)
            raise HTTPException(
                502,
                "Nu am putut prelua datele anunțului de pe 999.md. Verifică linkul sau introdu datele manual.",
            ) from None

    if was_scraped_live:
        repository.save_scraped_listing(listing_data, deal_score=stored_score)

    try:
        all_options = await service._get("/listings/options", {})
        brand = _match_case_insensitive(listing_data.get("brand"), all_options.get("brand", []))
        if not brand:
            raise PriceEstimateError(422, f"Marca „{listing_data.get('brand')}” nu are suficiente date în piață pentru estimare.")

        brand_options = await service._get("/listings/options", {"brand": brand})
        model = _match_case_insensitive(listing_data.get("model"), brand_options.get("model", []))
        if not model:
            raise PriceEstimateError(422, f"Modelul „{listing_data.get('model')}” nu are suficiente date în piață pentru estimare.")

        model_options = await service._get("/listings/options", {"brand": brand, "model": model})
        raw_year = listing_data.get("year")
        generation = _choose_generation(listing_data.get("generation"), raw_year, model_options.get("generation", []))
        if not generation:
            raise PriceEstimateError(422, "Nu există generații disponibile în baza de date pentru acest model.")

        gen_options = await service._get("/listings/options", {"brand": brand, "model": model, "generation": generation})
        gen_years = _parse_gen_years(generation) or (2000, date.today().year)
        start_y, end_y = gen_years
        if raw_year is not None:
            target_year = max(start_y, min(end_y, int(raw_year)))
        else:
            target_year = round((start_y + min(end_y, date.today().year)) / 2)

        year_min = max(1886, min(start_y, target_year - 2))
        year_max = min(date.today().year + 1, max(end_y, target_year + 2))
        mileage = int(listing_data["mileage"]) if listing_data.get("mileage") is not None else 150000

        fuel_candidates = gen_options.get("fuel_type") or all_options.get("fuel_type") or ["Benzină"]
        fuel_type = _match_case_insensitive(listing_data.get("fuel_type"), fuel_candidates) or fuel_candidates[0]

        gearbox_candidates = gen_options.get("gearbox") or all_options.get("gearbox") or ["Automată"]
        gearbox = _match_case_insensitive(listing_data.get("gearbox"), gearbox_candidates) or gearbox_candidates[0]

        drivetrain_candidates = gen_options.get("drivetrain") or all_options.get("drivetrain") or ["Din față"]
        drivetrain = _match_case_insensitive(listing_data.get("drivetrain"), drivetrain_candidates) or drivetrain_candidates[0]

        body_candidates = gen_options.get("body_type") or all_options.get("body_type") or ["Sedan"]
        body_type = _match_case_insensitive(listing_data.get("body_type"), body_candidates) or body_candidates[0]

        engine_val: Decimal | None = None
        if fuel_type.strip().casefold() != "electricitate":
            eng_candidates = [float(e) for e in (gen_options.get("engine") or all_options.get("engine") or []) if e is not None and float(e) > 0]
            raw_eng = listing_data.get("engine")
            if raw_eng is not None and eng_candidates:
                closest = min(eng_candidates, key=lambda c: abs(c - float(raw_eng)))
                engine_val = Decimal(str(closest))
            elif eng_candidates:
                engine_val = Decimal(str(eng_candidates[0]))
            elif raw_eng is not None and float(raw_eng) > 0:
                engine_val = Decimal(str(raw_eng))

        est_request = PriceEstimateRequest(
            brand=brand,
            model=model,
            generation=generation,
            year=target_year,
            mileage=mileage,
            fuel_type=fuel_type,
            engine=engine_val,
            gearbox=gearbox,
            drivetrain=drivetrain,
            body_type=body_type,
            year_min=year_min,
            year_max=year_max,
            mileage_min=0,
            mileage_max=10_000_000,
        )
        estimate_res = await service.estimate(est_request)

        vehicle_out = ExtractedVehicle(
            listing_id=listing_data["listing_id"],
            url=listing_data["url"],
            source=listing_data["source"],
            title=listing_data.get("title"),
            image_url=listing_data.get("image_url"),
            brand=brand,
            model=model,
            generation=generation,
            price=listing_data["price"],
            original_price=listing_data.get("original_price"),
            original_currency=listing_data.get("original_currency"),
            year=target_year,
            mileage=mileage,
            engine=float(engine_val) if engine_val is not None else listing_data.get("engine"),
            fuel_type=fuel_type,
            gearbox=gearbox,
            drivetrain=drivetrain,
            body_type=body_type,
        )
        return PriceEstimateUrlResponse(vehicle=vehicle_out, estimate=estimate_res)
    except PriceEstimateError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except Exception:
        logger.exception("Price estimate from URL failed")
        raise HTTPException(503, "Estimarea prețului este momentan indisponibilă. Încearcă din nou mai târziu.") from None

