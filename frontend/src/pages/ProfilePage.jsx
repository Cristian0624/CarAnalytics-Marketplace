import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../api/api";
import BackgroundTriangles from "../components/BackgroundTriangles";
import PasswordInput from "../components/PasswordInput";

import "./SavedItemsPage.css";

const savedPaths = {
  favourites: "/favourites",
  risks: "/saved-risk-assessments",
  searches: "/saved-searches",
  myListings: "/my-listings",
};

export default function ProfilePage() {
  const { t } = useTranslation();

  const { user, logout, checkAuth } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [changingPassword, setChangingPassword] =
    useState(false);

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [sellerType, setSellerType] = useState(
    user?.seller_type || ""
  );

  const [currentPassword, setCurrentPassword] =
    useState("");

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
      setMessage(
        t("profile.messages.profileUpdated")
      );
    } catch (err) {
      setError(
        err.message ||
          t("profile.messages.profileSaveError")
      );
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
      setError(
        err.message ||
          t("profile.messages.passwordChangeError")
      );
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
            <h2>{t("profile.title")}</h2>

            <p>
              {t("profile.loginRequired")}
            </p>

            <Link
              className="saved-primary"
              to="/login"
            >
              {t("profile.login")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="saved-page">
      <BackgroundTriangles />

      <div className="saved-container">
        <header className="saved-heading">
          <span className="saved-eyebrow">
            {t("profile.account")}
          </span>

          <h1>{t("profile.title")}</h1>

          <p>
            {t("profile.description")}
          </p>
        </header>

        <nav
          className="saved-tabs"
          aria-label={t(
            "profile.tabs.savedItems"
          )}
        >
          <Link to={savedPaths.favourites}>
            {t("profile.tabs.favourites")}
          </Link>

          <Link to={savedPaths.risks}>
            {t("profile.tabs.risks")}
          </Link>

          <Link to={savedPaths.searches}>
            {t("profile.tabs.searches")}
          </Link>

          <Link
            to="/profile"
            aria-current="page"
          >
            {t("profile.tabs.profile")}
          </Link>

          <Link to={savedPaths.myListings}>
            {t("profile.tabs.myListings")}
          </Link>
        </nav>

        {error && (
          <p
            className="saved-error"
            role="alert"
          >
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
                {t("profile.accountInfo")}
              </span>
            </div>

            <h2>{user.name}</h2>

            <div className="saved-profile-details">
              <div>
                <strong>
                  {t("profile.fields.name")}
                </strong>

                <span>
                  {user.name || "—"}
                </span>
              </div>

              <div>
                <strong>
                  {t("profile.fields.email")}
                </strong>

                <span>
                  {user.email || "—"}
                </span>
              </div>

              <div>
                <strong>
                  {t("profile.fields.phone")}
                </strong>

                <span>
                  {user.phone || "—"}
                </span>
              </div>

              <div>
                <strong>
                  {t("profile.fields.userType")}
                </strong>

                <span>
                  {user.seller_type === "private"
                    ? t(
                        "profile.sellerTypes.private"
                      )
                    : user.seller_type === "dealer"
                      ? t(
                          "profile.sellerTypes.dealer"
                        )
                      : "—"}
                </span>
              </div>
            </div>

            <div className="saved-actions">
              <button
                className="saved-primary"
                onClick={() => {
                  setName(user.name || "");
                  setEmail(user.email || "");
                  setPhone(user.phone || "");
                  setSellerType(
                    user.seller_type || ""
                  );

                  setError("");
                  setMessage("");
                  setEditing(true);
                }}
              >
                {t("profile.actions.edit")}
              </button>

              <button
                className="saved-secondary"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setChangingPassword(true);
                }}
              >
                {t(
                  "profile.actions.changePassword"
                )}
              </button>

              <button
                className="saved-delete"
                onClick={handleLogout}
              >
                {t("profile.actions.logout")}
              </button>
            </div>
          </section>
        )}

        {editing && (
          <section className="saved-editor">
            <form
              className="saved-card"
              onSubmit={saveProfile}
            >
              <h2>{t("profile.edit.title")}</h2>

              <label htmlFor="profile-name">
                {t("profile.fields.name")}
              </label>

              <input
                id="profile-name"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                disabled={busy}
                required
              />

              <label htmlFor="profile-email">
                {t("profile.fields.email")}
              </label>

              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                disabled={busy}
                required
              />

              <label htmlFor="profile-phone">
                {t("profile.fields.phone")}
              </label>

              <input
                id="profile-phone"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value)
                }
                disabled={busy}
              />

              <div className="seller-type-options">
                <button
                  type="button"
                  className={`seller-type-option ${
                    sellerType === "private"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSellerType("private")
                  }
                  disabled={busy}
                >
                  <span className="seller-type-title">
                    {t(
                      "profile.sellerTypes.private"
                    )}
                  </span>

                  <span className="seller-type-description">
                    {t(
                      "profile.sellerTypes.privateDescription"
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  className={`seller-type-option ${
                    sellerType === "dealer"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSellerType("dealer")
                  }
                  disabled={busy}
                >
                  <span className="seller-type-title">
                    {t(
                      "profile.sellerTypes.dealer"
                    )}
                  </span>

                  <span className="seller-type-description">
                    {t(
                      "profile.sellerTypes.dealerDescription"
                    )}
                  </span>
                </button>
              </div>

              <div className="saved-actions">
                <button
                  className="saved-primary"
                  disabled={busy}
                >
                  {busy
                    ? t(
                        "profile.actions.saving"
                      )
                    : t(
                        "profile.actions.save"
                      )}
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
                  {t(
                    "profile.actions.cancel"
                  )}
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
              <h2>
                {t(
                  "profile.password.title"
                )}
              </h2>

              <label htmlFor="current-password">
                {t(
                  "profile.password.current"
                )}
              </label>

              <PasswordInput
                name="current_password"
                placeholder={t(
                  "profile.password.current"
                )}
                value={currentPassword}
                onChange={(e) =>
                  setCurrentPassword(
                    e.target.value
                  )
                }
                disabled={busy}
              />

              <label htmlFor="new-password">
                {t(
                  "profile.password.new"
                )}
              </label>

              <PasswordInput
                name="new_password"
                placeholder={t(
                  "profile.password.new"
                )}
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(
                    e.target.value
                  )
                }
                disabled={busy}
              />

              <div className="saved-actions">
                <button
                  className="saved-primary"
                  disabled={busy}
                >
                  {busy
                    ? t(
                        "profile.actions.changing"
                      )
                    : t(
                        "profile.actions.change"
                      )}
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
                  {t(
                    "profile.actions.cancel"
                  )}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}