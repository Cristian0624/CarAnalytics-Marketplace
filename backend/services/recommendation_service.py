from typing import Optional, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from models import CarListing, ModelClass
from schemas import (
    CarListingBase,
    CarCategories,
    RecommendedCarItem,
    RecommendationTarget,
    RecommendationResponse,
)

# Fixed default tolerances (never exceed these bounds)
DEFAULT_PRICE_TOLERANCE = 0.10     # +/- 10%
DEFAULT_MILEAGE_TOLERANCE = 0.20   # +/- 20%

# Vehicle Class Clusters (aligned with European market_segment in dataset)
MIDSIZE_EXECUTIVE_CLASSES = [
    "D-segment (Mid-size)",
    "E (Groot Midden)",
]

COMPACT_SUBCOMPACT_CLASSES = [
    "C-segment (Compact)",
    "B-segment (Supermini)",
    "A-segment (Mini)",
]

SUV_CLASSES = [
    "L (Lower-Suv)",
    "M (Upper-Suv)",
]

MPV_VAN_CLASSES = [
    "J (Lower-Mpv)",
    "K (Upper-Mpv)",
    "N (Bestelauto)",
]

SPORTS_CLASSES = [
    "G (Sportief)",
    "H (Sport)",
]

LUXURY_CLASSES = [
    "F (Groot)",
    "I (Luxe)",
]


def resolve_car_class(db: Session, brand: str, model: str, current_class: Optional[str] = None) -> Optional[str]:
    """
    Resolves the car class internally from database model_class lookup.
    Handles case-insensitive and whitespace/dash-normalized search.
    """
    if current_class and current_class.strip():
        return current_class.strip()

    clean_brand = brand.strip() if brand else ""
    clean_model = model.strip() if model else ""

    if not clean_model:
        return None

    entry = db.query(ModelClass).filter(
        ModelClass.brand.ilike(clean_brand),
        ModelClass.model.ilike(clean_model)
    ).first()

    if entry and entry.market_segment:
        return entry.market_segment

    # Fallback by model name alone
    entry = db.query(ModelClass).filter(
        ModelClass.model.ilike(clean_model),
        ModelClass.market_segment.isnot(None)
    ).first()

    if entry and entry.market_segment:
        return entry.market_segment

    # Normalized match (stripping spaces and hyphens e.g. "rav4" -> "rav 4", "f-150" -> "f 150")
    norm_model = clean_model.replace(" ", "").replace("-", "")
    entry = db.query(ModelClass).filter(
        func.replace(func.replace(ModelClass.model, " ", ""), "-", "").ilike(f"%{norm_model}%"),
        ModelClass.market_segment.isnot(None)
    ).first()

    return entry.market_segment if entry else None


