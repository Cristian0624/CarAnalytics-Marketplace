"""Store immutable server-generated assessments; PATCH only renames them."""
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from anomaly_risk_schemas import AnomalyRiskRequest
from database import get_db
from models import User
from repositories.saved_items import SavedItemsRepository
from routers.users import get_current_user
from saved_items_models import SavedRiskAssessment
from saved_items_schemas import SavedPage, SavedRiskCreate, SavedRiskRename, SavedRiskResponse
from services.saved_items import evaluate_risk, require_owned

router = APIRouter(prefix="/saved-risk-assessments", tags=["saved-risk-assessments"])


@router.post("", response_model=SavedRiskResponse, status_code=201)
async def create_saved_assessment(payload: SavedRiskCreate, request: Request,
                                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    owner_id = user.id
    # Release authentication's read transaction before the internal request may
    # need its own DB connection. This session has no writes to discard.
    await run_in_threadpool(db.rollback)
    result = await evaluate_risk(request.app, payload.input)
    repository = SavedItemsRepository(db, SavedRiskAssessment)
    return await run_in_threadpool(repository.create, owner_id, name=payload.name,
                                  input=payload.input.model_dump(mode="json"), result=result)


@router.get("", response_model=SavedPage[SavedRiskResponse])
def list_saved_assessments(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
                           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return SavedItemsRepository(db, SavedRiskAssessment).page(user.id, page, limit)


@router.get("/{item_id}", response_model=SavedRiskResponse)
def get_saved_assessment(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return require_owned(SavedItemsRepository(db, SavedRiskAssessment), item_id, user.id)


@router.patch("/{item_id}", response_model=SavedRiskResponse)
def rename_saved_assessment(item_id: int, payload: SavedRiskRename, user: User = Depends(get_current_user),
                            db: Session = Depends(get_db)):
    repository = SavedItemsRepository(db, SavedRiskAssessment)
    item = require_owned(repository, item_id, user.id)
    item.name = payload.name
    return repository.save(item)


@router.delete("/{item_id}", status_code=204)
def delete_saved_assessment(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repository = SavedItemsRepository(db, SavedRiskAssessment)
    repository.delete(require_owned(repository, item_id, user.id))
    return Response(status_code=204)


@router.post("/{item_id}/reanalyse", response_model=SavedRiskResponse, status_code=201)
async def reanalyse_saved_assessment(item_id: int, request: Request, user: User = Depends(get_current_user),
                                     db: Session = Depends(get_db)):
    owner_id = user.id
    repository = SavedItemsRepository(db, SavedRiskAssessment)
    original = await run_in_threadpool(require_owned, repository, item_id, owner_id)
    name = original.name
    try:
        payload = AnomalyRiskRequest.model_validate(original.input)
    except ValidationError:
        raise HTTPException(422, "Saved input no longer matches the current assessment format; create a new assessment") from None
    await run_in_threadpool(db.rollback)
    result = await evaluate_risk(request.app, payload)
    return await run_in_threadpool(repository.create, owner_id, name=name,
                                  input=payload.model_dump(mode="json"), result=result)
