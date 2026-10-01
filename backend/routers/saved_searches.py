"""Save filter definitions and rerun them against current listings."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ValidationError
from sqlalchemy.orm import Session

from database import get_db
from models import User
from repositories.listings import ListingsRepository
from repositories.saved_items import SavedItemsRepository
from routers.users import get_current_user
from saved_items_models import SavedSearch
from saved_items_schemas import SavedPage, SavedSearchCreate, SavedSearchFilters, SavedSearchResponse, SavedSearchUpdate
from schemas import PaginatedListingsResponse
from services.listings import ListingsService
from services.saved_items import require_owned

router = APIRouter(prefix="/saved-searches", tags=["saved-searches"])


@router.post("", response_model=SavedSearchResponse, status_code=201)
def create_saved_search(payload: SavedSearchCreate, user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    return SavedItemsRepository(db, SavedSearch).create(
        user.id, name=payload.name, filters=payload.filters.model_dump(mode="json", by_alias=True),
    )


@router.get("", response_model=SavedPage[SavedSearchResponse])
def list_saved_searches(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return SavedItemsRepository(db, SavedSearch).page(user.id, page, limit)


@router.get("/{item_id}", response_model=SavedSearchResponse)
def get_saved_search(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return require_owned(SavedItemsRepository(db, SavedSearch), item_id, user.id)


@router.patch("/{item_id}", response_model=SavedSearchResponse)
def update_saved_search(item_id: int, payload: SavedSearchUpdate, user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    repository = SavedItemsRepository(db, SavedSearch)
    item = require_owned(repository, item_id, user.id)
    if payload.name is not None:
        item.name = payload.name
    if payload.filters is not None:
        item.filters = payload.filters.model_dump(mode="json", by_alias=True)
    return repository.save(item)


@router.delete("/{item_id}", status_code=204)
def delete_saved_search(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repository = SavedItemsRepository(db, SavedSearch)
    repository.delete(require_owned(repository, item_id, user.id))
    return Response(status_code=204)


@router.get("/{item_id}/results", response_model=PaginatedListingsResponse)
def run_saved_search(item_id: int, page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = require_owned(SavedItemsRepository(db, SavedSearch), item_id, user.id)
    try:
        filters = SavedSearchFilters.model_validate(item.filters).to_listing_filters()
    except ValidationError:
        raise HTTPException(422, "Actualizați filtrele salvate pentru regulile curente.") from None
    return ListingsService(ListingsRepository(db)).search_paginated(filters, page, limit)
