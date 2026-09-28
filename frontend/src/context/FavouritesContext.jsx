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

  async function remove(id) {
    await deleteSaved("favourites", id);
    setItems((current) => current.filter((item) => item.id !== id));
    setRevision((value) => value + 1);
  }

  async function toggle(car) {
    const key = car.url || String(car.id);
    if (locks.current.has(key)) return;
    locks.current.add(key);
    try {
      const existing = findFavourite(items, car);
      if (existing) await remove(existing.id);
      else {
        try {
          const item = await createSaved("favourites", { listing_id: car.id });
          setItems((current) => [...current, item]);
          setRevision((value) => value + 1);
        } catch (err) {
          if (err.status !== 409) throw err;
          await refresh();
        }
      }
    } finally { locks.current.delete(key); }
  }

  return <FavouritesContext.Provider value={{ items, loading, error, revision, refresh, toggle, remove }}>{children}</FavouritesContext.Provider>;
}

export const useFavourites = () => useContext(FavouritesContext);