def resolve_target_profile(
    db: Session,
    brand: str,
    model: str,
    body_type: Optional[str] = None,
    car_class: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str], str, str]:
    """
    Infers the target vehicle's body type, car class, and category cluster.
    Returns: (resolved_body, resolved_class, cluster_key, cluster_name)
    """
    clean_brand = brand.strip() if brand else ""
    clean_model = model.strip() if model else ""
    clean_body = body_type.strip() if body_type else None
    clean_class = car_class.strip() if car_class else None

    norm_model = clean_model.replace(" ", "").replace("-", "")

    # If body_type is missing, infer top body_type for model from CarListing
    if not clean_body and clean_model:
        top_b_query = db.query(CarListing.body_type, func.count(CarListing.id)).filter(
            func.replace(func.replace(CarListing.model, " ", ""), "-", "").ilike(f"%{norm_model}%"),
            CarListing.body_type.isnot(None),
        )
        if clean_brand:
            top_b_query = top_b_query.filter(CarListing.brand.ilike(clean_brand))
        top_b = top_b_query.group_by(CarListing.body_type).order_by(func.count(CarListing.id).desc()).first()
        if top_b:
            clean_body = top_b[0]

    # If car_class is missing, infer from ModelClass or CarListing
    if not clean_class and clean_model:
        clean_class = resolve_car_class(db, clean_brand, clean_model, None)
        if not clean_class:
            top_c_query = db.query(CarListing.class_, func.count(CarListing.id)).filter(
                func.replace(func.replace(CarListing.model, " ", ""), "-", "").ilike(f"%{norm_model}%"),
                CarListing.class_.isnot(None),
            )
            if clean_brand:
                top_c_query = top_c_query.filter(CarListing.brand.ilike(clean_brand))
            top_c = top_c_query.group_by(CarListing.class_).order_by(func.count(CarListing.id).desc()).first()
            if top_c:
                clean_class = top_c[0]

    b_lower = (clean_body or "").lower()
    c_str = clean_class or ""
    m_lower = clean_model.lower()

    # 1. Pickup
    pickup_keywords = [
        "pickup", "pick-up", "f-150", "f150", "ram", "hilux", "ranger",
        "amarok", "navara", "l200", "silverado", "tundra", "tacoma", "titan", "ridgeline"
    ]
    if "pickup" in b_lower or any(pk in m_lower for pk in pickup_keywords):
        return (clean_body or "Pickup", clean_class, "pickup", "Pickup")

    # 2. SUV & Crossover
    if (
        b_lower in ["suv", "crossover"]
        or "suv" in b_lower
        or "crossover" in b_lower
        or c_str in SUV_CLASSES
    ):
        return (clean_body or "SUV", clean_class or "M (Upper-Suv)", "suv_crossover", "SUV / Crossover")

    # 3. Mid-size & Executive Saloons / Estates (D & E segment - Passat, Audi A6, BMW 3/5, Skoda Superb)
    if c_str in MIDSIZE_EXECUTIVE_CLASSES:
        return (clean_body or "Sedan", clean_class, "midsize_executive", "Mid-size / Executive (D/E-segment)")

    # 4. Compact & Subcompact (A, B, C segment - Golf, Focus, Astra, Megane, Octavia)
    if c_str in COMPACT_SUBCOMPACT_CLASSES:
        return (clean_body or "Hatchback", clean_class, "compact_subcompact", "Compact / Subcompact (A/B/C-segment)")

    # 5. Minivan / MPV / Van
    if (
        b_lower in ["minivan", "microvan", "furgon"]
        or "van" in b_lower
        or c_str in MPV_VAN_CLASSES
    ):
        return (clean_body or "Minivan", clean_class, "minivan_mpv", "Minivan / MPV")

    # 6. Coupe / Convertible / Roadster
    if (
        b_lower in ["coupe", "cabriolet", "roadster"]
        or c_str in SPORTS_CLASSES
    ):
        return (clean_body or "Coupe", clean_class, "sports_coupe", "Coupe / Sports")

    # 7. Luxury Saloon (F & I segment)
    if c_str in LUXURY_CLASSES:
        return (clean_body or "Sedan", clean_class, "luxury_saloon", "Luxury Saloon (F/I-segment)")

    # 8. Camionetă (light commercial)
    if "camionet" in b_lower:
        return (clean_body or "Camionetă", clean_class, "camioneta", "Camionetă")

    # 9. Exact body match if specified
    if clean_body:
        return (clean_body, clean_class, "body_exact", clean_body)

    return (clean_body, clean_class, "generic", "All Vehicle Classes")


