import psycopg

DB_NAME = ""
DB_USER = ""
DB_HOST = ""
DB_PORT = ""
DB_PASSWORD = ""

MDL_PER_EUR = 20.02
USD_PER_EUR = 1.16


def connect():
    return psycopg.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
        sslmode="require",
    )


def main():
    import time
    started_at = time.perf_counter()
    print("[CLEANER] Connecting to PostgreSQL...", flush=True)
    with connect() as conn:
        with conn.cursor() as cur:

            cur.execute("SELECT COUNT(*) FROM listings_temp")
            raw_count = cur.fetchone()[0]
            print(f"[CLEANER] RAW BEFORE: {raw_count:,} rows", flush=True)
            print("[CLEANER] Starting from scratch: recreating listings_cleaned_temp", flush=True)

            # Recreate the analytical table from raw listings_temp.
            # The original listings_temp table is never modified.
            cur.execute("DROP TABLE IF EXISTS listings_cleaned_temp")
            print("[CLEANER] Wiped previous listings_cleaned_temp", flush=True)

            cur.execute("""
                CREATE TABLE listings_cleaned_temp AS
                SELECT *
                FROM listings_temp
                WHERE FALSE
            """)

            cur.execute("""
                ALTER TABLE listings_cleaned_temp
                    ADD COLUMN IF NOT EXISTS original_price DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS original_currency TEXT,
                    ADD COLUMN IF NOT EXISTS price_eur DOUBLE PRECISION,
                    ADD COLUMN IF NOT EXISTS mileage_was_corrected BOOLEAN NOT NULL DEFAULT FALSE
            """)

            columns = """
                id, url, brand, model, price, currency, generation, year,
                mileage, engine, horsepower, fuel_type, gearbox, state,
                registration_country, drivetrain, body_type, doors, seats,
                scraped_at, offer_type, seller_type
            """

            # 1. Copy only Vând + Schimb, Moldova registrations.
            # 2. Convert every price to EUR immediately.
            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE: {before_count:,} rows", flush=True)

            cur.execute(f"""
                INSERT INTO listings_cleaned_temp
                ({columns}, original_price, original_currency, price_eur)
                SELECT
                    {columns},
                    price,
                    currency,
                    CASE
                        WHEN UPPER(TRIM(currency)) = 'EUR' THEN price
                        WHEN UPPER(TRIM(currency)) = 'MDL' THEN price / %s
                        WHEN UPPER(TRIM(currency)) = 'USD' THEN price / %s
                        ELSE NULL
                    END
                FROM listings_temp
                WHERE offer_type IN ('Vând', 'Schimb')
                  AND LOWER(TRIM(COALESCE(registration_country, '')))
                      = LOWER('Republica Moldova')
                  AND LOWER(TRIM(COALESCE(state, ''))) <> LOWER('Nou')
                  AND price IS NOT NULL
                  AND price >= 0
            """, (MDL_PER_EUR, USD_PER_EUR))
            after_count = cur.rowcount
            excluded_count = raw_count - after_count
            print(f"[CLEANER] EXCLUDED: {excluded_count:,} rows (initial filter: not Vând/Schimb, not Moldova-registered, state Nou, invalid/missing price)", flush=True)
            print(f"[CLEANER] AFTER:    {after_count:,} rows", flush=True)

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE: {before_count:,} rows", flush=True)
            # Analytical table uses EUR as its currency.
            cur.execute("""
                UPDATE listings_cleaned_temp
                SET currency = 'EUR'
            """)

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            after_count = cur.fetchone()[0]
            print(f"[CLEANER] AFTER:  {after_count:,} rows", flush=True)

            # Unknown/unconvertible currencies cannot be used for price analysis.
            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE:   {before_count:,} rows", flush=True)

            cur.execute("""
                DELETE FROM listings_cleaned_temp
                WHERE price_eur IS NULL
            """)
            excluded_count = cur.rowcount

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            after_count = cur.fetchone()[0]
            print(f"[CLEANER] EXCLUDED: {excluded_count:,} rows (unconvertible/unknown currency)", flush=True)
            print(f"[CLEANER] AFTER:    {after_count:,} rows", flush=True)

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE: {before_count:,} rows", flush=True)
            # Price rules agreed on.
            cur.execute("""
                DELETE FROM listings_cleaned_temp
                WHERE price_eur < 200
            """)
            excluded_low = cur.rowcount

            # > €300k is removed unless Ferrari.
            cur.execute("""
                DELETE FROM listings_cleaned_temp
                WHERE price_eur > 300000
                  AND LOWER(TRIM(COALESCE(brand, ''))) <> 'ferrari'
            """)
            excluded_high = cur.rowcount

            excluded_count = excluded_low + excluded_high

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            after_count = cur.fetchone()[0]
            print(f"[CLEANER] EXCLUDED: {excluded_count:,} rows (price < €200 OR price > €300,000 for non-Ferrari)", flush=True)
            print(f"[CLEANER] AFTER:    {after_count:,} rows", flush=True)

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE: {before_count:,} rows", flush=True)

            # Mileage rules.
            cur.execute("""
                DELETE FROM listings_cleaned_temp
                WHERE mileage IS NOT NULL
                  AND mileage < 0
            """)
            excluded_negative = cur.rowcount

            cur.execute("""
                DELETE FROM listings_cleaned_temp
                WHERE mileage IS NOT NULL
                  AND mileage < 70
            """)
            excluded_low = cur.rowcount

            # 70–700 km on vehicles from before 2020 is treated as
            # 70,000–700,000 km.
            cur.execute("""
                UPDATE listings_cleaned_temp
                SET mileage = mileage * 1000,
                    mileage_was_corrected = TRUE
                WHERE mileage BETWEEN 70 AND 700
                  AND year < 2020
            """)

            # 70–700 km on 2020+ vehicles stays unchanged.
            # >700,000 km is excluded.
            cur.execute("""
                DELETE FROM listings_cleaned_temp
                WHERE mileage > 700000
            """)
            excluded_high = cur.rowcount

            excluded_count = excluded_negative + excluded_low + excluded_high

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            after_count = cur.fetchone()[0]
            print(f"[CLEANER] EXCLUDED: {excluded_count:,} rows (negative mileage, mileage < 70, or mileage > 700,000)", flush=True)
            print(f"[CLEANER] AFTER:    {after_count:,} rows", flush=True)

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE: {before_count:,} rows", flush=True)

            # EV / plug-in hybrid gearbox rule.
            cur.execute("""
                UPDATE listings_cleaned_temp
                SET gearbox = 'Automată'
                WHERE LOWER(TRIM(COALESCE(fuel_type, ''))) IN
                      ('electricitate', 'plug-in hybrid', 'plug-in hibrid')
            """)

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            after_count = cur.fetchone()[0]
            print("[CLEANER] EXCLUDED: 0 rows (EV/PHEV gearbox normalization)", flush=True)
            print(f"[CLEANER] AFTER:    {after_count:,} rows", flush=True)

            # ============================================================
            # DUPLICATES
            # ============================================================
            # ONLY exact duplicates are removed.
            #
            # Two listings_temp are considered duplicates only when ALL of these
            # fields are identical (NULLs count as equal):
            # brand, model, generation, year, mileage, engine, horsepower,
            # fuel_type, gearbox, state, registration_country, drivetrain,
            # body_type, doors, seats, price_eur, offer_type, seller_type.
            #
            # If price or mileage differs, BOTH listings_temp are kept.
            # If any identity field differs, BOTH listings_temp are kept.
            # For an exact duplicate group, the lowest listing ID is kept.

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE: {before_count:,} rows", flush=True)

            cur.execute("""
                CREATE TEMP TABLE _exact_duplicate_ids AS
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                brand, model, generation, year, mileage,
                                engine, horsepower, fuel_type, gearbox, state,
                                registration_country, drivetrain, body_type,
                                doors, seats, price_eur, offer_type, seller_type
                            ORDER BY id
                        ) AS rn
                    FROM listings_cleaned_temp
                ) ranked
                WHERE rn > 1
            """)

            cur.execute("""
                SELECT COUNT(*)
                FROM _exact_duplicate_ids
            """)
            exact_duplicates = cur.fetchone()[0]

            cur.execute("""
                DELETE FROM listings_cleaned_temp a
                USING _exact_duplicate_ids d
                WHERE a.id = d.id
            """)

            cur.execute("DROP TABLE _exact_duplicate_ids")

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            after_count = cur.fetchone()[0]
            print(f"[CLEANER] EXCLUDED: {exact_duplicates:,} rows (exact duplicates: all 18 identity fields identical)", flush=True)
            print(f"[CLEANER] AFTER:    {after_count:,} rows", flush=True)

            print("[CLEANER] START: Create analytical indexes", flush=True)

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            before_count = cur.fetchone()[0]
            print(f"[CLEANER] BEFORE:   {before_count:,} rows", flush=True)

            # Useful indexes for later analytics.
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_listings_cleaned_temp_brand_model
                ON listings_cleaned_temp (brand, model)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_listings_cleaned_temp_price_eur
                ON listings_cleaned_temp (price_eur)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_listings_cleaned_temp_mileage
                ON listings_cleaned_temp (mileage)
            """)
            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            after_count = cur.fetchone()[0]
            print("[CLEANER] EXCLUDED: 0 rows (index creation removes nothing)", flush=True)
            print(f"[CLEANER] AFTER:    {after_count:,} rows", flush=True)

            cur.execute("SELECT COUNT(*) FROM listings_temp")
            raw_count = cur.fetchone()[0]

            cur.execute("SELECT COUNT(*) FROM listings_cleaned_temp")
            clean_count = cur.fetchone()[0]

            cur.execute("""
                SELECT COUNT(*)
                FROM listings_cleaned_temp
                WHERE mileage_was_corrected = TRUE
            """)
            corrected = cur.fetchone()[0]

            print("\n" + "=" * 55)
            print("CLEANING COMPLETE")
            print("=" * 55)
            print(f"Raw listings_temp:       {raw_count:,}")
            print(f"Cleaned listings_temp:    {clean_count:,}")
            print(f"Total rows excluded: {raw_count - clean_count:,}")
            print(f"Mileage corrected:   {corrected:,}")
            print("Created table:       listings_cleaned_temp")
            print("=" * 55)

        print("[CLEANER] Committing transaction...", flush=True)
        conn.commit()
        elapsed = time.perf_counter() - started_at
        print(f"[CLEANER] COMPLETE: total runtime {elapsed:.2f} seconds ({elapsed / 60:.2f} minutes)", flush=True)


if __name__ == "__main__":
    main()
