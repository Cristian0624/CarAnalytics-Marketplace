import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getAnalyses, deleteAnalysis, updateAnalysis } from "../api/analysis";
import { useAuth } from "../context/AuthContext";
import { savedPaths } from "../api/saved_items";
import "./SavedItemsPage.css";
import "./MyListingsPage.css";

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(Number(value)) + " €";
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("ro-RO", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function MyListingsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const data = await getAnalyses();
        if (!cancelled) {
          setListings(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Nu s-au putut încărca anunțurile tale.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleDelete(id) {
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      await deleteAnalysis(id);
      setListings((current) => current.filter((item) => item.id !== id));
      setDeletingId(null);
    } catch (err) {
      setError(err?.message || "Nu s-a putut șterge anunțul.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!editingItem || busy) return;

    setBusy(true);
    setError("");

    try {
      const payload = {
        price_eur: editingItem.price_eur ? Number(editingItem.price_eur) : null,
        mileage: editingItem.mileage ? Number(editingItem.mileage) : null,
        year: editingItem.year ? Number(editingItem.year) : null,
        horsepower: editingItem.horsepower ? Number(editingItem.horsepower) : null,
        fuel_type: editingItem.fuel_type || null,
        gearbox: editingItem.gearbox || null,
        body_type: editingItem.body_type || null,
        state: editingItem.state || null,
      };

      const updated = await updateAnalysis(editingItem.id, payload);
      setListings((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setEditingItem(null);
    } catch (err) {
      setError(err?.message || "Nu s-au putut salva modificările.");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <main className="saved-page">
        <div className="saved-container">
          <p role="status">Se încarcă...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="saved-page">
        <div className="saved-container">
          <header className="saved-heading">
            <span className="saved-eyebrow">CONTUL MEU</span>
            <h1>Anunțurile Mele</h1>
            <p>Autentifică-te pentru a-ți gestiona anunțurile create.</p>
          </header>
          <div className="saved-empty">
            <h2>Anunțurile tale, într-un singur loc</h2>
            <p>Autentifică-te pentru a le accesa.</p>
            <Link className="saved-primary" to="/login">
              Autentificare
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const triangles = [
    { id: 1, side: 'left', top: '5%', size: 120, color: '#d32f2f', delay: '-0s', rot: 15, offset: '-30px' },
    { id: 2, side: 'left', top: '25%', size: 80, color: '#ed6c02', delay: '-2s', rot: -45, offset: '10px' },
    { id: 3, side: 'left', top: '45%', size: 150, color: '#2e7d32', delay: '-4s', rot: 30, offset: '-40px' },
    { id: 4, side: 'left', top: '65%', size: 90, color: '#d32f2f', delay: '-1s', rot: 110, offset: '20px' },
    { id: 5, side: 'left', top: '85%', size: 110, color: '#ed6c02', delay: '-3s', rot: -20, offset: '-10px' },
    { id: 6, side: 'right', top: '10%', size: 100, color: '#2e7d32', delay: '-1.5s', rot: 60, offset: '15px' },
    { id: 7, side: 'right', top: '30%', size: 140, color: '#d32f2f', delay: '-3.5s', rot: -15, offset: '-25px' },
    { id: 8, side: 'right', top: '50%', size: 90, color: '#ed6c02', delay: '-0.5s', rot: 45, offset: '30px' },
    { id: 9, side: 'right', top: '75%', size: 130, color: '#2e7d32', delay: '-2.5s', rot: -80, offset: '-35px' },
    { id: 10, side: 'right', top: '90%', size: 80, color: '#d32f2f', delay: '-4.5s', rot: 25, offset: '5px' },
  ];

  return (
    <main className="saved-page">
      <div className="background-shapes" aria-hidden="true">
        {triangles.map(t => (
          <svg key={t.id} className="floating-shape" style={{
            width: t.size, height: t.size, color: t.color,
            top: t.top,
            [t.side]: t.offset,
            animationDelay: t.delay,
            '--rot': `${t.rot}deg`
          }} viewBox="-20 -20 140 140" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,0 100,100 0,100" fill="currentColor" stroke="currentColor" strokeWidth="30" strokeLinejoin="round"/>
          </svg>
        ))}
      </div>
      <div className="saved-container">
        <header className="saved-heading">
          <span className="saved-eyebrow">CONTUL MEU</span>
          <h1>Anunțurile Mele</h1>
          <p>Gestionează anunțurile create și publicate de tine în baza de date.</p>
        </header>

        <nav className="saved-tabs" aria-label="Elemente salvate">
          <Link to={savedPaths.favourites}>Anunțuri Favorite</Link>
          <Link to={savedPaths.risks}>Analize Risc Salvate</Link>
          <Link to={savedPaths.searches}>Filtre Salvate</Link>
          <Link to="/profile">Profilul Meu</Link>
          <Link to="/my-listings" aria-current="page">
            Anunțurile Mele
          </Link>
        </nav>

        {error && (
          <p className="saved-error" role="alert">
            {error}
          </p>
        )}

        <div className="my-listings-topbar">
          <span className="my-listings-count">
            {listings.length === 1
              ? "1 anunț publicat"
              : `${listings.length} anunțuri publicate`}
          </span>

          <Link to="/create-listing" className="my-listings-add-btn">
            + Adaugă un Anunț Nou
          </Link>
        </div>

        {loading ? (
          <p role="status">Se încarcă anunțurile tale...</p>
        ) : listings.length === 0 ? (
          <div className="saved-empty">
            <h2>Nu ai niciun anunț publicat încă</h2>
            <p>
              Creează primul tău anunț auto pentru a primi estimări de preț de piață
              și pentru a-l salva în contul tău.
            </p>
            <Link className="saved-primary" to="/create-listing">
              + Creează un anunț
            </Link>
          </div>
        ) : (
          <div className="saved-grid">
            {listings.map((item) => (
              <article className="saved-card my-listing-card" key={item.id}>
                <div>
                  <div className="saved-card-top">
                    <span className="my-listing-badge">Activ</span>
                    <time dateTime={item.created_at}>
                      {formatDate(item.created_at)}
                    </time>
                  </div>

                  <div className="my-listing-header">
                    <h2>
                      {item.brand} {item.model}{" "}
                      {item.generation ? `· ${item.generation}` : ""}
                    </h2>
                  </div>

                  <div className="my-listing-price">
                    {formatPrice(item.price_eur)}
                  </div>

                  <div className="my-listing-specs-grid">
                    {item.year && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">An</span>
                        <span className="my-listing-spec-val">{item.year}</span>
                      </div>
                    )}
                    {item.mileage !== null && item.mileage !== undefined && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">Rulaj</span>
                        <span className="my-listing-spec-val">
                          {Number(item.mileage).toLocaleString("ro-RO")} km
                        </span>
                      </div>
                    )}
                    {item.fuel_type && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">Combustibil</span>
                        <span className="my-listing-spec-val">
                          {item.fuel_type}
                        </span>
                      </div>
                    )}
                    {item.gearbox && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">Cutie</span>
                        <span className="my-listing-spec-val">{item.gearbox}</span>
                      </div>
                    )}
                    {item.engine && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">Motor</span>
                        <span className="my-listing-spec-val">
                          {item.engine} L
                        </span>
                      </div>
                    )}
                    {item.horsepower && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">Putere</span>
                        <span className="my-listing-spec-val">
                          {item.horsepower} CP
                        </span>
                      </div>
                    )}
                    {item.body_type && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">Caroserie</span>
                        <span className="my-listing-spec-val">
                          {item.body_type}
                        </span>
                      </div>
                    )}
                    {item.drivetrain && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">Tracțiune</span>
                        <span className="my-listing-spec-val">
                          {item.drivetrain}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="my-listing-extra-chips">
                    {item.state && (
                      <span className="my-listing-chip">Stare: {item.state}</span>
                    )}
                    {item.doors && (
                      <span className="my-listing-chip">{item.doors} uși</span>
                    )}
                    {item.seats && (
                      <span className="my-listing-chip">{item.seats} locuri</span>
                    )}
                    {item.seller_type && (
                      <span className="my-listing-chip">
                        Vânzător: {item.seller_type}
                      </span>
                    )}
                    {item.registration_country && (
                      <span className="my-listing-chip">
                        Înmatriculare: {item.registration_country}
                      </span>
                    )}
                    {(item.class_ || item.class) && (
                      <span className="my-listing-chip">
                        Clasă: {item.class_ || item.class}
                      </span>
                    )}
                    {item.score && (
                      <span className="my-listing-chip">
                        Scor: {Number(item.score).toFixed(1)} / 100
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="saved-actions">
                    <button
                      type="button"
                      className="saved-secondary"
                      onClick={() => setEditingItem({ ...item })}
                    >
                      Editează
                    </button>
                    <button
                      type="button"
                      className="saved-secondary"
                      onClick={() =>
                        navigate("/anomaly-risk", {
                          state: {
                            prefill: {
                              brand: item.brand,
                              model: item.model,
                              generation: item.generation,
                              year: item.year,
                              mileage: item.mileage,
                              price: item.price_eur,
                              fuel_type: item.fuel_type,
                              gearbox: item.gearbox,
                              drivetrain: item.drivetrain,
                              body_type: item.body_type,
                              engine: item.engine,
                            },
                          },
                        })
                      }
                    >
                      Analiză Risc
                    </button>
                    <button
                      type="button"
                      className="saved-delete"
                      onClick={() => setDeletingId(item.id)}
                    >
                      Șterge
                    </button>
                  </div>

                  {deletingId === item.id && (
                    <div className="saved-confirm">
                      <p>Sigur dorești să ștergi acest anunț?</p>
                      <div className="saved-actions">
                        <button
                          type="button"
                          className="saved-delete"
                          disabled={busy}
                          onClick={() => handleDelete(item.id)}
                        >
                          {busy ? "Se șterge…" : "Da, șterge"}
                        </button>
                        <button
                          type="button"
                          className="saved-secondary"
                          disabled={busy}
                          onClick={() => setDeletingId(null)}
                        >
                          Anulează
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {editingItem && (
          <div className="my-listing-edit-modal">
            <div className="my-listing-edit-dialog">
              <h2>
                Editează anunțul: {editingItem.brand} {editingItem.model}
              </h2>
              <p>Actualizează detaliile vehiculului tău.</p>

              <form onSubmit={handleSaveEdit}>
                <div className="my-listing-edit-grid">
                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-price">Preț (€)</label>
                    <input
                      id="edit-price"
                      type="number"
                      min="0"
                      value={editingItem.price_eur ?? ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          price_eur: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-mileage">Kilometraj (km)</label>
                    <input
                      id="edit-mileage"
                      type="number"
                      min="0"
                      value={editingItem.mileage ?? ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          mileage: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-year">An fabricație</label>
                    <input
                      id="edit-year"
                      type="number"
                      min="1886"
                      value={editingItem.year ?? ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          year: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-hp">Putere (CP)</label>
                    <input
                      id="edit-hp"
                      type="number"
                      min="0"
                      value={editingItem.horsepower ?? ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          horsepower: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-fuel">Combustibil</label>
                    <input
                      id="edit-fuel"
                      type="text"
                      value={editingItem.fuel_type ?? ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          fuel_type: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-gearbox">Cutie de viteze</label>
                    <input
                      id="edit-gearbox"
                      type="text"
                      value={editingItem.gearbox ?? ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          gearbox: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-body">Caroserie</label>
                    <input
                      id="edit-body"
                      type="text"
                      value={editingItem.body_type ?? ""}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          body_type: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-state">Stare</label>
                    <select
                      id="edit-state"
                      value={editingItem.state ?? "Used"}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          state: e.target.value,
                        })
                      }
                    >
                      <option value="Used">Second-Hand (Used)</option>
                      <option value="New">Nou</option>
                    </select>
                  </div>
                </div>

                <div className="saved-actions">
                  <button
                    type="submit"
                    className="saved-primary"
                    disabled={busy}
                  >
                    {busy ? "Se salvează…" : "Salvează modificările"}
                  </button>
                  <button
                    type="button"
                    className="saved-secondary"
                    disabled={busy}
                    onClick={() => setEditingItem(null)}
                  >
                    Anulează
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
