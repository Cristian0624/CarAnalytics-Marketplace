import pandas as pd
import numpy as np
import psycopg2.extras
from backend.database import engine as db_engine

def evaluate_and_update_db(table_name="listings_cleaned", price_col="price_eur", full_evaluation=False):
    if full_evaluation:
        query = f'SELECT * FROM {table_name}'
    else:
        query = f'SELECT * FROM {table_name} WHERE "Score" = 0 OR "Score" IS NULL'
        
    df = pd.read_sql(query, db_engine)
    
    if df.empty:
        print("No unscored listings found.")
        return

    print(f"Found {len(df)} unscored listings. Running advanced dynamic pricing algorithm...")

    print("Fetching full market data for accurate baseline calculation...")
    full_df = pd.read_sql(f'SELECT * FROM {table_name}', db_engine)
    
    if 'engine' in df.columns:
        df = df.rename(columns={'engine': 'engine_size'})
    if 'engine' in full_df.columns:
        full_df = full_df.rename(columns={'engine': 'engine_size'})

    def calc_metrics(group):
        if len(group) >= 5:
            p10 = group[price_col].quantile(0.10)
            p90 = group[price_col].quantile(0.90)
            valid_group = group[(group[price_col] >= p10) & (group[price_col] <= p90)]
            if len(valid_group) > 0:
                group = valid_group
                
        med_price = group[price_col].median()
        if pd.isna(med_price) or med_price == 0:
            return pd.Series({'med_price': np.nan, 'baseline_mileage': np.nan, 'dep_per_10k': np.nan, 'count': 0})
            
        middle_cars = group[np.abs(group[price_col] - med_price) <= (0.05 * med_price)]
        if len(middle_cars) > 0:
            baseline_mileage = middle_cars['mileage'].mean()
        else:
            baseline_mileage = group['mileage'].median()
            
        med_m = group['mileage'].median()
        low_m = group[group['mileage'] <= med_m]
        high_m = group[group['mileage'] > med_m]
        
        if len(low_m) > 0 and len(high_m) > 0:
            delta_p = low_m[price_col].mean() - high_m[price_col].mean()
            delta_m = high_m['mileage'].mean() - low_m['mileage'].mean()
            
            if delta_m >= 10000 and delta_p > 0:
                dep_per_10k = (delta_p / delta_m) * 10000
            else:
                dep_per_10k = med_price * 0.05 
        else:
            dep_per_10k = med_price * 0.05
            
        return pd.Series({
            'med_price': med_price,
            'baseline_mileage': baseline_mileage,
            'dep_per_10k': dep_per_10k,
            'count': len(group)
        })

    l1_cols = ['brand', 'model', 'generation', 'year', 'engine_size', 'fuel_type', 'gearbox']
    l2_cols = ['brand', 'model', 'generation', 'year']
    
    print("Calculating L1 market depreciation rates per 10,000km...")
    metrics_l1 = full_df.groupby(l1_cols, dropna=False).apply(calc_metrics, include_groups=False).reset_index()
    
    print("Calculating L2 market depreciation rates per 10,000km...")
    metrics_l2 = full_df.groupby(l2_cols, dropna=False).apply(calc_metrics, include_groups=False).reset_index()
    
    print("Saving market metrics to database for real-time predictions...")
    try:
        metrics_l1.to_sql('market_metrics', db_engine, if_exists='replace', index=False)
    except Exception as e:
        print(f"Warning: could not save market_metrics ({e}). Continuing with in-memory metrics.")
    
    df = df.merge(metrics_l1, on=l1_cols, how='left')
    
    missing_l1 = df['med_price'].isna() | (df['count'] < 5)
    
    if missing_l1.any():
        df_missing = df[missing_l1].copy()
        df_missing = df_missing.drop(columns=['med_price', 'baseline_mileage', 'dep_per_10k', 'count'])
        df_missing = df_missing.merge(metrics_l2, on=l2_cols, how='left')
        
        df.loc[missing_l1, ['med_price', 'baseline_mileage', 'dep_per_10k', 'count']] = df_missing[['med_price', 'baseline_mileage', 'dep_per_10k', 'count']].values

        missing_l2 = df['med_price'].isna() | (df['count'] < 5)
        if missing_l2.any():
            print(f"Applying sliding window for {missing_l2.sum()} rare listings...")
            for (b, m, g), group_df in full_df.groupby(['brand', 'model', 'generation']):
                rare_subset = df[missing_l2 & (df['brand'] == b) & (df['model'] == m) & (df['generation'] == g)]
                if rare_subset.empty: continue
                
                for idx, row in rare_subset.iterrows():
                    window_cars = group_df[
                        (group_df['year'] >= row['year'] - 2) &
                        (group_df['year'] <= row['year'] + 2)
                    ]
                    if len(window_cars) > 0:
                        m_res = calc_metrics(window_cars)
                        df.loc[idx, ['med_price', 'baseline_mileage', 'dep_per_10k', 'count']] = [m_res['med_price'], m_res['baseline_mileage'], m_res['dep_per_10k'], m_res['count']]

    df['age'] = 2026 - df['year']
    df['age'] = df['age'].apply(lambda x: max(1, x))

    suspiciously_low_threshold = df['age'] * 6000
    spam_mileages = [0, 1, 10, 100, 1000, 10000, 1111, 11111, 111111, 12345, 123456, 9999, 99999, 999999]
    is_spam_mileage = df['mileage'].isin(spam_mileages)
    
    effective_mileage = df['mileage'].astype(float).copy()
    effective_mileage.loc[is_spam_mileage] = df['baseline_mileage']
    effective_mileage = np.maximum(effective_mileage, suspiciously_low_threshold)

    df['expected_price'] = df['med_price'] - ((effective_mileage - df['baseline_mileage']) / 10000) * df['dep_per_10k']
    df['expected_price'] = df['expected_price'].clip(lower=500)
    
    df['price_diff_pct'] = ((df['expected_price'] - df[price_col]) / df['expected_price']) * 100

    df['calc_score'] = 50.0
    
    def calculate_score_mod(pct):
        if pd.isna(pct):
            return 0.0
        if pct > 0:
            bonus = 0
            remaining = pct
            t1 = min(remaining, 10.0)
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
                t4 = min(remaining, 5.0)
                bonus += 0
                remaining -= t4
            if remaining > 0:
                bonus -= remaining * 2.0
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

    is_low_mileage = (df['mileage'] < suspiciously_low_threshold) | is_spam_mileage
    df.loc[is_low_mileage & (df['age'] <= 3), 'calc_score'] -= 15.0
    df.loc[is_low_mileage & (df['age'] > 3), 'calc_score'] -= 30.0

    scam_mask = (df['price_diff_pct'] > 20.0) & is_low_mileage
    df.loc[scam_mask, 'calc_score'] = np.minimum(df.loc[scam_mask, 'calc_score'], 20.0)

    is_taxi = (df['mileage'] / df['age']) > 45000
    df.loc[is_taxi, 'calc_score'] -= 20.0

    if 'state' in df.columns:
        damaged_mask = df['state'].str.lower().str.contains('damage|salvage|crash|wreck|defect|piese|acte', na=False)
        df.loc[damaged_mask, 'calc_score'] = np.minimum(df.loc[damaged_mask, 'calc_score'], 10.0)

    # TANDEM LOGIC REMOVED due to extreme processing time on 60k rows.
    # The Outlier filtering + Bucket Expansion already mathematically fixes the Deal Score.

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
    except Exception as e:
        raw_conn.rollback()
        print(f"Warning: could not write scores to {table_name} ({e}).")
        return
    finally:
        raw_conn.close()
        
    print(f"Algorithm applied successfully. Updated {len(updates)} listings.")

if __name__ == '__main__':
    evaluate_and_update_db()
