from datetime import date, datetime
from typing import Sequence
import sqlalchemy as sa
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from fastapi import HTTPException, status

from models import MarketTrend, ListingPriceHistory, Listing
from schemas import (
    MarketTrendResponse,
    TrendPoint,
    TrendFilterOptionsResponse,
    YearPriceSummary,
    ListingPriceHistoryResponse,
    ListingPricePoint,
    TrendsSyncResponse,
)


def get_market_trends(
    brand: str,
    model: str,
    year: int,
    db: Session,
) -> MarketTrendResponse:
    """Fetch complete time-series price trends from baseline to present for a specific vehicle brand, model, and year."""
    trends: Sequence[MarketTrend] = (
        db.query(MarketTrend)
        .filter(
            func.lower(MarketTrend.brand) == brand.strip().lower(),
            func.lower(MarketTrend.model) == model.strip().lower(),
            MarketTrend.year == year,
        )
        .order_by(MarketTrend.snapshot_date.asc())
        .all()
    )

    if not trends:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No market trend data found for {brand} {model} ({year}).",
        )

    data_points = [
        TrendPoint(
            snapshot_date=t.snapshot_date,
            median_price=round(float(t.median_price), 2),
            avg_price=round(float(t.avg_price), 2),
            min_price=round(float(t.min_price), 2) if t.min_price is not None else None,
            max_price=round(float(t.max_price), 2) if t.max_price is not None else None,
            listing_count=t.listing_count,
        )
        for t in trends
    ]

    earliest_date = data_points[0].snapshot_date
    latest_date = data_points[-1].snapshot_date
    latest_median_price = data_points[-1].median_price

    overall_change_eur: float | None = None
    overall_change_pct: float | None = None
    trend_direction: str = "stable"

    if len(data_points) >= 2:
        first_median = data_points[0].median_price
        overall_change_eur = round(latest_median_price - first_median, 2)
        if first_median > 0:
            overall_change_pct = round((overall_change_eur / first_median) * 100, 2)

        if overall_change_pct is not None:
            if overall_change_pct > 1.0:
                trend_direction = "up"
            elif overall_change_pct < -1.0:
                trend_direction = "down"
            else:
                trend_direction = "stable"

    return MarketTrendResponse(
        brand=trends[0].brand,
        model=trends[0].model,
        year=year,
        total_snapshots=len(data_points),
        earliest_date=earliest_date,
        latest_date=latest_date,
        latest_median_price=latest_median_price,
        overall_change_eur=overall_change_eur,
        overall_change_pct=overall_change_pct,
        trend_direction=trend_direction,
        data_points=data_points,
    )


def get_trend_options(
    brand: str | None,
    model: str | None,
    db: Session,
) -> TrendFilterOptionsResponse:
    """Return available brands, models, and years with recorded trend data."""
    if not brand:
        brands = [
            r[0]
            for r in db.query(MarketTrend.brand)
            .distinct()
            .order_by(MarketTrend.brand.asc())
            .all()
        ]
        return TrendFilterOptionsResponse(brands=brands, models=[], years=[])

    if brand and not model:
        models = [
            r[0]
            for r in db.query(MarketTrend.model)
            .filter(func.lower(MarketTrend.brand) == brand.strip().lower())
            .distinct()
            .order_by(MarketTrend.model.asc())
            .all()
        ]
        return TrendFilterOptionsResponse(brands=[brand], models=models, years=[])

    records: Sequence[MarketTrend] = (
        db.query(MarketTrend)
        .filter(
            func.lower(MarketTrend.brand) == brand.strip().lower(),
            func.lower(MarketTrend.model) == model.strip().lower(),
        )
        .order_by(MarketTrend.year.asc(), MarketTrend.snapshot_date.desc())
        .all()
    )

    seen_years = set()
    years: list[YearPriceSummary] = []
    for r in records:
        if r.year not in seen_years:
            seen_years.add(r.year)
            years.append(
                YearPriceSummary(
                    year=r.year,
                    median_price=round(float(r.median_price), 2),
                    avg_price=round(float(r.avg_price), 2),
                    listing_count=r.listing_count,
                )
            )

    years.sort(key=lambda x: x.year)
    return TrendFilterOptionsResponse(brands=[brand], models=[model], years=years)


