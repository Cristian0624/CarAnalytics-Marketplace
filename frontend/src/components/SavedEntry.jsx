import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { savedPaths } from "../api/saved_items";
import { favouriteCar, savedDate } from "../utils/savedItems";
import { getLogoFileName, getScoreClass } from "../utils/carCard";
import SavedIcon from "./SavedIcon";
import "./SavedEntry.css";

export default function SavedEntry({ kind, item, title, children, onEdit, onDelete, confirming, onConfirm, onCancel, busy }) {
  const { t, i18n } = useTranslation();
  const [imageFailed, setImageFailed] = useState(false);
  const car = kind === "favourites" ? favouriteCar(item) : kind === "risks" ? item.input : null;
  const detailPath = kind === "comparisons" ? "/saved-comparisons" : savedPaths[kind];
  const badgeKey = { favourites: "favourite", risks: "risk", searches: "search", comparisons: "comparison" }[kind];
  const hasPhoto = kind === "favourites" && car?.image_url && !imageFailed;

  return (
    <article className={`saved-entry saved-entry-${kind}`}>
      {kind === "favourites" && (
        <Link to={`${detailPath}/${item.id}`} className={`saved-entry-photo${hasPhoto ? "" : " is-placeholder"}`} tabIndex={-1} aria-hidden="true">
          {hasPhoto
            ? <img src={car.image_url} alt="" loading="lazy" onError={() => setImageFailed(true)} />
            : <SavedIcon name="myListings" />}
        </Link>
      )}
      <div className="saved-entry-body">
        <div className="saved-entry-meta">
          <span className="saved-entry-type"><SavedIcon name={kind} />{t(`savedItems.badges.${badgeKey}`)}</span>
          <time dateTime={item.created_at}>{savedDate(item.created_at, i18n.resolvedLanguage || i18n.language)}</time>
        </div>
        {kind === "favourites" && item.available === false && (
          <span className="saved-unavailable-badge">{t("savedItems.badges.removedFromMarket")}</span>
        )}
        <div className="saved-entry-title">
          <h2><Link to={`${detailPath}/${item.id}`}>{title}</Link></h2>
          {car?.brand && <img className="saved-entry-logo" src={`/logos/${getLogoFileName(car.brand)}`} alt="" onError={event => { event.currentTarget.style.display = "none"; }} />}
        </div>
        {children}
        {kind === "favourites" && car.score != null && (
          <div className="saved-entry-grade">
            <span>{t("comparatorPage.overallScore")}</span>
            <strong className={getScoreClass(car.score)}>{Number(car.score).toFixed(0)}<small> / 80</small></strong>
          </div>
        )}
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
