import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { allFavourites, createSaved, deleteSaved } from "../api/saved_items";
import { findFavourite } from "../utils/savedItems";
import { useAuth } from "./AuthContext";

const FavouritesContext = createContext(null);

export function FavouritesProvider({ children }) {
  const { user } = useAuth();
  return <UserFavourites key={user?.id ?? "guest"} user={user}>{children}</UserFavourites>;
}

function UserFavourites({ user, children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState(null);
  const [revision, setRevision] = useState(0);
  const locks = useRef(new Set());
  const refresh = useCallback(async (signal) => {
    if (!user) return;
    setLoading(true);
    try {
      const records = await allFavourites(signal);
      if (!signal?.aborted) { setItems(records); setError(null); }
    } catch (err) { if (!signal?.aborted) setError(err); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [user]);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const desiredRef = useRef(new Map());

  async function remove(id) {
    const previous = itemsRef.current.find((item) => item.id === id);
    const next = itemsRef.current.filter((item) => item.id !== id);
    itemsRef.current = next;
    setItems(next);
    try {
      await deleteSaved("favourites", id);
      setRevision((value) => value + 1);
    } catch (err) {
      if (previous) {
        setItems((current) => {
          const restored = current.some((item) => item.id === id) ? current : [...current, previous];
          itemsRef.current = restored;
          return restored;
        });
      }
      throw err;
    }
  }

  async function toggle(car) {
    const key = car.url || String(car.id);
    const existingNow = findFavourite(itemsRef.current, car);
    const wantSaved = !existingNow;
    desiredRef.current.set(key, wantSaved);

    // 1. Instant optimistic UI flip (never blocked by in-flight requests)
    if (wantSaved) {
      const tempId = `optimistic-${car.id}-${Date.now()}`;
      const optimisticItem = {
        id: tempId,
        listing_id: car.id,
        listing_url: car.url ?? null,
        snapshot: car,
        available: true,
        _optimistic: true,
      };
      const next = [...itemsRef.current, optimisticItem];
      itemsRef.current = next;
      setItems(next);
    } else {
      const next = itemsRef.current.filter((item) => item !== existingNow && item.id !== existingNow.id);
      itemsRef.current = next;
      setItems(next);
    }

    // 2. If a sync loop is already running for this car, it will pick up our updated desiredRef
    if (locks.current.has(key)) return;
    locks.current.add(key);

    // Track server-persisted record across rapid taps
    let serverRecord = existingNow && !existingNow._optimistic ? existingNow : null;

    try {
      while (desiredRef.current.has(key)) {
        const target = desiredRef.current.get(key);
        desiredRef.current.delete(key);

        if (target && !serverRecord) {
          try {
            const created = await createSaved("favourites", { listing_id: car.id });
            serverRecord = created;
            // If user still wants it saved, swap optimistic entry for real server item
            if (desiredRef.current.get(key) !== false) {
              setItems((current) => {
                const hasOpt = current.some(
                  (entry) => entry._optimistic && (entry.listing_id === car.id || (car.url && entry.listing_url === car.url)),
                );
                const updated = hasOpt
                  ? current.map((entry) =>
                      entry._optimistic && (entry.listing_id === car.id || (car.url && entry.listing_url === car.url))
                        ? created
                        : entry,
                    )
                  : current.some((entry) => entry.id === created.id)
                    ? current
                    : [...current, created];
                itemsRef.current = updated;
                return updated;
              });
            }
            setRevision((value) => value + 1);
          } catch (err) {
            if (err.status === 409) {
              await refresh();
              serverRecord = findFavourite(itemsRef.current, car) || null;
            } else {
              // Roll back optimistic add on failure
              setItems((current) => {
                const cleaned = current.filter(
                  (entry) => !(entry._optimistic && (entry.listing_id === car.id || (car.url && entry.listing_url === car.url))),
                );
                itemsRef.current = cleaned;
                return cleaned;
              });
              throw err;
            }
          }
        } else if (!target && serverRecord) {
          const toDelete = serverRecord;
          try {
            await deleteSaved("favourites", toDelete.id);
            serverRecord = null;
            setRevision((value) => value + 1);
          } catch (err) {
            if (err.status === 404) {
              serverRecord = null;
            } else {
              // Roll back optimistic remove on failure
              setItems((current) => {
                const restored = current.some((entry) => entry.id === toDelete.id)
                  ? current
                  : [...current, toDelete];
                itemsRef.current = restored;
                return restored;
              });
              throw err;
            }
          }
        }
      }
    } finally {
      locks.current.delete(key);
    }
  }

  return <FavouritesContext.Provider value={{ items, loading, error, revision, refresh, toggle, remove }}>{children}</FavouritesContext.Provider>;
}

export const useFavourites = () => useContext(FavouritesContext);
