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
                raise HTTPException(503, "Anomaly scoring configuration unavailable. Check model_metadata.json.") from None
    return _service


@router.post("/anomaly-risk", response_model=AnomalyRiskResponse)
def assess_anomaly_risk(payload: AnomalyRiskRequest, service=Depends(get_anomaly_risk_service),
                       db: Session = Depends(get_db)):
    try:
        repository = AnomalyComparisonsRepository(db)
        prices = repository.get_prices(
            payload.brand, payload.model, payload.generation, payload.listing_id,
        )
        characteristics = repository.get_characteristics(
            payload.brand, payload.model, payload.generation, payload.listing_id,
        )
        result = service.assess_listing_risk(payload.model_dump(), prices, len(prices),
                                             characteristics)
        return AnomalyRiskResponse(model_version=service.metadata["model_version"], **result)
    except Exception:
        logger.exception("Anomaly-risk inference failed")
        raise HTTPException(503, "Anomaly assessment unavailable. Check the database and scoring configuration.") from None