def calculate_similarity(
    target_price: float,
    target_mileage: int,
    target_year: Optional[int],
    target_brand: str,
    target_model: str,
    target_class: Optional[str],
    target_body: Optional[str],
    cand: CarListing,
) -> Tuple[float, float, float, int, float, List[str], float]:
    """
    Calculates similarity score (0 - 100), differences, explanatory reasons, and combined tolerance distance.
    """
    cand_price = float(cand.price_eur) if cand.price_eur is not None else 0.0
    cand_mileage = int(cand.mileage) if cand.mileage is not None else 0
    cand_year = cand.year

    price_diff_eur = round(cand_price - target_price, 2)
    price_pct = (price_diff_eur / max(target_price, 1.0)) * 100.0

    mileage_diff_km = cand_mileage - target_mileage
    mileage_pct = (mileage_diff_km / max(target_mileage, 10000)) * 100.0

    # Combined tolerance distance metric: lower means closer to target price & mileage
    rel_price_dev = abs(price_diff_eur) / max(target_price, 1.0)
    rel_mileage_dev = abs(mileage_diff_km) / max(target_mileage, 10000)
    combined_tolerance_distance = rel_price_dev + rel_mileage_dev

    # Normalized component scores (0.0 to 1.0)
    abs_price_pct = abs(price_pct)
    price_score = max(0.0, 1.0 - (abs_price_pct / 10.0))  # Max 1.0 within 10% tolerance

    abs_mileage_pct = abs(mileage_pct)
    mileage_score = max(0.0, 1.0 - (abs_mileage_pct / 20.0))  # Max 1.0 within 20% tolerance

    # Segment compatibility score
    cand_class = cand.class_
    if cand_class == target_class and target_class is not None:
        class_score = 1.0
    elif (
        target_class in MIDSIZE_EXECUTIVE_CLASSES
        and cand_class in MIDSIZE_EXECUTIVE_CLASSES
    ):
        class_score = 0.90
    else:
        class_score = 0.80

    # Year score
    if target_year and cand_year:
        year_diff = abs(cand_year - target_year)
        year_score = max(0.0, 1.0 - (year_diff / 15.0))
    else:
        year_score = 0.70

    is_same_model = (
        cand.brand.strip().lower() == target_brand.strip().lower()
        and cand.model.strip().lower() == target_model.strip().lower()
    )
    model_factor = 1.05 if is_same_model else 1.0

    # Slight body bonus if same body style
    body_factor = 1.0
    if target_body and cand.body_type:
        if cand.body_type.strip().lower() == target_body.strip().lower():
            body_factor = 1.03

    raw_score = (
        0.40 * price_score
        + 0.35 * mileage_score
        + 0.15 * class_score
        + 0.10 * year_score
    ) * model_factor * body_factor

    final_score = round(min(100.0, max(0.0, raw_score * 100.0)), 1)

    # Explanatory reasons
    reasons = []
    if is_same_model:
        reasons.append(f"Same model ({cand.brand} {cand.model})")
    elif (
        target_class in MIDSIZE_EXECUTIVE_CLASSES
        and cand_class == "E (Groot Midden)"
        and target_class == "D-segment (Mid-size)"
    ):
        reasons.append("Executive class alternative (upper segment in same budget)")
    elif cand_class == target_class and cand_class:
        reasons.append(f"Same vehicle class: {cand_class}")
    elif cand.body_type and target_body and cand.body_type.strip().lower() == target_body.strip().lower():
        reasons.append(f"Same body type: {cand.body_type}")
    elif cand.body_type:
        reasons.append(f"{cand.body_type} body alternative")

    if abs_price_pct < 1.0:
        reasons.append(f"Virtually identical price (€{int(cand_price):,})")
    elif price_diff_eur < 0:
        reasons.append(f"Save {abs(round(price_pct, 1))}% (€{int(cand_price):,} vs €{int(target_price):,})")
    else:
        reasons.append(f"Price within +{round(price_pct, 1)}% (€{int(cand_price):,} vs €{int(target_price):,})")

    if abs_mileage_pct < 3.0:
        reasons.append(f"Virtually identical mileage ({cand_mileage:,} km)")
    elif mileage_diff_km < 0:
        reasons.append(f"Lower mileage by {abs(mileage_diff_km):,} km ({cand_mileage:,} km)")
    else:
        reasons.append(f"Mileage within +{round(mileage_pct, 1)}% ({cand_mileage:,} km)")

    if target_year and cand_year:
        if cand_year == target_year:
            reasons.append(f"Same model year ({cand_year})")
        elif cand_year < target_year - 2:
            reasons.append(f"Older premium alternative ({cand_year})")
        elif cand_year > target_year:
            reasons.append(f"Newer model year ({cand_year})")

    return (
        final_score,
        price_diff_eur,
        round(price_pct, 2),
        mileage_diff_km,
        round(mileage_pct, 2),
        reasons,
        combined_tolerance_distance,
    )


