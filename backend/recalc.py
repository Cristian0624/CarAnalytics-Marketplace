from sqlalchemy import create_engine, text
import os

engine = create_engine(os.getenv("DATABASE_URL", "postgresql+psycopg2://localhost/defaultdb"))

with engine.connect() as conn:
    conn.execute(text('UPDATE listings_cleaned SET "Score" = 0'))
    conn.commit()

print("Reset all scores to 0. Now running eval.py...")
os.system("python eval.py")
