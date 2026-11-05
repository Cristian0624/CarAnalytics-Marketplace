import sys, os, time
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))
from backend.database import SessionLocal
from backend.repositories.listings import ListingsRepository

start = time.time()
db = SessionLocal()
repo = ListingsRepository(db)
res = repo.get_options()
db.close()
dur = time.time() - start
print(f"get_options took {dur:.3f}s. Brands count: {len(res.get('brand', []))}")
