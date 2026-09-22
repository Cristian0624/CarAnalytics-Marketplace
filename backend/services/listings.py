from math import ceil

from repositories.listings import ListingsRepository
from repositories.user_queries import UserQueriesRepository


class ListingsService:
    def __init__(self, repository: ListingsRepository):
        self.repository = repository

    def search(self, filters):
        return self.repository.get_all(filters)

    def search_paginated(self, filters, page: int, limit: int):
        items, total = self.repository.get_page(filters, page, limit)
        return {"items": items, "total": total, "page": page, "limit": limit, "pages": ceil(total / limit) if total else 0}

    def get_listing(self, listing_id: int):
        return self.repository.get_by_id(listing_id)


class UserQueriesService:
    def __init__(self, repository: UserQueriesRepository):
        self.repository = repository

    def create(self, user_id: int, values: dict):
        return self.repository.create(user_id, values)

    def list_for_user(self, user_id: int):
        return self.repository.get_all_for_user(user_id)

    def get(self, query_id: int, user_id: int):
        return self.repository.get_for_user(query_id, user_id)

    def update(self, query_id: int, user_id: int, values: dict):
        return self.repository.update_for_user(query_id, user_id, values)

    def delete(self, query_id: int, user_id: int) -> bool:
        return self.repository.delete_for_user(query_id, user_id)
