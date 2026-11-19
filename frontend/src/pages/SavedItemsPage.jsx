import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  deleteSaved,
  getSaved,
  listSaved,
  reanalyseSaved,
  savedPaths,
  updateSaved,
} from "../api/saved_items";
import { useAuth } from "../context/AuthContext";
import { useFavourites } from "../context/FavouritesContext";
import {
  describeFilters,
  listingFiltersToApi,
  listingFiltersToForm,
  listingFilterError,
} from "../utils/listingFilters";
import { favouriteCar, savedDate, savedError } from "../utils/savedItems";
import AnomalyRiskResults from "../components/AnomalyRiskResults";
import CarCard from "../components/CarCard";
import ListingFilters from "../components/ListingFilters";
import AccountLayout from "../components/AccountLayout";
import SavedEntry from "../components/SavedEntry";
import SavedIcon from "../components/SavedIcon";
import { useComparator } from "../context/ComparatorContext";
import "./AnomalyRiskPage.css";
import "./SavedItemsPage.css";

export default function SavedItemsPage({ kind }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { id } = useParams();

  return (
    <AccountLayout active={kind}>
        <header className="saved-heading">
          <span className="saved-eyebrow">
            {t("savedItems.account")}
          </span>

          <h1>
            {t(`savedItems.titles.${kind}`)}
          </h1>

          <p>
            {t(`savedItems.descriptions.${kind}`)}
          </p>
        </header>


        {loading ? (
          <p className="saved-loading" role="status">
            {t("savedItems.loading")}
          </p>
        ) : !user ? (
          <div className="saved-empty">
            <div className="saved-empty-symbol"><SavedIcon name={kind} /></div>
            <h2>
              {t("savedItems.loginRequired.title")}
            </h2>

            <p>
              {t("savedItems.loginRequired.description")}
            </p>

            <Link
              className="saved-primary"
              to="/login"
            >
              {t("savedItems.loginRequired.login")}
            </Link>
          </div>
        ) : id ? (
          <SavedDetail
            key={`${kind}/${id}/${user.id}`}
            kind={kind}
            id={id}
          />
        ) : (
          <SavedCollection
            key={`${kind}/${user.id}`}
            kind={kind}
          />
        )}
    </AccountLayout>
  );
}

function RemovedListingBadge({ item }) {
  const { t } = useTranslation();
  return item.available === false ? (
    <span className="saved-unavailable-badge">
      {t("savedItems.badges.removedFromMarket")}
    </span>
  ) : null;
}

