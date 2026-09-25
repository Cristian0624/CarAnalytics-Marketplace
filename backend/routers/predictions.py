from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter(
    prefix="/predict",
    tags=["Predictions"]
)

@router.get("/brands")
def get_brands(query: str = "", db: Session = Depends(get_db)):
    sql = text("SELECT DISTINCT brand FROM market_metrics WHERE brand ILIKE :query ORDER BY brand LIMIT 20")
    results = db.execute(sql, {"query": f"%{query}%"}).fetchall()
    return {"brands": [r[0] for r in results if r[0]]}

@router.get("/models")
def get_models(brand: str, query: str = "", db: Session = Depends(get_db)):
    sql = text("SELECT DISTINCT model FROM market_metrics WHERE brand = :brand AND model ILIKE :query ORDER BY model LIMIT 30")
    results = db.execute(sql, {"brand": brand, "query": f"%{query}%"}).fetchall()
    return {"models": [r[0] for r in results if r[0]]}

@router.get("/generations")
def get_generations(brand: str, model: str, query: str = "", db: Session = Depends(get_db)):
    sql = text("SELECT DISTINCT generation FROM market_metrics WHERE brand = :brand AND model = :model AND generation ILIKE :query ORDER BY generation LIMIT 30")
    query_search = query.replace('C', '%').replace('c', '%')
    results = db.execute(sql, {"brand": brand, "model": model, "query": f"%{query_search}%"}).fetchall()
    return {"generations": [r[0] for r in results if r[0]]}

@router.get("/engines")
def get_engines(brand: str, model: str, generation: str, query: str = "", db: Session = Depends(get_db)):
    sql = text("SELECT DISTINCT engine_size FROM market_metrics WHERE brand = :brand AND model = :model AND generation = :gen AND engine_size ILIKE :query ORDER BY engine_size LIMIT 30")
    results = db.execute(sql, {"brand": brand, "model": model, "gen": generation, "query": f"%{query}%"}).fetchall()
    if not results:
        gen_cyrillic = generation.replace('C', 'С').replace('c', 'с')
        results = db.execute(sql, {"brand": brand, "model": model, "gen": gen_cyrillic, "query": f"%{query}%"}).fetchall()
    return {"engines": [r[0] for r in results if r[0]]}

@router.get("/fuels")
def get_fuels(brand: str, model: str, generation: str, engine_size: str, query: str = "", db: Session = Depends(get_db)):
    sql = text("SELECT DISTINCT fuel_type FROM market_metrics WHERE brand = :brand AND model = :model AND generation = :gen AND engine_size = :eng AND fuel_type ILIKE :query ORDER BY fuel_type LIMIT 30")
    results = db.execute(sql, {"brand": brand, "model": model, "gen": generation, "eng": engine_size, "query": f"%{query}%"}).fetchall()
    if not results:
        gen_cyrillic = generation.replace('C', 'С').replace('c', 'с')
        results = db.execute(sql, {"brand": brand, "model": model, "gen": gen_cyrillic, "eng": engine_size, "query": f"%{query}%"}).fetchall()
    return {"fuels": [r[0] for r in results if r[0]]}

@router.get("/gearboxes")
def get_gearboxes(brand: str, model: str, generation: str, engine_size: str, fuel_type: str, query: str = "", db: Session = Depends(get_db)):
    sql = text("SELECT DISTINCT gearbox FROM market_metrics WHERE brand = :brand AND model = :model AND generation = :gen AND engine_size = :eng AND fuel_type = :fuel AND gearbox ILIKE :query ORDER BY gearbox LIMIT 30")
    results = db.execute(sql, {"brand": brand, "model": model, "gen": generation, "eng": engine_size, "fuel": fuel_type, "query": f"%{query}%"}).fetchall()
    if not results:
        gen_cyrillic = generation.replace('C', 'С').replace('c', 'с')
        results = db.execute(sql, {"brand": brand, "model": model, "gen": gen_cyrillic, "eng": engine_size, "fuel": fuel_type, "query": f"%{query}%"}).fetchall()
    return {"gearboxes": [r[0] for r in results if r[0]]}

