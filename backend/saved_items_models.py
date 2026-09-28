"""User-owned saved items, independent of the refreshed listings table."""
from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from database import Base


class SavedItemColumns:
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class SavedSearch(SavedItemColumns, Base):
    __tablename__ = "saved_searches"

    name = Column(String(120), nullable=False)
    filters = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)


class SavedRiskAssessment(SavedItemColumns, Base):
    __tablename__ = "saved_risk_assessments"

    name = Column(String(120), nullable=False)
    input = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    result = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)


class FavouriteListing(SavedItemColumns, Base):
    __tablename__ = "favourite_listings"
    __table_args__ = (UniqueConstraint("user_id", "listing_key", name="uq_favourite_user_listing"),)

    # No FK to listings_cleaned: inventory refreshes must not delete saved items
    # or be blocked by them. The URL identifies the listing across refreshes.
    listing_id = Column(BigInteger, nullable=False)
    listing_key = Column(String(64), nullable=False)
    listing_url = Column(String, nullable=True)
    snapshot = Column(JSON().with_variant(JSONB(), "postgresql"), nullable=False)
    notes = Column(String(1000), nullable=True)