def get_recommendations_for_listing(
    db: Session,
    listing_id: int,
) -> RecommendationResponse:
    """
    Main entry point: find recommendations for an existing car listing in the database.
    Recommendations are in the same vehicle class / category (e.g. pickup for pickup).
    Price and mileage tolerances are strictly fixed at 0.20 and 0.25 (never exceeded).
    """
    target = db.query(CarListing).filter(CarListing.id == listing_id).first()
    if not target:
        raise ValueError(f"Car listing with id {listing_id} not found")

    target_price = float(target.price_eur) if target.price_eur is not None else float(target.price or 0.0)
    target_mileage = int(target.mileage or 0)

    return get_recommendations_by_attributes(
        db=db,
        brand=target.brand,
        model=target.model,
        price_eur=target_price,
        mileage=target_mileage,
        year=target.year,
        body_type=target.body_type,
        exclude_id=target.id,
    )


def get_recommendations_by_attributes(
    db: Session,
    brand: str,
    model: str,
    price_eur: float,
    mileage: int,
    year: int,
    body_type: Optional[str] = None,
    exclude_id: Optional[int] = None,
) -> RecommendationResponse:
    """
    Finds recommendations based on car attributes.
    - Matches vehicle class / category: if the car is a pickup, recommendations are pickups!
    - Strict tolerances: price within +/- 10% and mileage within +/- 20% (never exceeded).
    - Ranked by lowest price and mileage tolerance deviation.
    """
    clean_brand = brand.strip() if brand else ""
    clean_model = model.strip() if model else ""

    if price_eur <= 0:
        price_eur = 1000.0

    # Resolve vehicle profile and class cluster internally (never ask user)
    resolved_body, resolved_class, cluster_key, cluster_name = resolve_target_profile(
        db=db,
        brand=clean_brand,
        model=clean_model,
        body_type=body_type,
        car_class=None,
    )

    # Strict bounds: do NOT exceed 10% price and 20% mileage tolerance
    p_min = price_eur * (1.0 - DEFAULT_PRICE_TOLERANCE)
    p_max = price_eur * (1.0 + DEFAULT_PRICE_TOLERANCE)
    m_window = max(20000, int(mileage * DEFAULT_MILEAGE_TOLERANCE))
    m_min = max(0, mileage - m_window)
    m_max = mileage + m_window

    query = db.query(CarListing).filter(
        CarListing.price_eur >= p_min,
        CarListing.price_eur <= p_max,
        CarListing.mileage >= m_min,
        CarListing.mileage <= m_max,
    )

    if exclude_id is not None:
        query = query.filter(CarListing.id != exclude_id)

    # Apply vehicle class / category cluster filter so recommendations are in the SAME CLASS
    if cluster_key == "pickup":
        query = query.filter(CarListing.body_type.ilike("%pickup%"))
    elif cluster_key == "suv_crossover":
        query = query.filter(
            or_(
                CarListing.body_type.in_(["SUV", "Crossover"]),
                CarListing.class_.in_(SUV_CLASSES),
            )
        )
    elif cluster_key == "midsize_executive":
        query = query.filter(
            CarListing.class_.in_(MIDSIZE_EXECUTIVE_CLASSES),
            CarListing.body_type.in_(["Sedan", "Universal", "Combi", "Hatchback"]),
        )
    elif cluster_key == "compact_subcompact":
        query = query.filter(
            CarListing.class_.in_(COMPACT_SUBCOMPACT_CLASSES),
            CarListing.body_type.in_(["Hatchback", "Sedan", "Universal", "Combi"]),
        )
    elif cluster_key == "minivan_mpv":
        query = query.filter(
            or_(
                CarListing.body_type.in_(["Minivan", "Microvan", "Furgon"]),
                CarListing.class_.in_(MPV_VAN_CLASSES),
            )
        )
    elif cluster_key == "sports_coupe":
        query = query.filter(
            or_(
                CarListing.body_type.in_(["Coupe", "Cabriolet", "Roadster"]),
                CarListing.class_.in_(SPORTS_CLASSES),
            )
        )
    elif cluster_key == "luxury_saloon":
        query = query.filter(
            CarListing.class_.in_(LUXURY_CLASSES),
            CarListing.body_type.in_(["Sedan"]),
        )
    elif cluster_key == "camioneta":
        query = query.filter(CarListing.body_type.ilike("%camionet%"))
    elif cluster_key == "body_exact" and resolved_body:
        query = query.filter(CarListing.body_type.ilike(resolved_body))

    candidates = query.all()

    # Score, rank, and verify tolerance bounds
    scored_items: List[Tuple[float, RecommendedCarItem]] = []
    for cand in candidates:
        cand_price = float(cand.price_eur or 0.0)
        cand_mileage = int(cand.mileage or 0)

        # Strictly check bounds: must not exceed price tolerance and mileage tolerance
        if cand_price < p_min or cand_price > p_max:
            continue
        if cand_mileage < m_min or cand_mileage > m_max:
            continue

        score, p_diff, p_pct, m_diff, m_pct, reasons, tolerance_dist = calculate_similarity(
            target_price=price_eur,
            target_mileage=mileage,
            target_year=year,
            target_brand=clean_brand,
            target_model=clean_model,
            target_class=resolved_class,
            target_body=resolved_body,
            cand=cand,
        )

        raw_url = cand.url
        if not raw_url:
            cand_url = f"https://999.md/ro/{cand.id}"
        elif raw_url.startswith("http"):
            cand_url = raw_url
        else:
            cand_url = f"https://999.md{raw_url}"

        item = RecommendedCarItem(
            id=cand.id,
            brand=cand.brand,
            model=cand.model,
            year=cand.year,
            mileage=cand.mileage,
            price=float(cand.price) if cand.price is not None else None,
            currency=cand.currency,
            price_eur=cand.price_eur,
            engine=str(cand.engine) if cand.engine is not None else None,
            fuel_type=cand.fuel_type,
            gearbox=cand.gearbox,
            body_type=cand.body_type,
            generation=cand.generation,
            horsepower=cand.horsepower,
            drivetrain=cand.drivetrain,
            url=cand_url,
            link_999=cand_url,
            seller_type=cand.seller_type,
            car_class=cand.class_,
            similarity_score=score,
            price_diff_eur=p_diff,
            price_diff_percent=p_pct,
            mileage_diff_km=m_diff,
            mileage_diff_percent=m_pct,
            match_reasons=reasons,
            categories=CarCategories(
                brand=cand.brand,
                model=cand.model,
                price_eur=cand_price,
                mileage=cand_mileage,
                year=cand.year,
                body=cand.body_type,
                link_999=cand_url,
            ),
        )
        scored_items.append((tolerance_dist, item))

    # Sort primarily by lowest tolerance deviation (closest price & mileage), secondarily by similarity score
    scored_items.sort(key=lambda x: (x[0], -x[1].similarity_score))
    ranked_items = [x[1] for x in scored_items]

    target_url = f"https://999.md/ro/{exclude_id}" if exclude_id else None
    target_categories = CarCategories(
        brand=clean_brand,
        model=clean_model,
        price_eur=price_eur,
        mileage=mileage,
        year=year,
        body=resolved_body,
        link_999=target_url,
    )

    target_obj = RecommendationTarget(
        id=exclude_id,
        brand=clean_brand,
        model=clean_model,
        year=year,
        mileage=mileage,
        price_eur=price_eur,
        body_type=resolved_body,
        car_class=resolved_class,
        categories=target_categories,
    )

    same_model_recs = [
        r for r in ranked_items
        if r.brand.lower() == clean_brand.lower() and clean_model.lower() in r.model.lower()
    ]
    competitor_recs = [
        r for r in ranked_items
        if not (r.brand.lower() == clean_brand.lower() and clean_model.lower() in r.model.lower())
    ]

    return RecommendationResponse(
        target=target_obj,
        total_found=len(ranked_items),
        price_range_applied={"min": round(p_min, 2), "max": round(p_max, 2)},
        mileage_range_applied={"min": int(m_min), "max": int(m_max)},
        allowed_classes=[cluster_name] if cluster_name else [],
        excluded_body_types=[],
        recommendations=ranked_items,
        same_model_recommendations=same_model_recs,
        peer_competitor_recommendations=competitor_recs,
    )
