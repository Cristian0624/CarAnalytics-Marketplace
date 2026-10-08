import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { searchListingsPaginated } from "../api/listings";
import { createSaved } from "../api/saved_items";
import {
  listingFiltersToApi,
  listingFiltersToForm,
  emptyListingFilters,
  listingFilterError
} from "../utils/listingFilters";

import CarCard from "../components/CarCard";
import ListingFilters from "../components/ListingFilters";
import BackgroundTriangles from "../components/BackgroundTriangles";
import SaveItemButton from "../components/SaveItemButton";
import { useComparator } from "../context/ComparatorContext";
import "./ListingsPage.css";

const ITEMS_PER_PAGE = 45;

function shuffleListings(items) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

export default function ListingsPage() {
  const location = useLocation();
  return (
    <ListingSearch
      key={location.key}
      initialFilters={location.state?.savedFilters}
      initialPage={location.state?.savedPage}
      keepFiltersClosed={location.state?.keepFiltersClosed}
    />
  );
}

function ListingSearch({ initialFilters, initialPage = 1, keepFiltersClosed = false }) {
  const { t } = useTranslation();
  const { comparedCars } = useComparator();

  const [filters, setFilters] = useState(() =>
    listingFiltersToForm(initialFilters)
  );

  // Draft edits never change the filters used for pagination or saving.
  const [query, setQuery] = useState(() => ({
    filters: listingFiltersToApi(listingFiltersToForm(initialFilters)),
    page: initialPage,
    applied: Boolean(initialFilters),
  }));

  const [data, setData] = useState({
    items: [],
    pages: 0,
    total: 0,
  });
  const [expandedCarId, setExpandedCarId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterCount, setFilterCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setGuideModalOpen(false);
      }
    }
    if (guideModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [guideModalOpen]);

  function getSortLabel() {
    if (!query.sort_by) {
      return t("listings.sort.random");
    }
    if (query.sort_by === "score") {
      return query.sort_order === "desc"
        ? t("listings.sort.scoreHighLow")
        : t("listings.sort.scoreLowHigh");
    }
    if (query.sort_by === "price_eur") {
      return query.sort_order === "asc"
        ? t("listings.sort.priceLowHigh")
        : t("listings.sort.priceHighLow");
    }
    if (query.sort_by === "year") {
      return query.sort_order === "desc"
        ? t("listings.sort.yearNewOld")
        : t("listings.sort.yearOldNew");
    }
    if (query.sort_by === "mileage") {
      return query.sort_order === "asc"
        ? t("listings.sort.mileageLowHigh")
        : t("listings.sort.mileageHighLow");
    }
    return t("listings.sort.random");
  }

  const sortLabel = getSortLabel();
  const sortRef = useRef(null);

  useEffect(() => {
    if (!sortOpen) return;

    function handleClickOutside(event) {
      if (sortRef.current && !sortRef.current.contains(event.target)) {
        setSortOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [sortOpen]);

  useEffect(() => {
    let ticking = false;
  
    function updateScrollProgress() {
      const scrollTop =
        window.scrollY || document.documentElement.scrollTop;
  
      const documentHeight =
        document.documentElement.scrollHeight - window.innerHeight;
  
      const progress =
        documentHeight > 0
          ? Math.min(1, Math.max(0, scrollTop / documentHeight))
          : 0;
  
      const progressCircle = document.querySelector(
        ".scroll-top-ring-progress"
      );
  
      if (progressCircle) {
        const circumference = 150.8;
        progressCircle.style.strokeDashoffset =
          circumference * (1 - progress);
      }
  
      setShowScrollTop(scrollTop > 300);
  
      ticking = false;
    }
  
    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollProgress);
        ticking = true;
      }
    }
  
    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });
  
    updateScrollProgress();
  
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    let current = true;

    setLoading(true);
    setError("");

    const validationError = listingFilterError(
      listingFiltersToForm(query.filters), t
    );

    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    const apiFilters = {
      ...query.filters,
      ...(query.sort_by ? { sort_by: query.sort_by } : {}),
      ...(query.sort_order ? { sort_order: query.sort_order } : {}),
    };

    searchListingsPaginated(
      apiFilters,
      query.page,
      ITEMS_PER_PAGE
    )
      .then((response) => {
        if (current) {
          setData({
            ...response,
            items: query.sort_by
              ? response.items
              : shuffleListings(response.items),
          });

          setExpandedCarId(null);
        }
      })
      .catch((err) => {
        if (current) {
          setError(
            err.message || t("listings.errors.load")
          );
        }
      })
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });

    return () => {
      current = false;
    };
  }, [query, t]);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 400);
    }
  
    window.addEventListener("scroll", handleScroll);
  
    handleScroll();
  
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    let current = true;

    const validationError = listingFilterError(filters, t);

    if (validationError) {
      setFilterCount(0);
      return;
    }

    // Debounced: every keystroke/slider tick restarts the timer, so only
    // one count request fires after the user pauses.
    const timer = setTimeout(() => {
      if (!current) return;
      setCountLoading(true);

      searchListingsPaginated(
        listingFiltersToApi(filters),
        1,
        1
      )
        .then((response) => {
          if (current) {
            setFilterCount(response.total);
          }
        })
        .catch(() => {
          if (current) {
            setFilterCount(0);
          }
        })
        .finally(() => {
          if (current) {
            setCountLoading(false);
          }
        });
    }, 400);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [filters]);

  function scrollToResults() {
    document
      .getElementById("listings-results-start")
      ?.scrollIntoView({ behavior: "smooth" });

      
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleSearch(override) {
    const values =
      override &&
      typeof override === "object" &&
      !override.nativeEvent &&
      !override.type
        ? override
        : filters;

    setFilters(values);

    const validationError = listingFilterError(values, t);

    if (validationError) {
      setError(validationError);
      return;
    }

    setQuery({
      filters: listingFiltersToApi(values),
      page: 1,
      applied: true,
    });

    scrollToResults();
  }

  function handleReset() {
    setFilters(emptyListingFilters());

    setQuery({
      filters: {},
      page: 1,
      applied: false,
      sort_by: undefined,
      sort_order: undefined,
    });

    setSortOpen(false);
  }

  function changePage(page) {
    setQuery((current) => ({
      ...current,
      page,
    }));

    scrollToResults();
  }

  function changeSort(sort_by, sort_order) {
    setQuery((prev) => ({
      ...prev,
      sort_by,
      sort_order,
      page: 1,
    }));

    setSortOpen(false);
  }

  const rows = [];

  for (let index = 0; index < data.items.length; index += 3) {
    rows.push(data.items.slice(index, index + 3));
  }

  const saveAction =
    !loading &&
    !error && (
      <SaveItemButton
        key={JSON.stringify(query.filters)}
        label={t("listings.saveFilters")}
        defaultName={
          [
            ...(query.filters.brand ?? []),
            ...(query.filters.model ?? []),
          ].join(" ") || t("listings.mySearch")
        }
        path="/saved-searches"
        onSave={(name) =>
          createSaved("searches", {
            name,
            filters: query.filters,
          })
        }
      />
    );

  return (
    <>
      <BackgroundTriangles />

      <main className="home-main">
        <header className="marketplace-page-header">
          <div className="marketplace-title-wrapper">
            <h1 className="marketplace-page-title">
              {t("listings.title")}
            </h1>

            <button
              type="button"
              className="marketplace-guide-btn"
              onClick={() => setGuideModalOpen(true)}
              aria-label={t("listings.guide.hintsTitle")}
              title={t("listings.guide.hintsTitle")}
            >
              ?
            </button>
          </div>

          <p className="marketplace-page-subtitle">
            {t("listings.guide.subtitle")}
          </p>
        </header>

        {guideModalOpen && (
          <div className="guide-modal-overlay" onClick={() => setGuideModalOpen(false)}>
            <div className="guide-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <button
                type="button"
                className="guide-modal-close"
                onClick={() => setGuideModalOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>

              <div className="guide-modal-header">
                <h3 className="guide-modal-title">
                  {t("listings.guide.hintsTitle")}
                </h3>
              </div>

              <ol className="guide-modal-hints">
                {Array.isArray(t("listings.guide.hints", { returnObjects: true }))
                  ? t("listings.guide.hints", { returnObjects: true }).map((hint, idx) => (
                      <li key={idx}>{hint}</li>
                    ))
                  : [0, 1, 2].map((idx) => (
                      <li key={idx}>{t(`listings.guide.hints.${idx}`)}</li>
                    ))}
              </ol>
            </div>
          </div>
        )}

        <ListingFilters
          floating={true}
          filters={filters}
          setFilters={setFilters}
          onSearch={handleSearch}
          onReset={handleReset}
          loading={loading}
          actions={saveAction}
          initiallyOpen={Boolean(initialFilters) && !keepFiltersClosed}
          resultCount={filterCount}
          countLoading={countLoading}
          sortingActive={Boolean(query.sort_by)}
          barExtras={
            <div
              className="lf-sort"
              ref={sortRef}
            >
              <button
                type="button"
                className={`lf-toggle lf-sort-toggle ${sortOpen ? "open" : ""}`}
                onClick={() => setSortOpen((v) => !v)}
                title={sortLabel}
                aria-expanded={sortOpen}
              >
                <img
                  src="/sort_button.png"
                  alt=""
                  className="lf-button-icon"
                />
                <span className="lf-btn-text">{sortLabel}</span>
                <span
                  className="lf-arrow"
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>

              {sortOpen && (
                <div className="lf-sort-menu">
                  <button
                    type="button"
                    className={!query.sort_by ? "active" : ""}
                    onClick={() =>
                      changeSort(
                        undefined,
                        undefined,
                        t("listings.sort.random")
                      )
                    }
                  >
                    {t("listings.sort.random")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "score" &&
                      query.sort_order === "desc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "score",
                        "desc",
                        t("listings.sort.scoreHighLow")
                      )
                    }
                  >
                    {t("listings.sort.scoreHighLow")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "score" &&
                      query.sort_order === "asc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "score",
                        "asc",
                        t("listings.sort.scoreLowHigh")
                      )
                    }
                  >
                    {t("listings.sort.scoreLowHigh")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "price_eur" &&
                      query.sort_order === "asc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "price_eur",
                        "asc",
                        t("listings.sort.priceLowHigh")
                      )
                    }
                  >
                    {t("listings.sort.priceLowHigh")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "price_eur" &&
                      query.sort_order === "desc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "price_eur",
                        "desc",
                        t("listings.sort.priceHighLow")
                      )
                    }
                  >
                    {t("listings.sort.priceHighLow")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "year" &&
                      query.sort_order === "desc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "year",
                        "desc",
                        t("listings.sort.yearNewOld")
                      )
                    }
                  >
                    {t("listings.sort.yearNewOld")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "year" &&
                      query.sort_order === "asc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "year",
                        "asc",
                        t("listings.sort.yearOldNew")
                      )
                    }
                  >
                    {t("listings.sort.yearOldNew")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "mileage" &&
                      query.sort_order === "asc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "mileage",
                        "asc",
                        t("listings.sort.mileageLowHigh")
                      )
                    }
                  >
                    {t("listings.sort.mileageLowHigh")}
                  </button>

                  <button
                    type="button"
                    className={
                      query.sort_by === "mileage" &&
                      query.sort_order === "desc"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changeSort(
                        "mileage",
                        "desc",
                        t("listings.sort.mileageHighLow")
                      )
                    }
                  >
                    {t("listings.sort.mileageHighLow")}
                  </button>
                </div>
              )}
            </div>
          }
          floatingCompare={
            <Link 
              to="/comparator" 
              state={{ savedFilters: query.filters, savedPage: query.page }} 
              className="floating-compare-btn"
              title={t("comparatorPage.openComparison", { count: comparedCars.length })}
            >
              <svg
                className="compare-arrows-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 7H4" />
                <path d="m16 3 4 4-4 4" />
                <path d="M4 17h16" />
                <path d="m8 21-4-4 4-4" />
              </svg>
              <span className="compare-btn-text">
                {t("listings.compareButton", "Compare")}
              </span>
              {comparedCars.length > 0 && (
                <span className="compare-count-badge">
                  {comparedCars.length}
                </span>
              )}
            </Link>
          }
        />


        <div
          id="listings-results-start"
          style={{ scrollMarginTop: "20px" }}
        />

        {loading && (
          <div
            className="marketplace-loading"
            role="status"
          >
            {t("listings.loading")}
          </div>
        )}

        {!loading && error && (
          <div
            className="marketplace-error"
            role="alert"
          >
            <p>{error}</p>

            <button
              onClick={() =>
                setQuery((current) => ({ ...current }))
              }
            >
              {t("listings.errorRetry")}
            </button>
          </div>
        )}

        {!loading &&
          !error &&
          data.items.length === 0 && (
            <div className="marketplace-empty">
              <h2>{t("listings.empty.title")}</h2>
              <p>{t("listings.empty.description")}</p>
            </div>
          )}

        {!loading &&
          !error &&
          data.items.length > 0 && (
            <>
              <div className="cars-marketplace">
                {rows.map((row, rowIndex) => {
                  const expandedIndex = row.findIndex(
                    (car) => car.id === expandedCarId
                  );

                  const visibleCars = row;

                  return (
                    <div
                      className="car-row"
                      key={rowIndex}
                    >
                      {visibleCars.map((car, index) => (
                        <CarCard
                          key={car.id}
                          car={car}
                          expanded={
                            car.id === expandedCarId
                          }
                          peeking={
                            expandedIndex >= 0 &&
                            car.id !== expandedCarId
                          }
                          position={
                            [
                              "left",
                              "middle",
                              "right",
                            ][
                              expandedIndex >= 0
                                ? expandedIndex
                                : index
                            ]
                          }
                          onClick={() =>
                            setExpandedCarId((current) =>
                              current === car.id
                                ? null
                                : car.id
                            )
                          }
                        />
                      ))}
                    </div>
                  );
                })}
              </div>

              <nav
                className="pagination"
                aria-label={t(
                  "listings.pagination.ariaLabel"
                )}
              >
                <button
                  className="pagination-button"
                  disabled={query.page === 1}
                  onClick={() =>
                    changePage(query.page - 1)
                  }
                >
                  ← {t("listings.pagination.previous")}
                </button>

                <span className="pagination-info">
                  {t("listings.pagination.page", {
                    current: query.page,
                    total: data.pages,
                  })}
                </span>

                <button
                  className="pagination-button"
                  disabled={query.page >= data.pages}
                  onClick={() =>
                    changePage(query.page + 1)
                  }
                >
                  {t("listings.pagination.next")} →
                </button>
              </nav>
            </>
            
          )}

          {showScrollTop && (
            <button
              type="button"
              className={`scroll-top-button ${
                showScrollTop ? "is-visible" : ""
              }`}
              onClick={scrollToTop}
              aria-label={t("listings.scrollTop", "Scroll to top")}
            >
              <svg
                className="scroll-top-ring"
                viewBox="0 0 56 56"
                aria-hidden="true"
              >
                <circle
                  className="scroll-top-ring-track"
                  cx="28"
                  cy="28"
                  r="24"
                />

                <circle
                  className="scroll-top-ring-progress"
                  cx="28"
                  cy="28"
                  r="24"
                />
              </svg>

              <svg
                className="scroll-top-icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 6L6 12" />
                <path d="M12 6L18 12" />
                <path d="M12 12L6 18" />
                <path d="M12 12L18 18" />
              </svg>
            </button>
          )}
      </main>
    </>
  );
}
