import psycopg
from psycopg import sql

DB_NAME = ""
DB_USER = ""
DB_HOST = ""
DB_PORT = ""
DB_PASSWORD = ""


def get_columns(cur, table_name):
    cur.execute("""
        SELECT
            attribute.attname,
            pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
        FROM pg_catalog.pg_attribute AS attribute
        JOIN pg_catalog.pg_class AS relation
          ON relation.oid = attribute.attrelid
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND relation.relname = %s
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
        ORDER BY attribute.attnum
    """, (table_name,))
    return cur.fetchall()


def align_columns(cur, target_table, source_table, drop_extra_columns=False):
    """Make target contain the source columns and use their PostgreSQL types."""
    cur.execute(
        sql.SQL("CREATE TABLE IF NOT EXISTS {} (LIKE {} INCLUDING ALL)").format(
            sql.Identifier(target_table),
            sql.Identifier(source_table),
        )
    )

    source_columns = dict(get_columns(cur, source_table))
    target_columns = dict(get_columns(cur, target_table))

    for name, column_type in source_columns.items():
        if name not in target_columns:
            cur.execute(
                sql.SQL("ALTER TABLE {} ADD COLUMN {} {}").format(
                    sql.Identifier(target_table),
                    sql.Identifier(name),
                    sql.SQL(column_type),
                )
            )
        elif target_columns[name] != column_type:
            cur.execute(
                sql.SQL("ALTER TABLE {} ALTER COLUMN {} TYPE {} USING {}::{}").format(
                    sql.Identifier(target_table),
                    sql.Identifier(name),
                    sql.SQL(column_type),
                    sql.Identifier(name),
                    sql.SQL(column_type),
                )
            )

    if drop_extra_columns:
        for name in target_columns:
            if name not in source_columns:
                cur.execute(
                    sql.SQL("ALTER TABLE {} DROP COLUMN {}").format(
                        sql.Identifier(target_table),
                        sql.Identifier(name),
                    )
                )

    return list(source_columns)


def ensure_table_exists(cur, target_table, source_table):
    cur.execute(
        sql.SQL("CREATE TABLE IF NOT EXISTS {} (LIKE {} INCLUDING ALL)").format(
            sql.Identifier(target_table),
            sql.Identifier(source_table),
        )
    )


def main():
    conn = psycopg.connect(
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=DB_PORT,
        sslmode="require",
    )

    with conn.cursor() as cur:

        # 1. Create the field if it doesn't exist
        cur.execute("""
            ALTER TABLE listings_cleaned_temp
            ADD COLUMN IF NOT EXISTS class TEXT;
        """)

        # 2. Clear previous values so this is a clean rebuild
        cur.execute("""
            UPDATE listings_cleaned_temp
            SET class = NULL;
        """)

        # 3. Match brand + model and copy market_segment
        cur.execute("""
            UPDATE listings_cleaned_temp AS l
            SET class = mc.market_segment
            FROM model_class AS mc
            WHERE LOWER(TRIM(l.brand)) = LOWER(TRIM(mc.brand))
              AND LOWER(TRIM(l.model)) = LOWER(TRIM(mc.model))
              AND mc.market_segment IS NOT NULL;
        """)

        updated = cur.rowcount

        # 4. Statistics
        cur.execute("""
            SELECT COUNT(*)
            FROM listings_cleaned_temp
            WHERE class IS NOT NULL;
        """)
        classified = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM listings_cleaned_temp
            WHERE class IS NULL;
        """)
        unresolved = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*)
            FROM listings_cleaned_temp;
        """)
        total = cur.fetchone()[0]

        # Keep every finished cleaned round.  This table is append-only.
        cleaned_columns = align_columns(
            cur,
            "listings_cleaned_alltime",
            "listings_cleaned_temp",
        )
        cur.execute("""
            ALTER TABLE listings_cleaned_alltime
            ADD COLUMN IF NOT EXISTS snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        """)
        cleaned_identifiers = sql.SQL(", ").join(
            sql.Identifier(column) for column in cleaned_columns
        )
        cur.execute(
            sql.SQL("INSERT INTO {} ({}, {}) SELECT {}, NOW() FROM {}").format(
                sql.Identifier("listings_cleaned_alltime"),
                cleaned_identifiers,
                sql.Identifier("snapshot_at"),
                cleaned_identifiers,
                sql.Identifier("listings_cleaned_temp"),
            )
        )

        # Publish the finished staging round only after cleaning and
        # classification both succeeded.
        ensure_table_exists(cur, "listings_cleaned", "listings_cleaned_temp")
        cur.execute("TRUNCATE TABLE listings_cleaned")
        cleaned_columns = align_columns(
            cur,
            "listings_cleaned",
            "listings_cleaned_temp",
            drop_extra_columns=True,
        )
        cleaned_identifiers = sql.SQL(", ").join(
            sql.Identifier(column) for column in cleaned_columns
        )
        cur.execute(
            sql.SQL("INSERT INTO {} ({}) SELECT {} FROM {}").format(
                sql.Identifier("listings_cleaned"),
                cleaned_identifiers,
                cleaned_identifiers,
                sql.Identifier("listings_cleaned_temp"),
            )
        )

        ensure_table_exists(cur, "listings", "listings_temp")
        cur.execute("TRUNCATE TABLE listings")
        raw_columns = align_columns(
            cur,
            "listings",
            "listings_temp",
            drop_extra_columns=True,
        )
        raw_identifiers = sql.SQL(", ").join(
            sql.Identifier(column) for column in raw_columns
        )
        cur.execute(
            sql.SQL("INSERT INTO {} ({}) SELECT {} FROM {}").format(
                sql.Identifier("listings"),
                raw_identifiers,
                raw_identifiers,
                sql.Identifier("listings_temp"),
            )
        )

        # Recreate the analytical indexes that existed on the local database.
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_brand_model ON listings_cleaned (brand, model)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_price_eur ON listings_cleaned (price_eur)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_mileage ON listings_cleaned (mileage)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_alltime_brand_model ON listings_cleaned_alltime (brand, model)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_alltime_price_eur ON listings_cleaned_alltime (price_eur)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_alltime_mileage ON listings_cleaned_alltime (mileage)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_listings_cleaned_alltime_snapshot_at ON listings_cleaned_alltime (snapshot_at)")

    conn.commit()
    conn.close()

    print("\nDONE")
    print("-" * 40)
    print(f"Total listings:       {total:,}")
    print(f"Classified listings:  {classified:,}")
    print(f"Unclassified:         {unresolved:,}")
    print(f"Rows updated:         {updated:,}")
    print("-" * 40)


if __name__ == "__main__":
    main()
