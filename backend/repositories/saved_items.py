"""All saved-item reads and mutations are scoped to the authenticated user."""
from math import ceil

from sqlalchemy import func, select
from sqlalchemy.orm import Session


class SavedItemsRepository:
    def __init__(self, db: Session, model):
        self.db = db
        self.model = model

    def get(self, item_id: int, user_id: int):
        return self.db.scalar(select(self.model).where(
            self.model.id == item_id, self.model.user_id == user_id,
        ))

    def page(self, user_id: int, page: int, limit: int):
        owned = select(self.model).where(self.model.user_id == user_id)
        total = self.db.scalar(select(func.count()).select_from(owned.subquery())) or 0
        items = self.db.scalars(owned.order_by(self.model.id.desc())
                               .offset((page - 1) * limit).limit(limit)).all()
        return {"items": items, "total": total, "page": page, "limit": limit, "pages": ceil(total / limit)}

    def create(self, user_id: int, **values):
        item = self.model(user_id=user_id, **values)
        self.db.add(item)
        return self.save(item)

    def save(self, item):
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        self.db.refresh(item)
        return item

    def delete(self, item):
        self.db.delete(item)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
