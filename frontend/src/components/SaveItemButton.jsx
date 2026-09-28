import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { savedError } from "../utils/savedItems";
import "../pages/SavedItemsPage.css";

export default function SaveItemButton(props) {
  const { user } = useAuth();
  return <SaveItemAction key={user?.id ?? "guest"} {...props} user={user} />;
}

function SaveItemAction({ label, defaultName, onSave, onSaved, path, user }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName.slice(0, 120));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const dialog = useRef(null);
  const pending = useRef(false);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  async function save(event) {
    event.preventDefault();
    // Portal events still bubble through React's parent form.
    event.stopPropagation();
    if (pending.current || !name.trim()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const item = await onSave(name.trim());
      setSaved(item);
      setOpen(false);
      onSaved?.(item);
    } catch (err) { setError(savedError(err)); }
    finally { pending.current = false; setBusy(false); }
  }

  return <>
    {saved ? <Link className="saved-secondary" to={`${path}/${saved.id}`}>Salvat ✓</Link>
      : <button className="saved-secondary" type="button" onClick={() => setOpen(true)}>{label}</button>}
    {open && createPortal(<dialog className="save-dialog" ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); else setOpen(false); }}>
      <h2>{label}</h2>
      {user ? <form onSubmit={save}>
        <label htmlFor="saved-item-name">Nume</label>
        <input id="saved-item-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus disabled={busy} />
        {error && <p className="saved-error" role="alert">{error}</p>}
        <div className="saved-actions"><button className="saved-primary" disabled={busy || !name.trim()}>{busy ? "Se salvează…" : "Salvează"}</button><button className="saved-secondary" type="button" disabled={busy} onClick={() => setOpen(false)}>Anulează</button></div>
      </form> : <><p>Autentifică-te pentru a salva în contul tău.</p><div className="saved-actions"><Link className="saved-primary" to="/login">Autentificare</Link><button className="saved-secondary" onClick={() => setOpen(false)}>Închide</button></div></>}
    </dialog>, document.body)}
  </>;
}
