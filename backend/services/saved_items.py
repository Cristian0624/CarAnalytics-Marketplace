"""Persistence helpers and live evaluation for user-owned saved items."""
import hashlib
import logging

import httpx
from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError

from anomaly_risk_schemas import AnomalyRiskResponse
from models import Listing
from repositories.saved_items import SavedItemsRepository
from saved_items_models import FavouriteListing
from schemas import ListingResponse

logger = logging.getLogger(__name__)


def require_owned(repository, item_id, user_id):
    item = repository.get(item_id, user_id)
    if item is None:
        raise HTTPException(404, "Saved item not found")
    return item


async def evaluate_risk(app, payload):
    """Use the registered endpoint so saved and unsaved assessments agree.

    ASGI transport dispatches in-process; no second server or network is needed.
    Only the server-generated response is persisted, never a client-supplied score.
    """
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://internal") as client:
            response = await client.post("/anomaly-risk", json=payload.model_dump(mode="json"))
        if response.status_code != 200:
            raise HTTPException(503, "Risk assessment unavailable; nothing was saved")
        return AnomalyRiskResponse.model_validate(response.json()).model_dump(mode="json")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Could not evaluate the saved risk assessment")
        raise HTTPException(503, "Risk assessment unavailable; nothing was saved") from None


def create_favourite(db, user_id, payload):
    listing = db.get(Listing, payload.listing_id)
    if listing is None:
        raise HTTPException(404, "Listing not found")
    snapshot = ListingResponse.model_validate(listing).model_dump(mode="json", by_alias=True)
    url = listing.url or None
    identity = f"url:{url}" if url else f"id:{listing.id}"
    key = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    repository = SavedItemsRepository(db, FavouriteListing)
    try:
        return repository.create(user_id, listing_id=listing.id, listing_key=key,
                                 listing_url=url, snapshot=snapshot, notes=payload.notes)
    except IntegrityError:
        # A unique constraint also prevents duplicates from concurrent requests.
        duplicate = db.scalar(select(FavouriteListing.id).where(
            FavouriteListing.user_id == user_id, FavouriteListing.listing_key == key,
        ))
        if duplicate is not None:
            raise HTTPException(409, "Listing is already in your favourites") from None
        raise


def current_favourite_listing(db, favourite):
    return current_favourite_listings(db, [favourite]).get(favourite.id)


def current_favourite_listings(db, favourites):
    """Resolve a page against the current cleaned inventory in one query.

    Archive rows and saved snapshots preserve details, but never imply that an
    ad still belongs to the latest published batch.
    """
    if not favourites:
        return {}

    urls = [item.listing_url for item in favourites if item.listing_url]
    ids = [item.listing_id for item in favourites if not item.listing_url]
    listings = db.scalars(select(Listing).where(or_(
        Listing.url.in_(urls), Listing.id.in_(ids),
    )).order_by(Listing.id)).all()

    by_url = {}
    by_id = {}
    for listing in listings:
        by_url.setdefault(listing.url, listing)
        by_id[listing.id] = listing

    current = {}
    for favourite in favourites:
        if favourite.listing_url:
            listing = by_url.get(favourite.listing_url)
        else:
            listing = by_id.get(favourite.listing_id)
            # Without a URL, do not attach a reused ID to a different car.
            if listing is not None and not all(
                getattr(listing, field) == favourite.snapshot.get(field)
                for field in ("brand", "model", "generation", "year")
            ):
                listing = None
        current[favourite.id] = listing
    return current
