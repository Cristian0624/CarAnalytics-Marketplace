import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { savedPaths } from "../api/saved_items";
import { favouriteCar, savedDate } from "../utils/savedItems";
import { getLogoFileName, getScoreClass } from "../utils/carCard";
import { translateCarValue } from "../utils/carTranslations";
import SavedIcon from "./SavedIcon";
import "./SavedEntry.css";

export default function SavedEntry({ kind, item, title, children, onEdit, onDelete, confirming, onConfirm, onCancel, busy }) {
  const { t, i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const car = kind === "favourites" ? favouriteCar(item) : kind === "risks" ? item.input : null;
  const detailPath = kind === "comparisons" ? "/saved-comparisons" : savedPaths[kind];
  const badgeKey = { favourites: "favourite", risks: "risk", searches: "search", comparisons: "comparison" }[kind];
  const hasPhoto = kind === "favourites" && car?.image_url && !imageFailed;

  if (kind === "favourites") {
    const score = car?.score != null ? Number(car.score) : null;
    const generationText = car?.generation ? translateCarValue(t, "generation", car.generation) : "";

    return (
      <article className="saved-entry saved-entry-favourites saved-entry-market-card">
        <Link
          to={`${detailPath}/${item.id}`}
          className={`saved-market-photo-wrap${hasPhoto ? "" : " is-placeholder"}`}
        >
          <span
            className="car-card-fav-badge"
            title={t("savedItems.favourites.saved", { defaultValue: "Salvat la favorite" })}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="m12 3 2.8 5.7 6.3.9-4.55 4.43 1.08 6.27L12 17.34l-5.63 2.96 1.08-6.27L2.9 9.6l6.3-.9Z" />
            </svg>
          </span>

          {item.available === false && (
            <span className="saved-market-removed-pill">
              {t("savedItems.badges.removedFromMarket")}
            </span>
          )}

          {hasPhoto ? (
            <img
              src={car.image_url}
              alt={title}
              className="saved-market-photo"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="saved-market-placeholder">
              {car?.brand ? (
                <img
                  src={`/logos/${getLogoFileName(car.brand)}`}
                  alt={car.brand}
                  className="saved-market-placeholder-logo"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <SavedIcon name="myListings" />
              )}
            </div>
          )}
        </Link>

        <div className="saved-market-content">
          <div className="saved-market-title-row">
            <div>
              <h3>
                <Link to={`${detailPath}/${item.id}`}>{title}</Link>
              </h3>
              {generationText && (
                <p className="saved-market-generation">{generationText}</p>
              )}
            </div>
            {car?.brand && (
              <img
                className="saved-market-brand-logo"
                src={`/logos/${getLogoFileName(car.brand)}`}
                alt={car.brand}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
          </div>

          <div className="saved-market-details">
            {car?.year && <span>{car.year}</span>}
            {car?.mileage != null && (
              <span>
                {Number(car.mileage).toLocaleString()} {t("carCard.mileageUnit")}
              </span>
            )}
          </div>

          <div className="saved-market-bottom">
            <strong>
              {car?.price_eur == null
                ? t("savedItems.summary.unspecifiedPrice")
                : `€${Number(car.price_eur).toLocaleString()}`}
            </strong>

            {score != null && !Number.isNaN(score) && (
              <span
                className={`score-badge ${getScoreClass(score)}`}
                title={t("carCard.scoreTooltip", { score: score.toFixed(0) })}
              >
                {score.toFixed(0)}
              </span>
            )}
          </div>
        </div>

        <div className="saved-entry-footer saved-market-footer">
          <div className="saved-entry-open">
            <Link className="saved-primary" to={`${detailPath}/${item.id}`}>
              {t("savedItems.actions.open")}<SavedIcon name="forward" />
            </Link>
          </div>
          <div className="saved-entry-tools">
            <button className="saved-entry-edit" onClick={onEdit} disabled={busy}>
              <SavedIcon name="edit" />{t("savedItems.actions.edit")}
            </button>
            <button
              className="saved-entry-delete"
              onClick={onDelete}
              disabled={busy}
              aria-label={`${t("savedItems.actions.delete")}: ${title}`}
              title={t("savedItems.actions.delete")}
            >
              <SavedIcon name="delete" />
            </button>
          </div>
        </div>

        {confirming && (
          <div className="saved-confirm">
            <p>{t("savedItems.deleteConfirm")}</p>
            <div className="saved-actions">
              <button className="saved-delete" disabled={busy} onClick={onConfirm}>
                {t(busy ? "savedItems.actions.deleting" : "savedItems.actions.deleteConfirm")}
              </button>
              <button className="saved-secondary" disabled={busy} onClick={onCancel}>
                {t("savedItems.actions.cancel")}
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  return (
    <article className={`saved-entry saved-entry-${kind}`}>
      <div className="saved-entry-body">
        <div className="saved-entry-meta">
          <span className="saved-entry-type"><SavedIcon name={kind} />{t(`savedItems.badges.${badgeKey}`)}</span>
          <time dateTime={item.created_at}>{savedDate(item.created_at, i18n.resolvedLanguage || i18n.language)}</time>
        </div>
        <div className="saved-entry-title">
          <h2><Link to={`${detailPath}/${item.id}`}>{title}</Link></h2>
          {car?.brand && <img className="saved-entry-logo" src={`/logos/${getLogoFileName(car.brand)}`} alt="" onError={event => { event.currentTarget.style.display = "none"; }} />}
        </div>
        {children}
      </div>
      <div className="saved-entry-footer">
        <div className="saved-entry-open">
          <Link className="saved-primary" to={`${detailPath}/${item.id}`}>
            {t("savedItems.actions.open")}<SavedIcon name="forward" />
          </Link>
          {kind === "searches" && (
            <Link className="saved-entry-shortcut" to="/listings" state={{ savedFilters: item.filters }}>
              {t("savedItems.actions.viewListings")}<SavedIcon name="forward" />
            </Link>
          )}
        </div>
        <div className="saved-entry-tools">
          <button className="saved-entry-edit" onClick={onEdit} disabled={busy}>
            <SavedIcon name="edit" />{t(kind === "risks" || kind === "comparisons" ? "savedItems.actions.rename" : "savedItems.actions.edit")}
          </button>
          <button className="saved-entry-delete" onClick={onDelete} disabled={busy} aria-label={`${t("savedItems.actions.delete")}: ${title}`} title={t("savedItems.actions.delete")}>
            <SavedIcon name="delete" />
          </button>
        </div>
      </div>
      {confirming && (
        <div className="saved-confirm">
          <p>{t("savedItems.deleteConfirm")}</p>
          <div className="saved-actions">
            <button className="saved-delete" disabled={busy} onClick={onConfirm}>
              {t(busy ? "savedItems.actions.deleting" : "savedItems.actions.deleteConfirm")}
            </button>
            <button className="saved-secondary" disabled={busy} onClick={onCancel}>{t("savedItems.actions.cancel")}</button>
          </div>
        </div>
      )}
    </article>
  );
}
