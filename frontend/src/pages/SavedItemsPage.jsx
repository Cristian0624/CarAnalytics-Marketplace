import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteSaved, getSaved, listSaved, reanalyseSaved, savedPaths, updateSaved } from "../api/saved_items";
import { useAuth } from "../context/AuthContext";
import { useFavourites } from "../context/FavouritesContext";
import { describeFilters, listingFiltersToApi, listingFiltersToForm } from "../utils/listingFilters";
import { savedDate, savedError } from "../utils/savedItems";
import AnomalyRiskResults from "../components/AnomalyRiskResults";
import CarCard from "../components/CarCard";
import ListingFilters from "../components/ListingFilters";
import "./AnomalyRiskPage.css";
import "./SavedItemsPage.css";

const titles = { favourites: "Anunturi Favorite", risks: "Analize Risc Salvate", searches: "Filtre Salvate" };
const descriptions = {
  favourites: "Ofertele pe care vrei să le păstrezi la îndemână.",
  risks: "Revino la analizele tale și la rezultatele din momentul salvării.",
  searches: "Criteriile tale de căutare, gata de folosit pe piața actuală.",
};

export default function SavedItemsPage({ kind }) {
  const { user, loading } = useAuth();
  const { id } = useParams();
  return <main className="saved-page"><div className="saved-container">
    <header className="saved-heading"><span className="saved-eyebrow">CONTUL MEU</span><h1>{titles[kind]}</h1><p>{descriptions[kind]}</p></header>
    <nav className="saved-tabs" aria-label="Elemente salvate">{Object.entries(titles).map(([key, label]) =>
      <Link key={key} to={savedPaths[key]} aria-current={key === kind ? "page" : undefined}>{label}</Link>)}</nav>
    {loading ? <p role="status">Se încarcă...</p> : !user
      ? <div className="saved-empty"><h2>Salvările tale, într-un singur loc</h2><p>Autentifică-te pentru a le accesa.</p><Link className="saved-primary" to="/login">Autentificare</Link></div>
      : id ? <SavedDetail key={`${kind}/${id}/${user.id}`} kind={kind} id={id} />
        : <SavedCollection key={`${kind}/${user.id}`} kind={kind} />}
  </div></main>;
}

function ItemSummary({ kind, item }) {
  if (kind === "searches") return <ul className="saved-filter-tags">{describeFilters(item.filters).map((text) => <li key={text}>{text}</li>)}</ul>;
  const car = kind === "risks" ? item.input : item.snapshot;
  return <><p>{[car.brand, car.model, car.generation, car.year].filter(Boolean).join(" · ")}</p>
    {kind === "favourites" && <strong className="saved-price">{car.price_eur == null ? "Preț nespecificat" : `${Number(car.price_eur).toLocaleString("ro-RO")} €`}</strong>}
    {kind === "risks" && <span className="saved-score">{item.result.anomaly_score == null ? "Date insuficiente pentru scor" : `Scor anomalie: ${Number(item.result.anomaly_score).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} / 100`}</span>}
  </>;
}

function itemTitle(kind, item) {
  return kind === "favourites" ? [item.snapshot.brand, item.snapshot.model].filter(Boolean).join(" ") : item.name;
}

function SavedCollection({ kind }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const favourites = useFavourites();
  const navigate = useNavigate();
  const favouriteRevision = kind === "favourites" ? favourites.revision : 0;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listSaved(kind, page, controller.signal).then((response) => {
      if (!controller.signal.aborted) {
        if (response.pages > 0 && page > response.pages) setPage(response.pages);
        else { setData(response); if (!response.items.length && page > 1) setPage(1); }
      }
    }).catch((err) => { if (!controller.signal.aborted) setError(savedError(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [kind, page, revision, favouriteRevision]);

  async function remove(item) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "favourites") await favourites.remove(item.id);
      else await deleteSaved(kind, item.id);
      setDeleting(null);
      setRevision((value) => value + 1);
    } catch (err) { setError(savedError(err)); }
    finally { setBusy(false); }
  }

  if (editing) return <SavedEditor kind={kind} item={editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); setRevision((value) => value + 1); }} />;
  return <>
    {error && <p className="saved-error" role="alert">{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Încearcă din nou</button></p>}
    {loading ? <p role="status">Se încarcă salvările...</p> : data?.items.length ? <>
      <div className="saved-grid">{data.items.map((item) => <article className="saved-card" key={item.id}>
        <div className="saved-card-top"><span className="saved-eyebrow">{kind === "favourites" ? "★ FAVORIT" : kind === "risks" ? "ANALIZĂ" : "CĂUTARE"}</span><time dateTime={item.created_at}>{savedDate(item.created_at)}</time></div>
        <h2><Link to={`${savedPaths[kind]}/${item.id}`}>{itemTitle(kind, item)}</Link></h2>
        <ItemSummary kind={kind} item={item} />
        <div className="saved-actions"><Link className="saved-primary" to={`${savedPaths[kind]}/${item.id}`}>Deschide</Link>
          {kind === "searches" && <button className="saved-secondary" onClick={() => navigate("/listings", { state: { savedFilters: item.filters } })}>Vezi anunțurile</button>}
          <button className="saved-secondary" onClick={() => setEditing(item)}>{kind === "risks" ? "Redenumește" : "Editează"}</button>
          <button className="saved-delete" onClick={() => setDeleting(item.id)}>Șterge</button>
        </div>
        {deleting === item.id && <div className="saved-confirm"><p>Ștergi acest element din cont?</p><div className="saved-actions"><button className="saved-delete" disabled={busy} onClick={() => remove(item)}>{busy ? "Se șterge…" : "Da, șterge"}</button><button className="saved-secondary" disabled={busy} onClick={() => setDeleting(null)}>Anulează</button></div></div>}
      </article>)}</div>
      {data.pages > 1 && <nav className="saved-pagination" aria-label="Paginare salvări"><button className="saved-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Precedenta</button><span>{page} / {data.pages}</span><button className="saved-secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Următoarea</button></nav>}
    </> : !error && <div className="saved-empty"><h2>Încă nu ai nimic salvat aici</h2><p>{kind === "risks" ? "Analizează o ofertă și salvează rezultatul." : kind === "searches" ? "Aplică filtrele în piață, apoi salvează căutarea." : "Deschide un anunț din piață și apasă pe stea."}</p><Link className="saved-primary" to={kind === "risks" ? "/anomaly-risk" : "/listings"}>{kind === "risks" ? "Analizează o ofertă" : "Răsfoiește piața"}</Link></div>}
  </>;
}

