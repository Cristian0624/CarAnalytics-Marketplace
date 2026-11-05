"""Stateless assessments using live database comparisons and cached scoring constants."""
import logging
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from anomaly_risk_schemas import (
    AnomalyRiskRequest,
    AnomalyRiskResponse,
    AnomalyRiskUrlRequest,
    AnomalyRiskUrlResponse,
    ExtractedVehicle,
)
from database import get_db
from repositories.anomaly_comparisons import AnomalyComparisonsRepository
from services.url_scraper import (
    InvalidListingUrlError,
    ListingNotFoundError,
    NonVehicleListingError,
    extract_999_listing_id,
    scrape_live_999_listing,
)

router = APIRouter(tags=["anomaly-risk"])
logger = logging.getLogger(__name__)
_service = None
_load_lock = Lock()


def get_anomaly_risk_service():
    global _service
    with _load_lock:
        if _service is None:
            try:
                from services.anomaly_risk import AnomalyRiskService
                _service = AnomalyRiskService()
            except Exception:
                logger.exception("Failed to initialize anomaly-risk inference")
                raise HTTPException(503, "Analiza este momentan indisponibilă. Încearcă din nou mai târziu.") from None
    return _service


def _run_assessment(payload_dict: dict, service, repository: AnomalyComparisonsRepository, stored_score=None) -> AnomalyRiskResponse:
    listing_id = payload_dict.get("listing_id")
    prices = repository.get_prices(
        payload_dict["brand"], payload_dict["model"], payload_dict.get("generation"), listing_id,
        year=payload_dict.get("year"), fuel_type=payload_dict.get("fuel_type"), engine=payload_dict.get("engine"),
    )
    characteristics = repository.get_characteristics(
        payload_dict["brand"], payload_dict["model"], payload_dict.get("generation"), listing_id,
        year=payload_dict.get("year"), fuel_type=payload_dict.get("fuel_type"), engine=payload_dict.get("engine"),
    )
    text_signals = repository.get_listing_text_signals(listing_id)
    if payload_dict.get("has_urgent_marker") is not None:
        text_signals["is_urgent"] = payload_dict["has_urgent_marker"]
    if payload_dict.get("has_damage_marker") is not None:
        text_signals["is_defective"] = payload_dict["has_damage_marker"]
    if payload_dict.get("has_vin") is not None:
        text_signals["has_vin"] = payload_dict["has_vin"]

    if payload_dict.get("title") or payload_dict.get("description"):
        user_text = f"{payload_dict.get('title') or ''} {payload_dict.get('description') or ''}".lower()
        if "urgent" in user_text or "срочн" in user_text or "нужны деньги" in user_text:
            text_signals["is_urgent"] = True
        if "avariat" in user_text or "defect" in user_text or "piese" in user_text or "не на ходу" in user_text:
            text_signals["is_defective"] = True

    if stored_score is None and listing_id:
        stored_score = repository.get_stored_deal_score(listing_id)

    result = service.assess_listing_risk(
        payload_dict, prices, len(prices),
        characteristics, text_signals=text_signals, stored_score=stored_score,
    )
    return AnomalyRiskResponse(model_version=service.metadata["model_version"], **result)


@router.post("/anomaly-risk", response_model=AnomalyRiskResponse)
def assess_anomaly_risk(payload: AnomalyRiskRequest, service=Depends(get_anomaly_risk_service),
                        db: Session = Depends(get_db)):
    try:
        repository = AnomalyComparisonsRepository(db)
        return _run_assessment(payload.model_dump(), service, repository)
    except Exception:
        logger.exception("Anomaly-risk inference failed")
        raise HTTPException(503, "Analiza este momentan indisponibilă. Încearcă din nou mai târziu.") from None


@router.post("/anomaly-risk/from-url", response_model=AnomalyRiskUrlResponse)
def assess_anomaly_risk_from_url(payload: AnomalyRiskUrlRequest, service=Depends(get_anomaly_risk_service),
                                 db: Session = Depends(get_db)):
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
            logger.exception("Failed to scrape live 999.md listing %s", listing_id)
            raise HTTPException(
                502,
                "Nu am putut prelua datele anunțului de pe 999.md. Verifică linkul sau introdu datele manual.",
            ) from None

    try:
        desc_parts = [
            listing_data.get("description_ro") or "",
            listing_data.get("description_ru") or "",
            listing_data.get("state") or "",
        ]
        description = " ".join(p for p in desc_parts if p).strip()[:5000] or None
        title = (listing_data.get("title") or "")[:500] or None

        assessment_input = {
            "listing_id": listing_data["listing_id"],
            "brand": listing_data["brand"],
            "model": listing_data["model"],
            "generation": listing_data.get("generation"),
            "price": listing_data["price"],
            "year": listing_data.get("year"),
            "mileage": listing_data.get("mileage"),
            "engine": listing_data.get("engine"),
            "fuel_type": listing_data.get("fuel_type"),
            "gearbox": listing_data.get("gearbox"),
            "drivetrain": listing_data.get("drivetrain"),
            "body_type": listing_data.get("body_type"),
            "title": title,
            "description": description,
            "has_vin": listing_data.get("has_vin"),
        }
        assessment = _run_assessment(assessment_input, service, repository, stored_score=stored_score)
        if was_scraped_live:
            repository.save_scraped_listing(listing_data, deal_score=assessment.deal_score)
        vehicle_out = ExtractedVehicle(
            listing_id=listing_data["listing_id"],
            url=listing_data["url"],
            source=listing_data["source"],
            title=listing_data.get("title"),
            image_url=listing_data.get("image_url"),
            brand=listing_data["brand"],
            model=listing_data["model"],
            generation=listing_data.get("generation"),
            price=listing_data["price"],
            original_price=listing_data.get("original_price"),
            original_currency=listing_data.get("original_currency"),
            year=listing_data.get("year"),
            mileage=listing_data.get("mileage"),
            engine=listing_data.get("engine"),
            fuel_type=listing_data.get("fuel_type"),
            gearbox=listing_data.get("gearbox"),
            drivetrain=listing_data.get("drivetrain"),
            body_type=listing_data.get("body_type"),
        )
        return AnomalyRiskUrlResponse(vehicle=vehicle_out, assessment=assessment)
    except Exception:
        logger.exception("Anomaly-risk from URL inference failed")
        raise HTTPException(503, "Analiza este momentan indisponibilă. Încearcă din nou mai târziu.") from None

