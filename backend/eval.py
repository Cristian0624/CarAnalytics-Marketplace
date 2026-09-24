import pandas as pd
import numpy as np
from sqlalchemy import text
from database import engine as db_engine
import psycopg2.extras

def evaluate_and_update_db(table_name="listings_cleaned"):
    """
    Reads unscored listings, calculates expected prices dynamically based on depreciation per 10k km,
    and updates the existing Score column.
    """
    query = f'SELECT * FROM {table_name} WHERE "Score" = 0 OR "Score" IS NULL'
    df = pd.read_sql(query, db_engine)

    if df.empty:
        print("No unscored listings found. Everything is up to date.")
        return

    print(f"Found {len(df)} unscored listings. Running advanced dynamic pricing algorithm...")

    current_year = 2026
    df['age'] = current_year - df['year']
    df['age'] = df['age'].apply(lambda x: max(1, x))

    if 'engine' in df.columns:
        df = df.rename(columns={'engine': 'engine_size'})

    price_col = 'price_eur' if 'price_eur' in df.columns else 'price'

    # We need the full DB to accurately calculate market metrics, not just the unscored ones
    print("Fetching full market data for accurate baseline calculation...")
    full_df = pd.read_sql(f'SELECT * FROM {table_name}', db_engine)
    if 'engine' in full_df.columns:
        full_df = full_df.rename(columns={'engine': 'engine_size'})

    def calc_metrics(group):
        med_price = group[price_col].median()
        if pd.isna(med_price) or med_price == 0:
            return pd.Series({'med_price': np.nan, 'baseline_mileage': np.nan, 'dep_per_10k': np.nan})
            
        # "Take the cars that have a relative same price as the median +- 500 euros"
        middle_cars = group[np.abs(group[price_col] - med_price) <= 500]
        if len(middle_cars) > 0:
            # "and make the average for the mileage for that few cars that are in the middle"
            baseline_mileage = middle_cars['mileage'].mean()
        else:
            baseline_mileage = group['mileage'].median()
            
        # "Take in dependence of how the mileage varies the amount of money that is less for 10000km"
        # We calculate the real market depreciation by comparing low-mileage vs high-mileage cars in the group
        med_m = group['mileage'].median()
        low_m = group[group['mileage'] <= med_m]
        high_m = group[group['mileage'] > med_m]
        
        if len(low_m) > 0 and len(high_m) > 0:
            delta_p = low_m[price_col].mean() - high_m[price_col].mean()
            delta_m = high_m['mileage'].mean() - low_m['mileage'].mean()
            
            # If there is enough difference to calculate a valid slope
            if delta_m >= 10000 and delta_p > 0:
                dep_per_10k = (delta_p / delta_m) * 10000
            else:
                dep_per_10k = med_price * 0.05 # Fallback: 5% depreciation per 10k km
        else:
            dep_per_10k = med_price * 0.05
            
        return pd.Series({
            'med_price': med_price,
            'baseline_mileage': baseline_mileage,
            'dep_per_10k': dep_per_10k
        })

    group_cols = ['brand', 'model', 'generation', 'year', 'engine_size', 'fuel_type', 'gearbox']
    print("Calculating market depreciation rates per 10,000km...")
    metrics = full_df.groupby(group_cols, dropna=False).apply(calc_metrics, include_groups=False).reset_index()
    
    print("Saving market metrics to database for real-time predictions...")
    metrics.to_sql('market_metrics', db_engine, if_exists='replace', index=False)
    
    # Merge metrics back into the unscored cars
    df = df.merge(metrics, on=group_cols, how='left')

    # Prevent sellers from manipulating the algorithm with fake/erroneous low mileages (e.g. 11111)
    suspiciously_low_threshold = df['age'] * 6000
    spam_mileages = [0, 1, 10, 100, 1000, 10000, 1111, 11111, 111111, 12345, 123456, 9999, 99999, 999999]
    is_spam_mileage = df['mileage'].isin(spam_mileages)
    
    # If mileage is fake or suspiciously low, we limit its ability to increase the Expected Price
    effective_mileage = df['mileage'].astype(float).copy()
    effective_mileage.loc[is_spam_mileage] = df['baseline_mileage'] # Neutralize spam inputs
    effective_mileage = np.maximum(effective_mileage, suspiciously_low_threshold) # Cap extremely low mileage

    # "in dependence of the mileage if bigger the price should be lower and if the mileage is lower the price is bigger"
    # Calculate Expected Price using the effective_mileage
    df['expected_price'] = df['med_price'] - ((effective_mileage - df['baseline_mileage']) / 10000) * df['dep_per_10k']
    df['expected_price'] = df['expected_price'].clip(lower=500) # prevent negative expected prices
    
    # "And penalise the deviations"
    # Calculate how far the actual price deviates from our calculated expected price
    df['price_diff_pct'] = ((df['expected_price'] - df[price_col]) / df['expected_price']) * 100

    df['calc_score'] = 50.0
    
    def calculate_score_mod(pct):
        if pd.isna(pct):
            return 0.0
        if pct > 0:
            bonus = 0
            remaining = pct
            
            t1 = min(remaining, 20.0)
            bonus += t1 * 1.3
            remaining -= t1
            
            if remaining > 0:
                t2 = min(remaining, 10.0)
                bonus += t2 * 1.0
                remaining -= t2
                
            if remaining > 0:
                t3 = min(remaining, 10.0)
                bonus += t3 * 0.5
                remaining -= t3
                
            if remaining > 0:
                bonus += remaining * 0.2
                
            return bonus
        else:
            penalty = 0
            remaining = abs(pct)
            
            t1 = min(remaining, 15.0)
            penalty += t1 * 1.0
            remaining -= t1
            
            if remaining > 0:
                t2 = min(remaining, 10.0)
                penalty += t2 * 1.3
                remaining -= t2
                
            if remaining > 0:
                t3 = min(remaining, 10.0)
                penalty += t3 * 1.6
                remaining -= t3
                
            if remaining > 0:
                penalty += remaining * 2.0
                
            return -penalty

    df['calc_score'] += df['price_diff_pct'].apply(calculate_score_mod)

    # Suspiciously low mileage penalty (also penalize spam mileage)
    is_low_mileage = (df['mileage'] < suspiciously_low_threshold) | is_spam_mileage
    
    df.loc[is_low_mileage & (df['age'] <= 3), 'calc_score'] -= 7.0
    df.loc[is_low_mileage & (df['age'] > 3), 'calc_score'] -= 15.0

    if 'state' in df.columns:
        damaged_mask = df['state'].str.lower().str.contains('damage|salvage|crash|wreck|defect', na=False)
        df.loc[damaged_mask, 'calc_score'] = np.minimum(df.loc[damaged_mask, 'calc_score'], 30.0)

    df['final_score'] = df['calc_score'].clip(0, 100).round(2)
    df.loc[df['med_price'].isna(), 'final_score'] = 50.0

    updates = [{"score": float(score), "row_id": int(row_id)} for score, row_id in zip(df['final_score'], df['id'])]

    print(f"Preparing fast bulk update for {len(updates)} listings...")
    update_tuples = [(u['score'], u['row_id']) for u in updates]
    
    raw_conn = db_engine.raw_connection()
    try:
        with raw_conn.cursor() as cur:
            query = f"""
                UPDATE {table_name} AS t
                SET "Score" = v.score
                FROM (VALUES %s) AS v(score, id)
                WHERE t.id = v.id
            """
            psycopg2.extras.execute_values(
                cur,
                query,
                update_tuples,
                template="(%s, %s)",
                page_size=5000
            )
        raw_conn.commit()
    finally:
        raw_conn.close()
        
    print(f"Algorithm applied successfully. Updated {len(updates)} listings.")