function ItemSummary({ kind, item }) {
  const { t, i18n } = useTranslation();

  if (kind === "comparisons") {
    const cars = item.filters?.cars || [];
    return (
      <>
        <p>{t("savedItems.summary.compareCount", { count: cars.length })}</p>
        <ul className="saved-comparison-preview">
          {cars.slice(0, 3).map((car, index) => (
            <li key={car.id ?? index}><span>{car.brand} {car.model}</span><small>{car.year}</small></li>
          ))}
        </ul>
      </>
    );
  }

  if (kind === "searches") {
    return (
      <ul className="saved-filter-tags">
        {describeFilters(item.filters, t).map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    );
  }

  const car =
    kind === "risks"
      ? item.input
      : favouriteCar(item);

  return (
    <>
      <p>
        {(kind === "favourites" ? [car.generation, car.year] : [car.brand, car.model, car.generation, car.year])
          .filter(Boolean)
          .join(" · ")}
      </p>

      {kind === "favourites" && (
        <strong className="saved-price">
          {car.price_eur == null
            ? t("savedItems.summary.unspecifiedPrice")
            : `${Number(car.price_eur).toLocaleString(i18n.resolvedLanguage || i18n.language)} €`}
        </strong>
      )}

      {kind === "risks" && (
        <span className="saved-score">
          {item.result.anomaly_score == null
            ? t("savedItems.summary.insufficientScoreData")
            : t("savedItems.summary.anomalyScore", {
                score: Number(
                  item.result.anomaly_score
                ).toLocaleString(i18n.resolvedLanguage || i18n.language, {
                  maximumFractionDigits: 1,
                }),
              })}
        </span>
      )}
    </>
  );
}

function itemTitle(kind, item) {
  return kind === "favourites"
    ? [
        favouriteCar(item).brand,
        favouriteCar(item).model,
      ]
        .filter(Boolean)
        .join(" ")
    : item.name;
}

function SavedCollection({ kind }) {
  const { t } = useTranslation();

  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const favourites = useFavourites();

  const favouriteRevision =
    kind === "favourites"
      ? favourites.revision
      : 0;
  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError("");

    listSaved(
      kind,
      page,
      controller.signal
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          if (
            response.pages > 0 &&
            page > response.pages
          ) {
            setPage(response.pages);
          } else {
            setData(response);

            if (
              !response.items.length &&
              page > 1
            ) {
              setPage(1);
            }
          }
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(savedError(err, t));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    kind,
    page,
    revision,
    favouriteRevision,
  ]);

  async function remove(item) {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      if (kind === "favourites") {
        await favourites.remove(item.id);
      } else {
        await deleteSaved(kind, item.id);
      }

      setDeleting(null);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(savedError(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <SavedEditor
        kind={kind}
        item={editing}
        onCancel={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          setRevision((value) => value + 1);
        }}
      />
    );
  }

  return (
    <>
      {error && (
        <p
          className="saved-error"
          role="alert"
        >
          {error}{" "}
          <button
            type="button"
            onClick={() =>
              setRevision((value) => value + 1)
            }
          >
            {t("savedItems.actions.retry")}
          </button>
        </p>
      )}

      {loading ? (
        <p className="saved-loading" role="status">
          {t("savedItems.loading")}
        </p>
      ) : data?.items.length ? (
        <>
          <div className="saved-grid">
            {data.items.map((item) => (
              <SavedEntry
                key={item.id}
                kind={kind}
                item={item}
                title={itemTitle(kind, item)}
                onEdit={() => setEditing(item)}
                onDelete={() => setDeleting(item.id)}
                confirming={deleting === item.id}
                onConfirm={() => remove(item)}
                onCancel={() => setDeleting(null)}
                busy={busy}
              >
                <ItemSummary kind={kind} item={item} />
              </SavedEntry>
            ))}
          </div>
          {data.pages > 1 && (
            <nav
              className="saved-pagination"
              aria-label={t(
                "savedItems.pagination.ariaLabel"
              )}
            >
              <button
                className="saved-secondary"
                disabled={page === 1}
                onClick={() =>
                  setPage(page - 1)
                }
              >
                <SavedIcon name="back" />
                {t(
                  "savedItems.pagination.previous"
                )}
              </button>

              <span>
                {page} / {data.pages}
              </span>

              <button
                className="saved-secondary"
                disabled={
                  page >= data.pages
                }
                onClick={() =>
                  setPage(page + 1)
                }
              >
                {t(
                  "savedItems.pagination.next"
                )}<SavedIcon name="forward" />
              </button>
            </nav>
          )}
        </>
      ) : (
        !error && (
          <div className="saved-empty">
            <div className="saved-empty-symbol"><SavedIcon name={kind} /></div>
            <h2>
              {t("savedItems.empty.title")}
            </h2>

            <p>
              {kind === "risks"
                ? t(
                    "savedItems.empty.risks.description"
                  )
                : kind === "searches"
                  ? t(
                      "savedItems.empty.searches.description"
                    )
                  : kind === "comparisons"
                    ? t("savedItems.empty.comparisons.description")
                    : t(
                        "savedItems.empty.favourites.description"
                      )}
            </p>

            <Link
              className="saved-primary"
              to={
                kind === "risks"
                  ? "/anomaly-risk"
                  : "/listings"
              }
            >
              {kind === "risks"
                ? t(
                    "savedItems.empty.risks.action"
                  )
                : t(
                    "savedItems.empty.browseMarket"
                  )}
            </Link>
          </div>
        )
      )}
    </>
  );
}

