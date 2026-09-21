from sqlalchemy.orm import Session

from models import UserQuery


class UserQueriesRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: int, values: dict) -> UserQuery:
        query = UserQuery(user_id=user_id, **values)
        self.db.add(query)
        self.db.commit()
        self.db.refresh(query)
        return query

    def get_all_for_user(self, user_id: int) -> list[UserQuery]:
        return (
            self.db.query(UserQuery)
            .filter(UserQuery.user_id == user_id)
            .order_by(UserQuery.created_at.desc())
            .all()
        )

    def get_for_user(self, query_id: int, user_id: int) -> UserQuery | None:
        return (
            self.db.query(UserQuery)
            .filter(UserQuery.id == query_id, UserQuery.user_id == user_id)
            .first()
        )

    def update_for_user(self, query_id: int, user_id: int, values: dict) -> UserQuery | None:
        query = self.get_for_user(query_id, user_id)
        if query is None:
            return None
        for key, value in values.items():
            setattr(query, key, value)
        self.db.commit()
        self.db.refresh(query)
        return query

    def delete_for_user(self, query_id: int, user_id: int) -> bool:
        query = self.get_for_user(query_id, user_id)
        if query is None:
            return False
        self.db.delete(query)
        self.db.commit()
        return True
