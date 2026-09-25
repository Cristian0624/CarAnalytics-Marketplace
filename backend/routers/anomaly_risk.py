"""Stateless inference with one lazily loaded model per process."""
import logging
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException

from anomaly_risk_schemas import AnomalyRiskRequest, AnomalyRiskResponse

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
                raise HTTPException(503, "Anomaly model unavailable. Check model artifacts and ML dependencies.") from None
    return _service


@router.post("/anomaly-risk", response_model=AnomalyRiskResponse)
def assess_anomaly_risk(payload: AnomalyRiskRequest, service=Depends(get_anomaly_risk_service)):
    # A synchronous route runs CPU inference in FastAPI's worker thread pool.
    try:
        result = service.assess_listing_risk(payload.model_dump())
        return AnomalyRiskResponse(model_version=service.metadata["model_version"], **result)
    except Exception:
        logger.exception("Anomaly-risk inference failed")
        raise HTTPException(503, "Anomaly assessment unavailable. Check the deployed model bundle.") from None