function SavedDetail({ kind, id }) {
  const { t, i18n } = useTranslation();

  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const navigate = useNavigate();
  const { loadComparator } = useComparator();
  useEffect(() => {
    const controller = new AbortController();

    setError("");

    getSaved(
      kind,
      id,
      controller.signal
    )
      .then((record) => {
        if (!controller.signal.aborted) {
          if (kind === "comparisons") {
            loadComparator(record.filters.cars);
            navigate("/comparator", { replace: true, state: { savedComparisonId: record.id } });
            return;
          }
          setItem(record);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(savedError(err, t));
        }
      });

    return () => controller.abort();
  }, [kind, id, revision, loadComparator, navigate, t]);

  async function reanalyse() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const record = await reanalyseSaved(id);

      navigate(
        `${savedPaths.risks}/${record.id}`
      );
    } catch (err) {
      setError(savedError(err, t));
    } finally {
      setBusy(false);
    }
  }

  if (editing && item) {
    return (
      <SavedEditor
        kind={kind}
        item={item}
        onCancel={() => setEditing(false)}
        onDone={() => {
          setEditing(false);
          setRevision((value) => value + 1);
        }}
      />
    );
  }

  const backPath = kind === "comparisons" ? "/saved-comparisons" : savedPaths[kind];

  return (
    <>
      <Link
        className="saved-back"
        to={backPath}
      >
        <SavedIcon name="back" />{t("savedItems.detail.back")}
      </Link>

      {error && (
        <p
          className="saved-error"
          role="alert"
        >
          {error}{" "}
          <button
            type="button"
            onClick={() =>
              setRevision((value) => value + 1)
            }
          >
            {t("savedItems.actions.retry")}
          </button>
        </p>
      )}

      {!item ? (
        !error && (
          <p className="saved-loading" role="status">
            {t("savedItems.loading")}
          </p>
        )
      ) : (
        <>
          <section className="saved-card saved-detail-heading">
            <div className="saved-detail-title">
            <h2>
              {itemTitle(kind, item)}
            </h2>

            <p>
              {t("savedItems.detail.savedAt", {
                date: savedDate(item.created_at, i18n.resolvedLanguage || i18n.language),
              })}
            </p>
            </div>

            <div className="saved-actions">
              <button
                className="saved-secondary"
                onClick={() =>
                  setEditing(true)
                }
                disabled={busy}
              >
                <SavedIcon name="edit" />
                {kind === "risks"
                  ? t(
                      "savedItems.actions.rename"
                    )
                  : t(
                      "savedItems.actions.edit"
                    )}
              </button>

              {kind === "searches" && (
                <button
                  className="saved-primary"
                  onClick={() =>
                    navigate("/listings", {
                      state: {
                        savedFilters:
                          item.filters,
                      },
                    })
                  }
                >
                  {t(
                    "savedItems.actions.viewCurrentListings"
                  )}
                  <SavedIcon name="forward" />
                </button>
              )}

              {kind === "comparisons" && (
                <button
                  className="saved-primary"
                  onClick={() => {
                    loadComparator(item.filters.cars);
                    navigate("/comparator");
                  }}
                >
                  {t("savedItems.actions.openComparison")}<SavedIcon name="forward" />
                </button>
              )}

              {kind === "risks" && (
                <button
                  className="saved-primary"
                  disabled={busy}
                  onClick={reanalyse}
                >
                  <SavedIcon name="refresh" />
                  {busy
                    ? t(
                        "savedItems.actions.reanalyzing"
                      )
                    : t(
                        "savedItems.actions.reanalyze"
                      )}
                </button>
              )}
            </div>
          </section>

          {kind === "searches" && (
            <section className="saved-card">
              <h2>
                {t(
                  "savedItems.detail.savedCriteria"
                )}
              </h2>

              <ItemSummary
                kind={kind}
                item={item}
              />

              <p>
                {t(
                  "savedItems.detail.searchDescription"
                )}
              </p>
            </section>
          )}

          {kind === "comparisons" && (
            <section className="saved-card">
              <h2>{t("savedItems.detail.savedComparison")}</h2>
              <ItemSummary kind={kind} item={item} />
              <p>{t("savedItems.detail.comparisonInstruction")}</p>
            </section>
          )}

          {kind === "risks" && (
            <>
              <p className="saved-notice">
                {t(
                  "savedItems.detail.riskNotice"
                )}
              </p>

              <AnomalyRiskResults
                result={item.result}
                vehicle={item.input}
              />
            </>
          )}

          {kind === "favourites" && (
            <>
              <p className="saved-notice">
                {item.available
                  ? t(
                      "savedItems.detail.favouriteAvailable"
                    )
                  : t(
                      "savedItems.detail.favouriteUnavailable"
                    )}
              </p>

              {item.notes && (
                <p className="saved-notice">
                  {t(
                    "savedItems.detail.notes",
                    {
                      notes: item.notes,
                    }
                  )}
                </p>
              )}

              <div className="saved-listing">
                <RemovedListingBadge item={item} />
                <CarCard
                  car={
                    favouriteCar(item)
                  }
                  expanded
                  position="left"
                  onClick={() => navigate(savedPaths.favourites, { replace: true })}
                  showFavourite={false}
                />
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function SavedEditor({
  kind,
  item,
  onCancel,
  onDone,
}) {
  const { t } = useTranslation();

  const [name, setName] = useState(
    item.name ?? ""
  );

  const [notes, setNotes] = useState(
    item.notes ?? ""
  );

  const [filters, setFilters] = useState(() =>
    listingFiltersToForm(item.filters)
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pending = useRef(false);

  async function save(event) {
    event?.preventDefault?.();

    if (pending.current) return;

    if (
      kind !== "favourites" &&
      !name.trim()
    ) {
      setError(
        t("savedItems.editor.nameRequired")
      );
      return;
    }

    if (
      kind === "searches" &&
      listingFilterError(filters, t)
    ) {
      setError(
        listingFilterError(filters, t)
      );
      return;
    }

    pending.current = true;
    setBusy(true);
    setError("");

    const body =
      kind === "favourites"
        ? {
            notes:
              notes.trim() || null,
          }
        : {
            name: name.trim(),
            ...(kind === "searches"
              ? {
                  filters:
                    listingFiltersToApi(
                      filters
                    ),
                }
              : {}),
          };

    try {
      await updateSaved(
        kind,
        item.id,
        body
      );

      onDone();
    } catch (err) {
      setError(savedError(err, t));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="saved-editor">
      <form
        onSubmit={save}
        className="saved-card"
      >
        <h2>
          {kind === "favourites"
            ? t(
                "savedItems.editor.favouriteTitle"
              )
            : kind === "risks"
              ? t(
                  "savedItems.editor.riskTitle"
                )
              : kind === "comparisons"
                ? t("savedItems.editor.comparisonTitle")
                : t(
                    "savedItems.editor.searchTitle"
                  )}
        </h2>

        {kind === "favourites" ? (
          <>
            <label htmlFor="saved-notes">
              {t(
                "savedItems.editor.notes"
              )}
            </label>

            <textarea
              id="saved-notes"
              value={notes}
              maxLength={1000}
              disabled={busy}
              onChange={(event) =>
                setNotes(event.target.value)
              }
            />
          </>
        ) : (
          <>
            <label htmlFor="saved-name">
              {t(
                "savedItems.editor.name"
              )}
            </label>

            <input
              id="saved-name"
              value={name}
              maxLength={120}
              required
              disabled={busy}
              onChange={(event) =>
                setName(event.target.value)
              }
            />
          </>
        )}

        <div className="saved-actions">
          <button
            className="saved-primary"
            disabled={busy}
          >
            {busy
              ? t(
                  "savedItems.actions.saving"
                )
              : t(
                  "savedItems.actions.save"
                )}
          </button>

          <button
            type="button"
            className="saved-secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {t(
              "savedItems.actions.cancel"
            )}
          </button>
        </div>

        {error && (
          <p
            className="saved-error"
            role="alert"
          >
            {error}
          </p>
        )}
      </form>

      {kind === "searches" && (
        <ListingFilters
          filters={filters}
          setFilters={setFilters}
          loading={busy}
          initiallyOpen
          searchLabel={t(
            "savedItems.filters.saveChanges"
          )}
          onReset={() =>
            setFilters(
              listingFiltersToForm()
            )
          }
          onSearch={(override) => {
            if (
              override &&
              !override.nativeEvent &&
              !override.type
            ) {
              setFilters(override);
            } else {
              save();
            }
          }}
        />
      )}
    </section>
  );
}
