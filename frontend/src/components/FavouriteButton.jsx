import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFavourites } from "../context/FavouritesContext";
import { findFavourite, savedError } from "../utils/savedItems";
import "../pages/SavedItemsPage.css";

export default function FavouriteButton({ car }) {
  const { user } = useAuth();
  const favourites = useFavourites();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const selected = Boolean(findFavourite(favourites.items, car));

  async function toggle(event) {
    event.stopPropagation();
    if (!user) { setLogin(true); return; }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (favourites.error) await favourites.refresh();
      else await favourites.toggle(car);
    } catch (err) { setError(savedError(err)); }
    finally { setBusy(false); }
  }

  return <div className="favourite-action" onClick={(event) => event.stopPropagation()}>
    <button type="button" className={`favourite-star ${selected ? "is-saved" : ""}`} aria-pressed={selected}
      aria-label={selected ? "Elimină din favorite" : "Adaugă la favorite"}
      title={selected ? "Elimină din favorite" : "Adaugă la favorite"}
      disabled={busy || favourites.loading} onClick={toggle}>
      <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.34l-5.63 2.96 1.08-6.27L2.9 9.6l6.3-.9Z" /></svg>
    </button>
    {login && <Link to="/login">Autentifică-te pentru a salva</Link>}
    {(error || favourites.error) && <small role="alert">{error || savedError(favourites.error)}</small>}
  </div>;
}
