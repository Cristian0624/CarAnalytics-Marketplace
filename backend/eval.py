import pandas as pd
import numpy as np
from sqlalchemy import text
from database import engine as db_engine
import psycopg2.extras

def evaluate_and_update_db(table_name="listings_cleaned"):
    """
    Reads unscored listings from the database, applies the scoring algorithm,
    and updates the existing Score column.
    """
    query = f'SELECT * FROM {table_name} WHERE "Score" = 0 OR "Score" IS NULL'
    df = pd.read_sql(query, db_engine)

    if df.empty:
        print("No unscored listings found. Everything is up to date.")
        return

    print(f"Found {len(df)} unscored listings. Running scoring algorithm...")

    current_year = 2026
    df['age'] = current_year - df['year']
    df['age'] = df['age'].apply(lambda x: max(1, x))

    if 'engine' in df.columns:
        df = df.rename(columns={'engine': 'engine_type'})

    broad_cols = ['brand', 'model', 'generation']
    strict_cols = ['brand', 'model', 'generation']
    
    if 'engine_type' in df.columns:
        strict_cols.append('engine_type')
    if 'gearbox' in df.columns:
        strict_cols.append('gearbox')

    df['strict_count'] = df.groupby(strict_cols, dropna=False)['id'].transform('count')
    df['broad_count'] = df.groupby(broad_cols, dropna=False)['id'].transform('count')

    df['strict_med_price'] = df.groupby(strict_cols, dropna=False)['price'].transform('median')
    df['strict_med_mileage'] = df.groupby(strict_cols, dropna=False)['mileage'].transform('median')
    df['broad_med_price'] = df.groupby(broad_cols, dropna=False)['price'].transform('median')
    df['broad_med_mileage'] = df.groupby(broad_cols, dropna=False)['mileage'].transform('median')

    df['target_med_price'] = np.where(
        df['strict_count'] >= 3, df['strict_med_price'],
        np.where(df['broad_count'] >= 3, df['broad_med_price'], np.nan)
    )
    df['target_med_mileage'] = np.where(
        df['strict_count'] >= 3, df['strict_med_mileage'],
        np.where(df['broad_count'] >= 3, df['broad_med_mileage'], np.nan)
    )

    df['target_med_price'] = df['target_med_price'].replace(0, np.nan)
    df['target_med_mileage'] = df['target_med_mileage'].replace(0, np.nan)

    df['calc_score'] = 50.0

    price_diff_pct = ((df['target_med_price'] - df['price']) / df['target_med_price']) * 100
    price_mod = np.clip(price_diff_pct * 1.5, -40.0, 40.0).fillna(0)

    mileage_diff_pct = ((df['target_med_mileage'] - df['mileage']) / df['target_med_mileage']) * 100
    mileage_mod = np.clip(mileage_diff_pct * 0.2, -10.0, 10.0).fillna(0)

    df['calc_score'] += price_mod + mileage_mod

    suspiciously_low_threshold = df['age'] * 6000
    is_low_mileage = df['mileage'] < suspiciously_low_threshold

    df.loc[is_low_mileage, 'calc_score'] -= mileage_mod[is_low_mileage]
    df.loc[is_low_mileage & (df['age'] <= 3), 'calc_score'] -= 7.0
    df.loc[is_low_mileage & (df['age'] > 3), 'calc_score'] -= 15.0

    if 'state' in df.columns:
        damaged_mask = df['state'].str.lower().str.contains('damage|salvage|crash|wreck|defect', na=False)
        df.loc[damaged_mask, 'calc_score'] = np.minimum(df.loc[damaged_mask, 'calc_score'], 30.0)

    df['final_score'] = df['calc_score'].clip(0, 100).round(2)
    df.loc[df['target_med_price'].isna(), 'final_score'] = 50.0

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