@router.get("/price")
def predict_price(
    brand: str,
    model: str,
    generation: str,
    engine_size: str,
    fuel_type: str,
    gearbox: str,
    mileage: float,
    year: int,
    db: Session = Depends(get_db)
):
    query = text("""
        SELECT * FROM market_metrics 
        WHERE brand = :brand 
          AND model = :model 
          AND generation = :generation
          AND year = :year
          AND engine_size = :engine_size
          AND fuel_type = :fuel_type
          AND gearbox = :gearbox
    """)
    result = db.execute(query, {
        "brand": brand, 
        "model": model, 
        "generation": generation,
        "year": year,
        "engine_size": engine_size,
        "fuel_type": fuel_type,
        "gearbox": gearbox
    }).mappings().first()
    
    if not result:
        gen_cyrillic = generation.replace('C', 'С').replace('c', 'с')
        result = db.execute(query, {
            "brand": brand, 
            "model": model, 
            "generation": gen_cyrillic,
            "year": year,
            "engine_size": engine_size,
            "fuel_type": fuel_type,
            "gearbox": gearbox
        }).mappings().first()

    if not result or not result['med_price']:
        raise HTTPException(status_code=404, detail="Not enough market data for this highly specific combination of car model, engine size, fuel, and gearbox.")

    med_price = float(result['med_price'])
    baseline_mileage = float(result['baseline_mileage'])
    dep_per_10k = float(result['dep_per_10k'])

    age = max(1, 2026 - year)
    suspiciously_low_threshold = age * 6000
    spam_mileages = [0, 1, 10, 100, 1000, 10000, 1111, 11111, 111111, 12345, 123456, 9999, 99999, 999999]
    
    effective_mileage = float(mileage)
    if mileage in spam_mileages:
        effective_mileage = baseline_mileage
    effective_mileage = max(effective_mileage, suspiciously_low_threshold)

    expected_price = med_price - ((effective_mileage - baseline_mileage) / 10000) * dep_per_10k
    expected_price = max(500.0, expected_price)

    def get_price_for_score(target_score):
        penalty = 0
        if (mileage < suspiciously_low_threshold or mileage in spam_mileages):
            if age <= 3:
                penalty = 15.0
            else:
                penalty = 30.0
                
        is_taxi = (mileage / age) > 45000
        if is_taxi:
            penalty += 20.0
                
        required_calc_score = target_score + penalty
        diff_from_50 = required_calc_score - 50.0
        
        if diff_from_50 >= 0:
            # New max possible bonus is 28 (13 + 10 + 5)
            bonus = min(diff_from_50, 28.0) 
            pct = 0.0
            
            t1 = min(bonus, 13.0) # 10% * 1.3
            pct += t1 / 1.3
            bonus -= t1
            
            if bonus > 0:
                t2 = min(bonus, 10.0) # 10% * 1.0
                pct += t2 / 1.0
                bonus -= t2
                
            if bonus > 0:
                t3 = min(bonus, 5.0) # 10% * 0.5
                pct += t3 / 0.5
                bonus -= t3
                
            price_diff_pct = pct
        else:
            # We need a penalty. Reverse the penalty piecewise function
            pen = abs(diff_from_50)
            pct = 0.0
            
            t1 = min(pen, 15.0) # 15% * 1.0
            pct += t1 / 1.0
            pen -= t1
            
            if pen > 0:
                t2 = min(pen, 13.0) # 10% * 1.3
                pct += t2 / 1.3
                pen -= t2
                
            if pen > 0:
                t3 = min(pen, 16.0) # 10% * 1.6
                pct += t3 / 1.6
                pen -= t3
                
            if pen > 0:
                pct += pen / 2.0
                
            price_diff_pct = -pct
            
        target_price = expected_price * (1 - (price_diff_pct / 100))
        return round(target_price)

    fair_price = get_price_for_score(50)
    good_deal_price = get_price_for_score(65)
    excellent_deal_price = get_price_for_score(75)

    return {
        "car": f"{brand} {model} {generation} {engine_size} {fuel_type} {gearbox}",
        "true_market_value": round(expected_price),
        "recommendations": [
            {
                "description": "Fair Market Price (Average deal, Score: ~50)",
                "recommended_price_eur": fair_price,
                "expected_score": 50
            },
            {
                "description": "Good Deal (Sells faster, Score: ~65)",
                "recommended_price_eur": good_deal_price,
                "expected_score": 65
            },
            {
                "description": "Excellent Deal (Sells immediately, Score: ~75)",
                "recommended_price_eur": excellent_deal_price,
                "expected_score": 75
            }
        ]
    }
