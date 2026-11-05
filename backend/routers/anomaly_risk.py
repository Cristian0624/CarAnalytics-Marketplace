"""Stateless assessments using live database comparisons and cached scoring constants."""
import logging
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from anomaly_risk_schemas import AnomalyRiskRequest, AnomalyRiskResponse
from database import get_db
from repositories.anomaly_comparisons import AnomalyComparisonsRepository

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


@router.post("/anomaly-risk", response_model=AnomalyRiskResponse)
def assess_anomaly_risk(payload: AnomalyRiskRequest, service=Depends(get_anomaly_risk_service),
                       db: Session = Depends(get_db)):
    try:
        repository = AnomalyComparisonsRepository(db)
        prices = repository.get_prices(
            payload.brand, payload.model, payload.generation, payload.listing_id,
            year=payload.year, fuel_type=payload.fuel_type, engine=payload.engine,
        )
        characteristics = repository.get_characteristics(
            payload.brand, payload.model, payload.generation, payload.listing_id,
            year=payload.year, fuel_type=payload.fuel_type, engine=payload.engine,
        )
        text_signals = repository.get_listing_text_signals(payload.listing_id)
        if payload.has_urgent_marker is not None:
            text_signals["is_urgent"] = payload.has_urgent_marker
        if payload.has_damage_marker is not None:
            text_signals["is_defective"] = payload.has_damage_marker
        if payload.has_vin is not None:
            text_signals["has_vin"] = payload.has_vin

        # If user supplied custom title/description, extract additional signals
        if payload.title or payload.description:
            user_text = f"{payload.title or ''} {payload.description or ''}".lower()
            if "urgent" in user_text or "срочн" in user_text or "нужны деньги" in user_text:
                text_signals["is_urgent"] = True
            if "avariat" in user_text or "defect" in user_text or "piese" in user_text or "не на ходу" in user_text:
                text_signals["is_defective"] = True

        result = service.assess_listing_risk(payload.model_dump(), prices, len(prices),
                                             characteristics, text_signals=text_signals)
        return AnomalyRiskResponse(model_version=service.metadata["model_version"], **result)
    except Exception:
        logger.exception("Anomaly-risk inference failed")
        raise HTTPException(503, "Analiza este momentan indisponibilă. Încearcă din nou mai târziu.") from None