function SavedDetail({ kind, id }) {
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getSaved(kind, id, controller.signal).then((record) => { if (!controller.signal.aborted) setItem(record); })
      .catch((err) => { if (!controller.signal.aborted) setError(savedError(err)); });
    return () => controller.abort();
  }, [kind, id, revision]);

  async function reanalyse() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const record = await reanalyseSaved(id);
      navigate(`${savedPaths.risks}/${record.id}`);
    } catch (err) { setError(savedError(err)); }
    finally { setBusy(false); }
  }

  if (editing && item) return <SavedEditor kind={kind} item={item} onCancel={() => setEditing(false)} onDone={() => { setEditing(false); setRevision((value) => value + 1); }} />;
  return <>
    <Link className="saved-back" to={savedPaths[kind]}>← Toate salvările</Link>
    {error && <p className="saved-error" role="alert">{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Încearcă din nou</button></p>}
    {!item ? !error && <p role="status">Se încarcă...</p> : <>
      <section className="saved-card saved-detail-heading"><h2>{itemTitle(kind, item)}</h2><p>Salvat la {savedDate(item.created_at)}</p>
        <div className="saved-actions"><button className="saved-secondary" onClick={() => setEditing(true)} disabled={busy}>{kind === "risks" ? "Redenumește" : "Editează"}</button>
          {kind === "searches" && <button className="saved-primary" onClick={() => navigate("/listings", { state: { savedFilters: item.filters } })}>Vezi anunțurile actuale</button>}
          {kind === "risks" && <button className="saved-primary" disabled={busy} onClick={reanalyse}>{busy ? "Se reanalizează…" : "Reanalizează"}</button>}
        </div>
      </section>
      {kind === "searches" && <section className="saved-card"><h2>Criterii salvate</h2><ItemSummary kind={kind} item={item} /><p>Anunțurile se actualizează la deschiderea căutării.</p></section>}
      {kind === "risks" && <><p className="saved-notice">Acesta este rezultatul salvat. Reanalizarea creează o analiză nouă și o păstrează pe cea originală.</p><AnomalyRiskResults result={item.result} vehicle={item.input} /></>}
      {kind === "favourites" && <><p className="saved-notice">{item.available ? "Anunțul este prezent în baza de date. Mai jos vezi datele actuale." : "Anunțul nu mai este în baza de date. Mai jos vezi datele păstrate la salvare."}</p>
        {item.notes && <p className="saved-notice">Notițe: {item.notes}</p>}
        <div className="saved-listing"><CarCard car={item.current_listing ?? item.snapshot} expanded={expanded} position="left" onClick={() => setExpanded((value) => !value)} showFavourite={false} /></div>
      </>}
    </>}
  </>;
}

function SavedEditor({ kind, item, onCancel, onDone }) {
  const [name, setName] = useState(item.name ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [filters, setFilters] = useState(() => listingFiltersToForm(item.filters));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function save(event) {
    event?.preventDefault?.();
    if (pending.current) return;
    if (kind !== "favourites" && !name.trim()) { setError("Introdu un nume."); return; }
    pending.current = true;
    setBusy(true);
    setError("");
    const body = kind === "favourites" ? { notes: notes.trim() || null }
      : { name: name.trim(), ...(kind === "searches" ? { filters: listingFiltersToApi(filters) } : {}) };
    try { await updateSaved(kind, item.id, body); onDone(); }
    catch (err) { setError(savedError(err)); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="saved-editor"><form onSubmit={save} className="saved-card">
    <h2>{kind === "favourites" ? "Notițele anunțului" : kind === "risks" ? "Redenumește analiza" : "Editează filtrele salvate"}</h2>
    {kind === "favourites" ? <><label htmlFor="saved-notes">Notițe</label><textarea id="saved-notes" value={notes} maxLength={1000} disabled={busy} onChange={(event) => setNotes(event.target.value)} /></>
      : <><label htmlFor="saved-name">Nume</label><input id="saved-name" value={name} maxLength={120} required disabled={busy} onChange={(event) => setName(event.target.value)} /></>}
    <div className="saved-actions"><button className="saved-primary" disabled={busy}>{busy ? "Se salvează…" : "Salvează modificările"}</button><button type="button" className="saved-secondary" disabled={busy} onClick={onCancel}>Anulează</button></div>
    {error && <p className="saved-error" role="alert">{error}</p>}
  </form>
    {kind === "searches" && <ListingFilters filters={filters} setFilters={setFilters} loading={busy} initiallyOpen searchLabel="Salvează modificările"
      onReset={() => setFilters(listingFiltersToForm())}
      onSearch={(override) => { if (override && !override.nativeEvent && !override.type) setFilters(override); else save(); }} />}
  </section>;
}
