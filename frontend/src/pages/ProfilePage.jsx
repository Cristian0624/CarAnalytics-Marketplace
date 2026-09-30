import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../api/api";
import "./SavedItemsPage.css";
import PasswordInput from "../components/PasswordInput";

const savedPaths = {
  favourites: "/favourites",
  risks: "/saved-risk-assessments",
  searches: "/saved-searches",
  myListings: "/my-listings",
};

export default function ProfilePage() {
  const { user, logout, checkAuth } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [sellerType, setSellerType] = useState(user?.seller_type || "");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveProfile(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await apiRequest("/users/me", {
        method: "PUT",
        body: {
          name,
          email,
          phone,
          seller_type: sellerType,
        },
      });

      await checkAuth?.();

      setEditing(false);
      setMessage("Profilul a fost actualizat.");
    } catch (err) {
      setError(err.message || "Nu s-au putut salva modificările.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await apiRequest("/users/me/password", {
        method: "PUT",
        body: {
          current_password: currentPassword,
          new_password: newPassword,
        },
      });

      await logout();
      navigate("/login");
    } catch (err) {
      setError(err.message || "Parola nu a putut fi schimbată.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  if (!user) {
    return (
      <main className="saved-page">
        <div className="saved-container">
          <div className="saved-empty">
            <h2>Profilul tău</h2>
            <p>Autentifică-te pentru a-ți accesa profilul.</p>

            <Link className="saved-primary" to="/login">
              Autentificare
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="saved-page">
      <div className="saved-container">
        <header className="saved-heading">
          <span className="saved-eyebrow">CONTUL MEU</span>

          <h1>Profilul Meu</h1>

          <p>
            Informațiile contului tău și opțiunile de securitate.
          </p>
        </header>

        <nav className="saved-tabs" aria-label="Elemente salvate">
          <Link to={savedPaths.favourites}>
            Anunțuri Favorite
          </Link>

          <Link to={savedPaths.risks}>
            Analize Risc Salvate
          </Link>

          <Link to={savedPaths.searches}>
            Filtre Salvate
          </Link>

          <Link to="/profile" aria-current="page">
            Profilul Meu
          </Link>

          <Link to={savedPaths.myListings}>
            Anunțurile Mele
          </Link>
        </nav>

        {error && (
          <p className="saved-error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="saved-notice">
            {message}
          </p>
        )}

        {!editing && !changingPassword && (
          <section className="saved-card">
            <div className="saved-card-top">
              <span className="saved-eyebrow">
                INFORMAȚII CONT
              </span>
            </div>

            <h2>{user.name}</h2>

            <div className="saved-profile-details">
              <div>
                <strong>Nume</strong>
                <span>{user.name || "—"}</span>
              </div>

              <div>
                <strong>Email</strong>
                <span>{user.email || "—"}</span>
              </div>

              <div>
                <strong>Telefon</strong>
                <span>{user.phone || "—"}</span>
              </div>

              <div>
                <strong>Tip utilizator</strong>
                <span> {user.seller_type === "private" ? "Persoană fizică" : user.seller_type === "dealer" ? "Dealer" : "—"}</span>
              </div>
            </div>

            <div className="saved-actions">
              <button
                className="saved-primary"
                onClick={() => {
                  setName(user.name || "");
                  setEmail(user.email || "");
                  setPhone(user.phone || "");
                  setSellerType(user.seller_type || "");

                  setError("");
                  setMessage("");
                  setEditing(true);
                }}
              >
                Editează profilul
              </button>

              <button
                className="saved-secondary"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setChangingPassword(true);
                }}
              >
                Schimbă parola
              </button>

              <button
                className="saved-delete"
                onClick={handleLogout}
              >
                Deconectare
              </button>
            </div>
          </section>
        )}

        {editing && (
          <section className="saved-editor">
            <form className="saved-card" onSubmit={saveProfile}>
              <h2>Editează profilul</h2>

              <label htmlFor="profile-name">
                Nume
              </label>

              <input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                required
              />

              <label htmlFor="profile-email">
                Email
              </label>

              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
              />

              <label htmlFor="profile-phone">
                Telefon
              </label>

              <input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />

              <div className="seller-type-options">
                <button
                  type="button"
                  className={`seller-type-option ${
                    sellerType === "private" ? "selected" : ""
                  }`}
                  onClick={() => setSellerType("private")}
                  disabled={busy}
                >
                  <span className="seller-type-title">
                    Persoană fizică
                  </span>

                  <span className="seller-type-description">
                    Vând ca persoană fizică
                  </span>
                </button>

                <button
                  type="button"
                  className={`seller-type-option ${
                    sellerType === "dealer" ? "selected" : ""
                  }`}
                  onClick={() => setSellerType("dealer")}
                  disabled={busy}
                >
                  <span className="seller-type-title">
                    Dealer
                  </span>

                  <span className="seller-type-description">
                    Reprezint un dealer auto
                  </span>
                </button>
              </div>

              <div className="saved-actions">
                <button
                  className="saved-primary"
                  disabled={busy}
                >
                  {busy
                    ? "Se salvează..."
                    : "Salvează modificările"}
                </button>

                <button
                  type="button"
                  className="saved-secondary"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setEditing(false);
                  }}
                >
                  Anulează
                </button>
              </div>
            </form>
          </section>
        )}

        {changingPassword && (
          <section className="saved-editor">
            <form
              className="saved-card"
              onSubmit={changePassword}
            >
              <h2>Schimbă parola</h2>

              <label htmlFor="current-password">
                Parola actuală
              </label>

              <PasswordInput
                name="current_password"
                placeholder="Parola actuală"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={busy}
              />

              <label htmlFor="new-password">
                Parola nouă
              </label>

              <PasswordInput
                name="new_password"
                placeholder="Parola nouă"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
              />

              <div className="saved-actions">
                <button
                  className="saved-primary"
                  disabled={busy}
                >
                  {busy
                    ? "Se schimbă..."
                    : "Schimbă parola"}
                </button>

                <button
                  type="button"
                  className="saved-secondary"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setChangingPassword(false);
                  }}
                >
                  Anulează
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}