from math import ceil
from datetime import date
import re
from types import SimpleNamespace

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

    def get_options(self, brand=None, model=None, generation=None):
        return self.repository.get_options(brand, model, generation)

    def get_year_range(self, filters):
        # Only vehicle selections define the slider bounds. Its own year range
        # and the other market filters must not shrink the available choices.
        identity_filters = SimpleNamespace(**{
            key: value if key in ("brand", "model", "generation") else None
            for key, value in vars(filters).items()
        })
        rows = self.repository.get_vehicle_year_ranges(identity_filters)
        return vehicle_year_range(rows, filters.generation, date.today().year)


def vehicle_year_range(rows, selected_generations, current_year):
    selected = set(selected_generations or [])
    starts = []
    ends = []
    present = not selected

    for row in rows:
        match = re.search(r"(\d{4})\s*[-–—]\s*(\d{4}|prezent|present)",
                          row.generation or "", re.IGNORECASE)
        start = row.year_min
        end = row.year_max
        if match:
            generation_start = int(match[1])
            generation_end = int(match[2]) if match[2].isdigit() else current_year
            if generation_start <= generation_end:
                start = generation_start
                end = generation_end
                present = present or not match[2].isdigit()
        if start is not None:
            starts.append(start)
        if end is not None:
            ends.append(end)

        # A selected model/brand without a specific generation stays open to
        # the present, even when its current listings happen to be older.
        if row.generation not in selected:
            present = True

    if not starts or not ends:
        return {"year_min": 1886, "year_max": current_year, "present": True}
    return {
        "year_min": min(starts),
        "year_max": max(current_year, max(ends)) if present else max(ends),
        "present": present,
    }


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
