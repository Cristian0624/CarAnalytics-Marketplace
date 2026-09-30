# Saved searches, risk assessments and favourites

All endpoints require the existing `access_token` login cookie from `POST /users/login`.
The server takes `user_id` from that session. Clients cannot choose an owner, and
another user's item returns 404. List endpoints use `page` (default 1) and `limit`
(default 20, maximum 100), returning `items`, `total`, `page`, `limit` and `pages`.

## Setup

No new dependencies. The existing `Base.metadata.create_all` in `main.py` creates
the three new tables and their user ID indexes when the backend starts. New model
registration happens through the router imports before that call. Existing tables
and `/analysis` records are not migrated or changed.

The tables are `saved_searches`, `saved_risk_assessments` and `favourite_listings`.
Each has a primary key, indexed `user_id`, and creation/update timestamps. User
foreign keys use `ON DELETE CASCADE`. JSON is stored as JSONB on PostgreSQL.
There is no foreign key to `listings_cleaned`, so inventory replacement cannot
delete saved items or be blocked by them.

## Saved searches

`POST /saved-searches`

```json
{
  "name": "BMW under 15000 EUR",
  "filters": {
    "brand": ["BMW"],
    "price_max": 15000,
    "year_min": 2012,
    "sort_by": "price_eur",
    "sort_order": "asc"
  }
}
```

- `GET /saved-searches`: your saved searches.
- `GET /saved-searches/{id}`: saved filter definition.
- `PATCH /saved-searches/{id}`: change `name`, `filters`, or both.
- `DELETE /saved-searches/{id}`: delete the saved search (204).
- `GET /saved-searches/{id}/results?page=1&limit=20`: run against current listings.

The filter names and behaviour match `/listings`, including arrays of selections,
minimum/maximum ranges, `class`, `same_model` and sorting. An empty `filters` object
means all listings. Pagination is supplied when running, not saved in the filters.
PATCH replaces the entire `filters` object when supplied; use `{}` to clear it.
No matching listings are copied into the saved record. Results can change after
the inventory changes. The older `/analysis` routes are left intact for existing
clients; new clients should use `/saved-searches` for full filter definitions.

## Saved risk assessments

`POST /saved-risk-assessments`

```json
{
  "name": "Toyota Auris offer",
  "input": {
    "brand": "Toyota",
    "model": "Auris",
    "generation": "II (2012 - 2018)",
    "year": 2013,
    "mileage": 210000,
    "price": 7600
  }
}
```

- `GET /saved-risk-assessments`: your saved assessments.
- `GET /saved-risk-assessments/{id}`: the original input and frozen result.
- `PATCH /saved-risk-assessments/{id}`: rename with `{"name": "New name"}` only.
- `DELETE /saved-risk-assessments/{id}`: delete the record (204).
- `POST /saved-risk-assessments/{id}/reanalyse`: create a new record from the same input.

Saving runs the registered `/anomaly-risk` endpoint in-process and persists its
validated response, including model/scoring versions and support counts. No
client-supplied scores or results are accepted. Saving is a fresh evaluation, so
it may differ from an earlier preview if the data or engine has changed. A failed
evaluation returns 503 and creates no record. Reading saved records does not load
or call the engine. Reanalysis keeps the old record unchanged. There is no dataset
revision identifier in the current application; the saved result and timestamp
preserve what was returned, but do not archive the full comparison dataset.

## Favourite listings

`POST /favourites`

```json
{
  "listing_id": 123456789,
  "notes": "Arrange a viewing"
}
```

Use a real ID from `/listings`; `notes` is optional.

- `GET /favourites`: your favourites with the listing snapshot from when saved.
- `GET /favourites/{id}`: snapshot plus `available` and `current_listing`.
- `PATCH /favourites/{id}`: update `notes`; send `null` to clear them.
- `DELETE /favourites/{id}`: remove from favourites (204).

The path ID is the favourite record's ID, not the source listing ID. Saving a
missing listing returns 404. Saving the same listing twice for the same user
returns 409; a database unique constraint also covers concurrent requests.

The snapshot is one listing, never the entire search result. A listing's URL is
used to find it after a refresh, even if its local database ID changes. If it
disappears, the favourite remains readable with `available: false`. Without a URL,
lookup uses the original ID with brand/model/generation/year checks; this cannot
prove identity if an ID is reused for another car with identical characteristics.
Availability means present in the database, not that the seller still offers it.

## Tests

From the repository root:

```powershell
python -m unittest discover -s backend/tests -p test_saved_items.py -v
```

These HTTP integration tests use an isolated SQLite database and real signed
login cookies. The risk engine is stubbed so tests verify persistence, ownership,
validation, failure handling and reanalysis without requiring model artifacts.
