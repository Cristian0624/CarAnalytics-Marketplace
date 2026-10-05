import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  getAnalyses,
  deleteAnalysis,
  updateAnalysis,
} from "../api/analysis";

import { useAuth } from "../context/AuthContext";
import { savedPaths } from "../api/saved_items";
import BackgroundTriangles from "../components/BackgroundTriangles";

import "./SavedItemsPage.css";
import "./MyListingsPage.css";

function formatPrice(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(Number(value))
  ) {
    return "—";
  }

  return (
    new Intl.NumberFormat("de-DE", {
      maximumFractionDigits: 0,
    }).format(Number(value)) + " €"
  );
}

function formatDate(dateStr, language) {
  if (!dateStr) return "";

  try {
    return new Date(dateStr).toLocaleDateString(language, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function MyListingsPage() {
  const { t, i18n } = useTranslation();

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
          setError(
            err?.message || t("myListings.errors.load")
          );
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
  }, [user, t]);

  async function handleDelete(id) {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await deleteAnalysis(id);

      setListings((current) =>
        current.filter((item) => item.id !== id)
      );

      setDeletingId(null);
    } catch (err) {
      setError(
        err?.message || t("myListings.errors.delete")
      );
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
        price_eur: editingItem.price_eur
          ? Number(editingItem.price_eur)
          : null,

        mileage: editingItem.mileage
          ? Number(editingItem.mileage)
          : null,

        year: editingItem.year
          ? Number(editingItem.year)
          : null,

        horsepower: editingItem.horsepower
          ? Number(editingItem.horsepower)
          : null,

        fuel_type: editingItem.fuel_type || null,
        gearbox: editingItem.gearbox || null,
        body_type: editingItem.body_type || null,
        state: editingItem.state || null,
      };

      const updated = await updateAnalysis(
        editingItem.id,
        payload
      );

      setListings((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item
        )
      );

      setEditingItem(null);
    } catch (err) {
      setError(
        err?.message || t("myListings.errors.save")
      );
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <main className="saved-page">
        <div className="saved-container">
          <p role="status">
            {t("common.loading")}
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="saved-page">
        <div className="saved-container">
          <header className="saved-heading">
            <span className="saved-eyebrow">
              {t("myListings.account")}
            </span>

            <h1>{t("myListings.title")}</h1>

            <p>
              {t("myListings.loginRequired")}
            </p>
          </header>

          <div className="saved-empty">
            <h2>
              {t("myListings.allInOnePlace")}
            </h2>

            <p>
              {t("myListings.loginToAccess")}
            </p>

            <Link
              className="saved-primary"
              to="/login"
            >
              {t("myListings.login")}
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
            {t("myListings.account")}
          </span>

          <h1>{t("myListings.title")}</h1>

          <p>
            {t("myListings.description")}
          </p>
        </header>

        <nav
          className="saved-tabs"
          aria-label={t("myListings.tabs.savedItems")}
        >
          <Link to={savedPaths.favourites}>
            {t("myListings.tabs.favourites")}
          </Link>

          <Link to={savedPaths.risks}>
            {t("myListings.tabs.risks")}
          </Link>

          <Link to={savedPaths.searches}>
            {t("myListings.tabs.searches")}
          </Link>

          <Link to="/saved-comparisons">
            {t("myListings.tabs.comparisons", { defaultValue: "Comparări Salvate" })}
          </Link>

          <Link to="/profile">
            {t("myListings.tabs.profile")}
          </Link>

          <Link
            to="/my-listings"
            aria-current="page"
          >
            {t("myListings.tabs.myListings")}
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

        <div className="my-listings-topbar">
          <span className="my-listings-count">
            {listings.length === 1
              ? t("myListings.count.one")
              : t("myListings.count.many", {
                  count: listings.length,
                })}
          </span>

          <Link
            to="/create-listing"
            className="my-listings-add-btn"
          >
            {t("myListings.addNew")}
          </Link>
        </div>

        {loading ? (
          <p role="status">
            {t("myListings.loading")}
          </p>
        ) : listings.length === 0 ? (
          <div className="saved-empty">
            <h2>
              {t("myListings.empty.title")}
            </h2>

            <p>
              {t("myListings.empty.description")}
            </p>

            <Link
              className="saved-primary"
              to="/create-listing"
            >
              {t("myListings.empty.create")}
            </Link>
          </div>
        ) : (
          <div className="saved-grid">
            {listings.map((item) => (
              <article
                className="saved-card my-listing-card"
                key={item.id}
              >
                <div>
                  <div className="saved-card-top">
                    <span className="my-listing-badge">
                      {t("myListings.status")}
                    </span>

                    <time dateTime={item.created_at}>
                      {formatDate(
                        item.created_at,
                        i18n.language
                      )}
                    </time>
                  </div>

                  <div className="my-listing-header">
                    <h2>
                      {item.brand} {item.model}{" "}
                      {item.generation
                        ? `· ${item.generation}`
                        : ""}
                    </h2>
                  </div>

                  <div className="my-listing-price">
                    {formatPrice(item.price_eur)}
                  </div>

                  <div className="my-listing-specs-grid">
                    {item.year && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">
                          {t("myListings.specs.year")}
                        </span>

                        <span className="my-listing-spec-val">
                          {item.year}
                        </span>
                      </div>
                    )}

                    {item.mileage !== null &&
                      item.mileage !== undefined && (
                        <div className="my-listing-spec-item">
                          <span className="my-listing-spec-label">
                            {t("myListings.specs.mileage")}
                          </span>

                          <span className="my-listing-spec-val">
                            {Number(
                              item.mileage
                            ).toLocaleString(
                              i18n.language
                            )}{" "}
                            km
                          </span>
                        </div>
                      )}

                    {item.fuel_type && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">
                          {t("myListings.specs.fuel")}
                        </span>

                        <span className="my-listing-spec-val">
                          {item.fuel_type}
                        </span>
                      </div>
                    )}

                    {item.gearbox && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">
                          {t("myListings.specs.gearbox")}
                        </span>

                        <span className="my-listing-spec-val">
                          {item.gearbox}
                        </span>
                      </div>
                    )}

                    {item.engine && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">
                          {t("myListings.specs.engine")}
                        </span>

                        <span className="my-listing-spec-val">
                          {item.engine} L
                        </span>
                      </div>
                    )}

                    {item.horsepower && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">
                          {t("myListings.specs.power")}
                        </span>

                        <span className="my-listing-spec-val">
                          {item.horsepower} CP
                        </span>
                      </div>
                    )}

                    {item.body_type && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">
                          {t("myListings.specs.body")}
                        </span>

                        <span className="my-listing-spec-val">
                          {item.body_type}
                        </span>
                      </div>
                    )}

                    {item.drivetrain && (
                      <div className="my-listing-spec-item">
                        <span className="my-listing-spec-label">
                          {t("myListings.specs.drivetrain")}
                        </span>

                        <span className="my-listing-spec-val">
                          {item.drivetrain}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="my-listing-extra-chips">
                    {item.state && (
                      <span className="my-listing-chip">
                        {t("myListings.chips.condition", {
                          value: item.state,
                        })}
                      </span>
                    )}

                    {item.doors && (
                      <span className="my-listing-chip">
                        {t("myListings.chips.doors", {
                          count: item.doors,
                        })}
                      </span>
                    )}

                    {item.seats && (
                      <span className="my-listing-chip">
                        {t("myListings.chips.seats", {
                          count: item.seats,
                        })}
                      </span>
                    )}

                    {item.seller_type && (
                      <span className="my-listing-chip">
                        {t("myListings.chips.seller", {
                          value: item.seller_type,
                        })}
                      </span>
                    )}

                    {item.registration_country && (
                      <span className="my-listing-chip">
                        {t(
                          "myListings.chips.registration",
                          {
                            value:
                              item.registration_country,
                          }
                        )}
                      </span>
                    )}

                    {(item.class_ || item.class) && (
                      <span className="my-listing-chip">
                        {t("myListings.chips.class", {
                          value:
                            item.class_ || item.class,
                        })}
                      </span>
                    )}

                    {item.score && (
                      <span className="my-listing-chip">
                        {t("myListings.chips.score", {
                          value: Number(
                            item.score
                          ).toFixed(1),
                        })}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="saved-actions">
                    <button
                      type="button"
                      className="saved-secondary"
                      onClick={() =>
                        setEditingItem({
                          ...item,
                        })
                      }
                    >
                      {t("myListings.actions.edit")}
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
                              generation:
                                item.generation,
                              year: item.year,
                              mileage:
                                item.mileage,
                              price:
                                item.price_eur,
                              fuel_type:
                                item.fuel_type,
                              gearbox:
                                item.gearbox,
                              drivetrain:
                                item.drivetrain,
                              body_type:
                                item.body_type,
                              engine:
                                item.engine,
                            },
                          },
                        })
                      }
                    >
                      {t(
                        "myListings.actions.riskAnalysis"
                      )}
                    </button>

                    <button
                      type="button"
                      className="saved-delete"
                      onClick={() =>
                        setDeletingId(item.id)
                      }
                    >
                      {t("myListings.actions.delete")}
                    </button>
                  </div>

                  {deletingId === item.id && (
                    <div className="saved-confirm">
                      <p>
                        {t(
                          "myListings.actions.confirmDelete"
                        )}
                      </p>

                      <div className="saved-actions">
                        <button
                          type="button"
                          className="saved-delete"
                          disabled={busy}
                          onClick={() =>
                            handleDelete(item.id)
                          }
                        >
                          {busy
                            ? t(
                                "myListings.actions.deleting"
                              )
                            : t(
                                "myListings.actions.deleteYes"
                              )}
                        </button>

                        <button
                          type="button"
                          className="saved-secondary"
                          disabled={busy}
                          onClick={() =>
                            setDeletingId(null)
                          }
                        >
                          {t(
                            "myListings.actions.cancel"
                          )}
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
                {t("myListings.edit.title", {
                  brand: editingItem.brand,
                  model: editingItem.model,
                })}
              </h2>

              <p>
                {t("myListings.edit.description")}
              </p>

              <form onSubmit={handleSaveEdit}>
                <div className="my-listing-edit-grid">
                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-price">
                      {t("myListings.edit.price")}
                    </label>

                    <input
                      id="edit-price"
                      type="number"
                      min="0"
                      value={
                        editingItem.price_eur ?? ""
                      }
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          price_eur:
                            e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-mileage">
                      {t("myListings.edit.mileage")}
                    </label>

                    <input
                      id="edit-mileage"
                      type="number"
                      min="0"
                      value={
                        editingItem.mileage ?? ""
                      }
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          mileage:
                            e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-year">
                      {t("myListings.edit.year")}
                    </label>

                    <input
                      id="edit-year"
                      type="number"
                      min="1886"
                      value={
                        editingItem.year ?? ""
                      }
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
                    <label htmlFor="edit-hp">
                      {t("myListings.edit.power")}
                    </label>

                    <input
                      id="edit-hp"
                      type="number"
                      min="0"
                      value={
                        editingItem.horsepower ?? ""
                      }
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          horsepower:
                            e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-fuel">
                      {t("myListings.edit.fuel")}
                    </label>

                    <input
                      id="edit-fuel"
                      type="text"
                      value={
                        editingItem.fuel_type ?? ""
                      }
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          fuel_type:
                            e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-gearbox">
                      {t("myListings.edit.gearbox")}
                    </label>

                    <input
                      id="edit-gearbox"
                      type="text"
                      value={
                        editingItem.gearbox ?? ""
                      }
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          gearbox:
                            e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-body">
                      {t("myListings.edit.body")}
                    </label>

                    <input
                      id="edit-body"
                      type="text"
                      value={
                        editingItem.body_type ?? ""
                      }
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          body_type:
                            e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="my-listing-edit-field">
                    <label htmlFor="edit-state">
                      {t("myListings.edit.condition")}
                    </label>

                    <select
                      id="edit-state"
                      value={
                        editingItem.state ?? "Used"
                      }
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          state: e.target.value,
                        })
                      }
                    >
                      <option value="Used">
                        {t("myListings.edit.used")}
                      </option>

                      <option value="New">
                        {t("myListings.edit.new")}
                      </option>
                    </select>
                  </div>
                </div>

                <div className="saved-actions">
                  <button
                    type="submit"
                    className="saved-primary"
                    disabled={busy}
                  >
                    {busy
                      ? t(
                          "myListings.actions.saving"
                        )
                      : t(
                          "myListings.actions.saveChanges"
                        )}
                  </button>

                  <button
                    type="button"
                    className="saved-secondary"
                    disabled={busy}
                    onClick={() =>
                      setEditingItem(null)
                    }
                  >
                    {t(
                      "myListings.actions.cancel"
                    )}
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