def get_listing_price_history(
    listing_id: int,
    db: Session,
) -> ListingPriceHistoryResponse:
    """Fetch chronological price observations for a single car listing."""
    history_records: Sequence[ListingPriceHistory] = (
        db.query(ListingPriceHistory)
        .filter(ListingPriceHistory.listing_id == listing_id)
        .order_by(ListingPriceHistory.scraped_at.asc())
        .all()
    )

    brand: str | None = None
    model: str | None = None
    year: int | None = None

    if history_records:
        brand = history_records[0].brand
        model = history_records[0].model
        year = history_records[0].year
        history_points = [
            ListingPricePoint(
                price_eur=round(float(rec.price_eur), 2),
                scraped_at=rec.scraped_at,
            )
            for rec in history_records
        ]
    else:
        # Check current listing table for baseline
        listing = db.query(Listing).filter(Listing.id == listing_id).first()
        if not listing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Listing #{listing_id} not found.",
            )
        brand = listing.brand
        model = listing.model
        year = listing.year
        history_points = [
            ListingPricePoint(
                price_eur=round(float(listing.price_eur), 2) if listing.price_eur else 0.0,
                scraped_at=listing.scraped_at or datetime.now(),
            )
        ]

    first_price = history_points[0].price_eur
    latest_price = history_points[-1].price_eur
    price_change_eur: float | None = None
    price_change_pct: float | None = None
    is_price_drop = False

    if len(history_points) >= 2:
        price_change_eur = round(latest_price - first_price, 2)
        if first_price > 0:
            price_change_pct = round((price_change_eur / first_price) * 100, 2)
        is_price_drop = price_change_eur < 0

    return ListingPriceHistoryResponse(
        listing_id=listing_id,
        brand=brand,
        model=model,
        year=year,
        first_observed_price=first_price,
        latest_price=latest_price,
        price_change_eur=price_change_eur,
        price_change_pct=price_change_pct,
        is_price_drop=is_price_drop,
        history=history_points,
    )


def sync_market_trends(
    target_date: date | None,
    db: Session,
) -> TrendsSyncResponse:
    """
    Ingests and aggregates listings for a specific date (or the latest date) from listings_cleaned
    into listing_price_history and market_trends.
    """
    # 1. Determine target date if not provided
    if target_date is None:
        latest_scrape = db.execute(
            text("SELECT MAX(scraped_at::date) FROM listings_cleaned WHERE scraped_at IS NOT NULL")
        ).scalar()
        if not latest_scrape:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No listings with scraped_at date found in listings_cleaned.",
            )
        target_date = latest_scrape

    date_str = target_date.isoformat()

    # 2. Record observations into listing_price_history for that scrape date
    obs_sql = text("""
        INSERT INTO listing_price_history (listing_id, brand, model, year, price_eur, scraped_at)
        SELECT 
            id AS listing_id,
            brand,
            model,
            year,
            price_eur,
            scraped_at
        FROM listings_cleaned
        WHERE scraped_at::date = :target_date
          AND price_eur IS NOT NULL
          AND price_eur > 100
          AND year IS NOT NULL
        ON CONFLICT (listing_id, scraped_at) DO NOTHING
    """)
    res_obs = db.execute(obs_sql, {"target_date": target_date})
    obs_count = res_obs.rowcount if res_obs.rowcount is not None and res_obs.rowcount >= 0 else 0

    # 3. Aggregate into market_trends (median, average, min, max, count per brand, model, year)
    trend_sql = text("""
        INSERT INTO market_trends (
            brand, model, year, snapshot_date,
            avg_price, median_price, min_price, max_price, listing_count
        )
        SELECT 
            brand,
            model,
            year,
            :target_date AS snapshot_date,
            ROUND(AVG(price_eur)::numeric, 2) AS avg_price,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_eur)::numeric, 2) AS median_price,
            ROUND(MIN(price_eur)::numeric, 2) AS min_price,
            ROUND(MAX(price_eur)::numeric, 2) AS max_price,
            COUNT(*) AS listing_count
        FROM listings_cleaned
        WHERE scraped_at::date = :target_date
          AND price_eur IS NOT NULL
          AND price_eur > 100
          AND year IS NOT NULL
          AND brand IS NOT NULL
          AND model IS NOT NULL
        GROUP BY brand, model, year
        HAVING COUNT(*) >= 1
        ON CONFLICT (brand, model, year, snapshot_date) DO UPDATE
        SET 
            avg_price = EXCLUDED.avg_price,
            median_price = EXCLUDED.median_price,
            min_price = EXCLUDED.min_price,
            max_price = EXCLUDED.max_price,
            listing_count = EXCLUDED.listing_count
    """)
    res_trend = db.execute(trend_sql, {"target_date": target_date})
    trend_count = res_trend.rowcount if res_trend.rowcount is not None and res_trend.rowcount >= 0 else 0

    db.commit()

    return TrendsSyncResponse(
        message=f"Market trends successfully aggregated and synchronized for {date_str}.",
        snapshot_date=target_date,
        trends_records_processed=trend_count,
        observations_recorded=obs_count,
    )


def sync_all_unprocessed_trends(db: Session) -> list[TrendsSyncResponse]:
    """Finds all scrape dates in listings_cleaned that are not yet in market_trends and syncs them."""
    scrape_dates = [
        r[0]
        for r in db.execute(
            text("SELECT DISTINCT scraped_at::date FROM listings_cleaned WHERE scraped_at IS NOT NULL ORDER BY 1 ASC")
        ).fetchall()
        if r[0] is not None
    ]

    existing_dates = {
        r[0]
        for r in db.execute(
            text("SELECT DISTINCT snapshot_date FROM market_trends")
        ).fetchall()
        if r[0] is not None
    }

    results: list[TrendsSyncResponse] = []
    for d in scrape_dates:
        if d not in existing_dates:
            print(f"[TRENDS] Auto-syncing market trends for new scrape date: {d}...", flush=True)
            res = sync_market_trends(target_date=d, db=db)
            results.append(res)
    return results

