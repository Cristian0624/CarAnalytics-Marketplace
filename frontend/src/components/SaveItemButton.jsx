import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { savedError } from "../utils/savedItems";
import "../pages/SavedItemsPage.css";

export default function SaveItemButton(props) {
  const { user } = useAuth();

  return (
    <SaveItemAction
      key={user?.id ?? "guest"}
      {...props}
      user={user}
    />
  );
}

function SaveItemAction({
  label,
  defaultName,
  onSave,
  onSaved,
  path,
  user
}) {
  const { t } = useTranslation();

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
    } catch (err) {
      setError(savedError(err, t));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      {saved ? (
        <Link
          className="saved-secondary"
          to={`${path}/${saved.id}`}
        >
          {t("saveItemButton.saved")}
        </Link>
      ) : (
        <button
          className="saved-secondary"
          type="button"
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
      )}

      {open &&
        createPortal(
          <dialog
            className="save-dialog"
            ref={dialog}
            onCancel={(event) => {
              if (busy) {
                event.preventDefault();
              } else {
                setOpen(false);
              }
            }}
          >
            <h2>{label}</h2>

            {user ? (
              <form onSubmit={save}>
                <label htmlFor="saved-item-name">
                  {t("saveItemButton.name")}
                </label>

                <input
                  id="saved-item-name"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  maxLength={120}
                  required
                  autoFocus
                  disabled={busy}
                />

                {error && (
                  <p
                    className="saved-error"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                <div className="saved-actions">
                  <button
                    className="saved-primary"
                    disabled={busy || !name.trim()}
                  >
                    {busy
                      ? t("saveItemButton.saving")
                      : t("saveItemButton.save")}
                  </button>

                  <button
                    className="saved-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    {t("saveItemButton.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <p>
                  {t("saveItemButton.loginToSave")}
                </p>

                <div className="saved-actions">
                  <Link
                    className="saved-primary"
                    to="/login"
                  >
                    {t("saveItemButton.login")}
                  </Link>

                  <button
                    className="saved-secondary"
                    onClick={() => setOpen(false)}
                  >
                    {t("saveItemButton.close")}
                  </button>
                </div>
              </>
            )}
          </dialog>,
          document.body
        )}
    </>
  );
}