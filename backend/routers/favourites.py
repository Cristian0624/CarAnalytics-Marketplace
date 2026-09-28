"""Favourite listings with a saved snapshot and optional current details."""
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from database import get_db
from models import User
from repositories.saved_items import SavedItemsRepository
from routers.users import get_current_user
from saved_items_models import FavouriteListing
from saved_items_schemas import FavouriteCreate, FavouriteDetail, FavouriteResponse, FavouriteUpdate, SavedPage
from schemas import ListingResponse
from services.saved_items import create_favourite, current_favourite_listing, require_owned

router = APIRouter(prefix="/favourites", tags=["favourites"])


@router.post("", response_model=FavouriteResponse, status_code=201)
def add_favourite(payload: FavouriteCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return create_favourite(db, user.id, payload)


@router.get("", response_model=SavedPage[FavouriteResponse])
def list_favourites(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
                     user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return SavedItemsRepository(db, FavouriteListing).page(user.id, page, limit)


@router.get("/{item_id}", response_model=FavouriteDetail)
def get_favourite(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = require_owned(SavedItemsRepository(db, FavouriteListing), item_id, user.id)
    current = current_favourite_listing(db, item)
    return FavouriteDetail(
        **FavouriteResponse.model_validate(item).model_dump(), available=current is not None,
        current_listing=ListingResponse.model_validate(current) if current is not None else None,
    )


@router.patch("/{item_id}", response_model=FavouriteResponse)
def update_favourite(item_id: int, payload: FavouriteUpdate, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    repository = SavedItemsRepository(db, FavouriteListing)
    item = require_owned(repository, item_id, user.id)
    item.notes = payload.notes
    return repository.save(item)


@router.delete("/{item_id}", status_code=204)
def delete_favourite(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    repository = SavedItemsRepository(db, FavouriteListing)
    repository.delete(require_owned(repository, item_id, user.id))
    return Response(status_code=204)
