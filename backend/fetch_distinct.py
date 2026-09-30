import pandas as pd
from sqlalchemy import create_engine
import json

db_url = "postgresql+psycopg2://avnadmin:***_PASSWORD_REMOVED_***@postgres-service-cars-scraper-full.d.aivencloud.com:19488/defaultdb?sslmode=require"
engine = create_engine(db_url)

cols = ['fuel_type', 'gearbox', 'body_type', 'state', 'drivetrain', 'seller_type', 'registration_country', 'class']
res = {}

with engine.connect() as conn:
    for col in cols:
        try:
            df = pd.read_sql(f"SELECT DISTINCT \"{col}\" FROM listings_cleaned WHERE \"{col}\" IS NOT NULL", conn.connection)
            res[col] = df[col].tolist()
        except Exception as e:
            pass

with open('distinct_vals.json', 'w', encoding='utf-8') as f:
    json.dump(res, f, ensure_ascii=False, indent=2)
