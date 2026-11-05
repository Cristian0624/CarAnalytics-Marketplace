import pandas as pd
import numpy as np
import psycopg2.extras
from database import engine as db_engine

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
    df['annual_km'] = df['mileage'] / df['age']

    full_df['age'] = 2026 - full_df['year']
    full_df['age'] = full_df['age'].apply(lambda x: max(1, x))
    full_df['annual_km'] = full_df['mileage'] / full_df['age']

    spam_mileages = [0, 1, 10, 100, 1000, 10000, 1111, 11111, 111111, 12345, 123456, 9999, 99999, 999999]
    valid_km = ~full_df['mileage'].isin(spam_mileages) & (full_df['mileage'] > 1000)

    # Hierarchical median km/year calculation
    print("Calculating hierarchical median km/year...")
    # KM Level 1: same model, year, fuel
    km_l1_cols = ['brand', 'model', 'generation', 'year', 'fuel_type']
    km_l1 = full_df[valid_km].groupby(km_l1_cols)['annual_km'].agg(['median', 'count']).reset_index()
    km_l1.columns = ['brand', 'model', 'generation', 'year', 'fuel_type', 'med_annual_km', 'km_l1_count']

    # KM Level 2: remove fuel
    km_l2_cols = ['brand', 'model', 'generation', 'year']
    km_l2 = full_df[valid_km].groupby(km_l2_cols)['annual_km'].agg(['median', 'count']).reset_index()
    km_l2.columns = ['brand', 'model', 'generation', 'year', 'med_annual_km_l2', 'km_l2_count']

    df = df.merge(km_l1, on=km_l1_cols, how='left')

    missing_km_l1 = df['med_annual_km'].isna() | (df['km_l1_count'] < 5)
    if missing_km_l1.any():
        df_km_m = df[missing_km_l1][km_l2_cols].merge(km_l2, on=km_l2_cols, how='left')
        df.loc[missing_km_l1, 'med_annual_km'] = df_km_m['med_annual_km_l2'].values
        df.loc[missing_km_l1, 'km_l1_count'] = df_km_m['km_l2_count'].values

    # KM Level 3: sliding window (+-2 years) on brand, model, generation
    missing_km_l2 = df['med_annual_km'].isna() | (df['km_l1_count'] < 5)
    if missing_km_l2.any():
        for (b, m, g), group_df in full_df[valid_km].groupby(['brand', 'model', 'generation']):
            rare_mask = missing_km_l2 & (df['brand'] == b) & (df['model'] == m) & (df['generation'] == g)
            if not rare_mask.any():
                continue
            for idx in df[rare_mask].index:
                y = df.loc[idx, 'year']
                w = group_df[(group_df['year'] >= y - 2) & (group_df['year'] <= y + 2)]
                if len(w) >= 3:
                    df.loc[idx, 'med_annual_km'] = w['annual_km'].median()

    # Default fallback
    is_diesel = df['fuel_type'].astype(str).str.lower().str.contains('diesel', na=False)
    default_km = np.where(is_diesel, 22000.0, 16000.0)
    df['med_annual_km'] = df['med_annual_km'].fillna(pd.Series(default_km, index=df.index))

    suspiciously_low_threshold = df['age'] * 6000
    is_spam_mileage = df['mileage'].isin(spam_mileages)
    
    effective_mileage = df['mileage'].astype(float).copy()
    effective_mileage.loc[is_spam_mileage] = df['baseline_mileage']
    effective_mileage = np.maximum(effective_mileage, suspiciously_low_threshold)

    # Cap mileage bonus: low mileage cannot inflate expected price beyond 12% above median price
    raw_adjustment = ((df['baseline_mileage'] - effective_mileage) / 10000) * df['dep_per_10k']
    max_bonus = df['med_price'] * 0.12
    mileage_adjustment = np.where(raw_adjustment > 0, np.minimum(raw_adjustment, max_bonus), raw_adjustment)

    df['expected_price'] = df['med_price'] + mileage_adjustment
    df['expected_price'] = df['expected_price'].clip(lower=500)
    
    df['price_diff_pct'] = ((df['expected_price'] - df[price_col]) / df['expected_price']) * 100

    df['calc_score'] = 50.0
    
    def calculate_score_mod(pct):
        if pd.isna(pct):
            return 0.0
        if pct > 0:
            bonus = 0.0
            remaining = pct
            # 0% - 10%: +1.7 per 1%
            t1 = min(remaining, 10.0)
            bonus += t1 * 1.7
            remaining -= t1
            # 10% - 15%: +1.4 per 1%
            if remaining > 0:
                t2 = min(remaining, 5.0)
                bonus += t2 * 1.4
                remaining -= t2
            # 15% - 20%: Plateau zone (+0)
            if remaining > 0:
                t3 = min(remaining, 5.0)
                bonus += 0.0
                remaining -= t3
            # 20% - 25%: -1.5 per 1%
            if remaining > 0:
                t4 = min(remaining, 5.0)
                bonus -= t4 * 1.5
                remaining -= t4
            # 25% - 30%: -1.7 per 1%
            if remaining > 0:
                t5 = min(remaining, 5.0)
                bonus -= t5 * 1.7
                remaining -= t5
            # > 30%: -2.0 per 1%
            if remaining > 0:
                bonus -= remaining * 2.0
            return bonus
        else:
            penalty = 0.0
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

    # Penalize cars that deviate too much from median annual mileage
    km_ratio = df['annual_km'] / df['med_annual_km']

    # Suspicious low mileage rollback risk:
    is_suspicious_low_km = (df['age'] >= 4) & (km_ratio < 0.40) & ~is_spam_mileage
    df.loc[is_suspicious_low_km, 'calc_score'] -= 15.0

    is_extreme_low_km = (df['age'] >= 3) & (km_ratio < 0.25) & ~is_spam_mileage
    df.loc[is_extreme_low_km, 'calc_score'] -= 15.0

    is_low_mileage = (df['mileage'] < suspiciously_low_threshold) | is_spam_mileage
    df.loc[is_low_mileage & (df['age'] <= 3), 'calc_score'] -= 15.0
    df.loc[is_low_mileage & (df['age'] > 3), 'calc_score'] -= 30.0

    scam_mask = (df['price_diff_pct'] > 20.0) & is_low_mileage
    df.loc[scam_mask, 'calc_score'] = np.minimum(df.loc[scam_mask, 'calc_score'], 20.0)

    # Excessive mileage (taxi / courier abuse)
    is_taxi = (km_ratio > 2.2) | (df['annual_km'] > 45000)
    df.loc[is_taxi, 'calc_score'] -= 20.0

    # Keyword penalties
    title_s = df['title'].fillna('').astype(str) if 'title' in df.columns else pd.Series('', index=df.index)
    desc_ro = df['description_ro'].fillna('').astype(str) if 'description_ro' in df.columns else pd.Series('', index=df.index)
    desc_ru = df['description_ru'].fillna('').astype(str) if 'description_ru' in df.columns else pd.Series('', index=df.index)
    combined_text = (title_s + ' ' + desc_ro + ' ' + desc_ru).str.lower()

    # Strip positive affirmations to avoid false positives (e.g. "fara defecte", "не требует вложений")
    clean_text = combined_text.str.replace(
        r'(?:f[aă]r[aă]|nu\s+necesit[aă]|f[aă]r[aă]\s+nici\s*o?)\s+(?:investi[tț]ii[^\s]*|probleme|defecte|accidente|repara[tț]ii)',
        ' ', regex=True
    ).str.replace(
        r'(?:не\s+требует|без)\s+(?:вложений|проблем|нареканий|дтп|замечаний)',
        ' ', regex=True
    )

    urgency_pattern = (
        r'\bсрочн[оа-я]*\b'
        r'|нужны деньги'
        r'|в связи с отъездом'
        r'|ниже рынка'
        r'|\burgent\b'
        r'|\burgen[tț][aă]\b'
        r'|pre[tț]\s+redus'
        r'|plec\s+din\s+[tț]ar[aă]'
        r'|am\s+nevoie\s+de\s+bani'
        r'|sub\s+pia[tț][aă]'
    )

    defect_pattern = (
        r'требует[ся\s]*вложени[йя]'
        r'|требуются вложения'
        r'|не на ходу'
        r'|после дтп'
        r'|на запчасти'
        r'|без документов'
        r'|аварийный'
        r'|аварийное состояние'
        r'|проблем[аы] с (?:мотор|двигател|коробк|акпп|кпп|ходовой|кузов)'
        r'|necesit[aă]\s+investi[tț]ii'
        r'|investi[tț]ii\s+necesare'
        r'|nu porne[sș]te'
        r'|nu merge'
        r'|lovit[aă]?'
        r'|avariat[aă]?'
        r'|pentru piese'
        r'|f[aă]r[aă]\s+acte'
        r'|probleme\s+la\s+(?:motor|cutie|cutia)'
    )

    urgency_matches = clean_text.str.contains(urgency_pattern, regex=True, na=False)
    defect_matches = clean_text.str.contains(defect_pattern, regex=True, na=False)

    print(f"Flagged {urgency_matches.sum()} listings with urgency/distress keywords.")
    print(f"Flagged {defect_matches.sum()} listings with defect/damage keywords.")

    df.loc[urgency_matches, 'calc_score'] -= 15.0
    df.loc[defect_matches, 'calc_score'] -= 25.0
    df.loc[defect_matches, 'calc_score'] = np.minimum(df.loc[defect_matches, 'calc_score'], 30.0)

    if 'state' in df.columns:
        damaged_mask = df['state'].astype(str).str.lower().str.contains('damage|salvage|crash|wreck|defect|piese|acte', na=False)
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
