import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./CarCard.css";
import { getLogoFileName, getScoreClass } from "../utils/carCard";
import FavouriteButton from "./FavouriteButton";
import { assessAnomalyRisk } from "../api/anomaly_risk";
import { getRecommendationsForCar } from "../api/recommendations";
import AnomalyRiskResults from "./AnomalyRiskResults";
import { buildRiskPayload } from "../utils/anomalyRisk";
import { createPortal } from "react-dom";
import { useComparator } from "../context/ComparatorContext";


function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return number.toLocaleString();
}

function CarCard({
  car,
  expanded,
  position,
  onClick,
  showFavourite = true,
  peeking = false
}) {
  const { t } = useTranslation();

  const [currentCar, setCurrentCar] = useState(car);
  const { comparedCars, addCar, removeCar } = useComparator();
  const isCompared = comparedCars.some(c => c.id === currentCar.id);

  useEffect(() => {
    setCurrentCar(car);
  }, [car]);

  const [isClosing, setIsClosing] = useState(false);
  const cardRef = useRef(null);
  const modalRef = useRef(null);
  const score = Number(currentCar.score);

  const [viewMode, setViewMode] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [riskResult, setRiskResult] = useState(null);
  const [loadingView, setLoadingView] = useState(false);
  const [viewError, setViewError] = useState("");
  // Cache fetched views per car so toggling tabs never refetches.
  const viewCache = useRef({});

  // Handle outside click when expanded
  useEffect(() => {
    if (!expanded || isClosing) return;

    function handleClickOutside(event) {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleClose(event);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded, isClosing]);

  useEffect(() => {
    if (!expanded) {
      setViewMode(null);
      setCurrentCar(car);
    }
  }, [expanded, car]);

  useEffect(() => {
    if (!expanded) return;

    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [expanded]);

  function handleClose(event) {
    if (event) {
      event.stopPropagation();
    }

    if (!expanded || isClosing) return;

    setIsClosing(true);

    setTimeout(() => {
      setIsClosing(false);
      onClick();
    }, 200);
  }

  function handleCardClick(event) {
    if (!expanded) {
      onClick();
    }
  }

  function openOriginalListing(event) {
    event.stopPropagation();

    if (currentCar.url) {
      window.open(currentCar.url, "_blank", "noopener,noreferrer");
    }
  }

  async function handleViewRecommendations(event) {
    event.stopPropagation();

    if (viewMode === "recommendations") {
      setViewMode(null);
      return;
    }

    setViewMode("recommendations");
    setVisibleCount(12);
    setViewError("");

    const cached = viewCache.current[`${currentCar.id}:recommendations`];
    if (cached) {
      setRecommendations(cached);
      return;
    }

    setLoadingView(true);

    try {
      const data = await getRecommendationsForCar(currentCar.id);
      const rawList = data.recommendations || [];
      const sortedList = [...rawList].sort((a, b) => {
        const scoreA = a.score !== null && a.score !== undefined ? Number(a.score) : -Infinity;
        const scoreB = b.score !== null && b.score !== undefined ? Number(b.score) : -Infinity;
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return (b.similarity_score || 0) - (a.similarity_score || 0);
      });
      viewCache.current[`${currentCar.id}:recommendations`] = sortedList;
      setRecommendations(sortedList);
    } catch (err) {
      setViewError(t("carCard.errors.recommendations"));
    } finally {
      setLoadingView(false);
    }
  }

  async function handleViewRisk(event) {
    event.stopPropagation();

    if (viewMode === "risk") {
      setViewMode(null);
      return;
    }

    setViewMode("risk");
    setViewError("");

    const cachedRisk = viewCache.current[`${currentCar.id}:risk`];
    if (cachedRisk) {
      setRiskResult(cachedRisk);
      return;
    }

    setLoadingView(true);

    try {
      const payloadForm = {
        brand: currentCar.brand,
        model: currentCar.model,
        generation: currentCar.generation,
        price: currentCar.price_eur,
        year: currentCar.year,
        mileage: currentCar.mileage,
        engine: currentCar.engine_size,
        fuel_type: currentCar.fuel_type,
        gearbox: currentCar.gearbox,
        drivetrain: currentCar.drivetrain,
        body_type: currentCar.body_type
      };

      const payload = buildRiskPayload(payloadForm);
      payload.listing_id = currentCar.id;

      const res = await assessAnomalyRisk(payload);
      viewCache.current[`${currentCar.id}:risk`] = res;
      setRiskResult(res);
    } catch (err) {
      setViewError(t("carCard.errors.risk"));
    } finally {
      setLoadingView(false);
    }
  }

  return (
    <>
      <article
        ref={cardRef}
        className="car-card"
        onClick={handleCardClick}
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();

            if (!expanded) {
              onClick();
            }
          }
        }}
      >
        <div className="car-card-content">
          <div className="car-card-title-row">
            <div>
              <h3>
                {formatValue(currentCar.brand)}{" "}
                {formatValue(currentCar.model)}
              </h3>

              {currentCar.generation && (
                <p className="car-generation">
                  {typeof currentCar.generation === "string"
                    ? currentCar.generation.trim()
                    : currentCar.generation}
                </p>
              )}
            </div>

            <img
              src={`/logos/${getLogoFileName(currentCar.brand)}`}
              alt={currentCar.brand}
              className="collapsed-car-logo" loading="lazy" decoding="async"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = "none";
              }}
            />
          </div>

          <div className="car-details">
            <span>{formatValue(currentCar.year)}</span>
            <span>
              {formatNumber(currentCar.mileage)} {t("carCard.mileageUnit")}
            </span>
          </div>

          <div className="car-card-bottom">
            <strong>€{formatNumber(currentCar.price_eur)}</strong>

            {currentCar.score !== null && currentCar.score !== undefined && (
              <span
                className={`score-badge ${getScoreClass(score)}`}
                title={t("carCard.scoreTooltip", { score: score.toFixed(0) })}
              >
                {score.toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </article>

      {expanded &&
        createPortal(
          <div
            className="filter-modal-overlay car-card-modal-overlay"
            onClick={handleClose}
          >
            <article
              ref={modalRef}
              className={`car-modal-content ${
                isClosing ? "car-card-collapsing" : ""
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="car-expanded-content">
                {showFavourite && <FavouriteButton car={currentCar} />}
                
                <button
                  className={`comparator-button ${isCompared ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    isCompared ? removeCar(currentCar.id) : addCar(currentCar);
                  }}
                  title={
                    isCompared
                      ? t("comparatorPage.removeFromComparison")
                      : t("comparatorPage.addToComparison")
                  }
                >
                  <svg
                    className="comparator-button-icon"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {isCompared ? (
                      <polyline points="20 6 9 17 4 12" />
                    ) : (
                      <>
                        <path d="M17 2l4 4-4 4" />
                        <path d="M3 6h18" />
                        <path d="M7 22l-4-4 4-4" />
                        <path d="M21 18H3" />
                      </>
                    )}
                  </svg>
                  <span>
                    {isCompared
                      ? t("comparatorPage.compared")
                      : t("comparatorPage.compare")}
                  </span>
                </button>

                <button
                  className="original-listing-button"
                  onClick={openOriginalListing}
                  title={t("carCard.openOriginalListingTitle")}
                >
                  <img
                    src="/999-logo.png"
                    alt="999.md"
                    className="button-logo-999" loading="lazy" decoding="async"
                  />
                  <span>{t("carCard.openOriginalListing")}</span>
                </button>

                <button
                  className="close-card-button"
                  onClick={handleClose}
                  title={t("carCard.close")}
                >
                  ✕
                </button>

                <div className="expanded-header">
                  <div style={{ maxWidth: "50%" }}>
                    <h2
                      style={{
                        textTransform: "uppercase",
                        margin: "0 0 4px 0",
                        fontSize: "24px",
                        color: "#17202A",
                        fontWeight: 800,
                        textAlign: "left"
                      }}
                    >
                      {formatValue(currentCar.brand)}{" "}
                      {formatValue(currentCar.model)}

                      {currentCar.year ? (
                        <span
                          style={{
                            display: "block",
                            fontSize: "20px",
                            fontWeight: 700,
                            marginTop: "4px"
                          }}
                        >
                          ({currentCar.year})
                        </span>
                      ) : (
                        ""
                      )}
                    </h2>

                    {currentCar.generation && (
                      <p
                        style={{
                          margin: "0 0 12px 0",
                          color: "#54666E",
                          textAlign: "left"
                        }}
                      >
                        {typeof currentCar.generation === "string"
                          ? currentCar.generation.trim()
                          : currentCar.generation}
                      </p>
                    )}

                    <div className="expanded-price">
                      <span>{t("carCard.price")}</span>
                      <strong>€{formatNumber(currentCar.price_eur)}</strong>
                    </div>
                  </div>

                  <img
                    src={`/logos/${getLogoFileName(currentCar.brand)}`}
                    alt={currentCar.brand}
                    className="expanded-car-logo" loading="lazy" decoding="async"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.style.display = "none";
                    }}
                  />

                  {currentCar.score !== null &&
                    currentCar.score !== undefined && (
                      <div
                        className={`expanded-score-circular ${getScoreClass(
                          score
                        )}`}
                      >
                        <span className="score-label">
                          {t("carCard.accountScore")}
                        </span>

                        <div
                          className="score-circle"
                          style={{
                            "--progress": `${Math.min(
                              100,
                              Math.max(0, (score / 80) * 100)
                            )}%`
                          }}
                        >
                          <span className="score-main">
                            {score.toFixed(0)}
                          </span>

                          <span className="score-sub">
                            {score.toFixed(0)}/80
                          </span>
                        </div>
                      </div>
                    )}
                </div>

                <div className="expanded-main">
                  <div className="specs-container">
                    <div className="spec-group">
                      <h4>{t("carCard.generalData")}</h4>

                      <div className="spec-row">
                        <div className="spec-item">
                          <span>{t("carCard.brand")}</span>
                          <strong>{formatValue(currentCar.brand)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.model")}</span>
                          <strong>{formatValue(currentCar.model)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.body")}</span>
                          <strong>{formatValue(currentCar.body_type)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.registration")}</span>
                          <strong>
                            {formatValue(currentCar.registration_country)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="spec-group">
                      <h4>{t("carCard.performance")}</h4>

                      <div className="spec-row">
                        <div className="spec-item">
                          <span>{t("carCard.horsepower")}</span>
                          <strong>
                            {formatValue(currentCar.horsepower)}{" "}
                            {currentCar.horsepower
                              ? t("carCard.horsepowerUnit")
                              : ""}
                          </strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.gearbox")}</span>
                          <strong>{formatValue(currentCar.gearbox)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.drivetrain")}</span>
                          <strong>{formatValue(currentCar.drivetrain)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.fuel")}</span>
                          <strong>{formatValue(currentCar.fuel_type)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="spec-group">
                      <h4>{t("carCard.conditionDetails")}</h4>

                      <div className="spec-row">
                        <div className="spec-item">
                          <span>{t("carCard.year")}</span>
                          <strong>{formatValue(currentCar.year)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.mileage")}</span>
                          <strong>
                            {formatNumber(currentCar.mileage)}{" "}
                            {currentCar.mileage
                              ? t("carCard.mileageUnit")
                              : ""}
                          </strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.condition")}</span>
                          <strong>{formatValue(currentCar.state)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.engine")}</span>
                          <strong>
                            {formatValue(currentCar.engine_size)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="spec-group">
                      <h4>{t("carCard.configuration")}</h4>

                      <div className="spec-row">
                        <div className="spec-item">
                          <span>{t("carCard.doors")}</span>
                          <strong>{formatValue(currentCar.doors)}</strong>
                        </div>

                        <div className="spec-item">
                          <span>{t("carCard.seats")}</span>
                          <strong>{formatValue(currentCar.seats)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {currentCar.description && (
                    <div
                      className="information-group"
                      style={{ marginTop: "24px" }}
                    >
                      <h4
                        style={{
                          fontSize: "11px",
                          textTransform: "uppercase",
                          marginBottom: "12px",
                          color: "#111",
                          fontWeight: 700
                        }}
                      >
                        {t("carCard.description")}
                      </h4>

                      <p
                        className="car-description"
                        style={{
                          margin: 0,
                          color: "#555",
                          lineHeight: "1.6"
                        }}
                      >
                        {currentCar.description}
                      </p>
                    </div>
                  )}
                </div>

                <div className="car-card-actions">
                  <button
                    className={`action-btn ${
                      viewMode === "recommendations" ? "active" : ""
                    }`}
                    onClick={handleViewRecommendations}
                  >
                    {t("carCard.recommendations")}
                  </button>

                  <button
                    className={`action-btn ${
                      viewMode === "risk" ? "active" : ""
                    }`}
                    onClick={handleViewRisk}
                  >
                    {t("carCard.riskAnalysis")}
                  </button>
                </div>

                {viewMode && (
                  <div className="car-card-extra-view">
                    {loadingView && (
                      <div className="loading-state">
                        {t("carCard.loading")}
                      </div>
                    )}

                    {viewError && (
                      <div className="error-state">{viewError}</div>
                    )}

                    {!loadingView &&
                      !viewError &&
                      viewMode === "recommendations" && (
                        <div className="recommendations-container">
                          <h3
                            style={{
                              marginTop: 0,
                              marginBottom: "16px",
                              fontSize: "18px",
                              color: "#111"
                            }}
                          >
                            {t("carCard.recommendationsTitle")}
                          </h3>

                          {recommendations.length > 0 ? (
                            <>
                              <div className="recommendations-mini-grid">
                                {recommendations
                                  .slice(0, visibleCount)
                                  .map((c) => (
                                    <article
                                      key={c.id}
                                      className="car-card"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setCurrentCar(c);
                                        setViewMode(null);
                                      }}
                                      style={{
                                        cursor: "pointer",
                                        margin: 0
                                      }}
                                    >
                                      <div className="car-card-content">
                                        <div className="car-card-title-row">
                                          <div>
                                            <h3>
                                              {formatValue(c.brand)}{" "}
                                              {formatValue(c.model)}
                                            </h3>

                                            {c.generation && (
                                              <p className="car-generation">
                                                {typeof c.generation ===
                                                "string"
                                                  ? c.generation.trim()
                                                  : c.generation}
                                              </p>
                                            )}
                                          </div>

                                          <img
                                            src={`/logos/${getLogoFileName(
                                              c.brand
                                            )}`}
                                            alt={c.brand}
                                            className="collapsed-car-logo" loading="lazy" decoding="async"
                                            onError={(ev) => {
                                              ev.target.onerror = null;
                                              ev.target.style.display = "none";
                                            }}
                                          />
                                        </div>

                                        <div className="car-details">
                                          <span>{formatValue(c.year)}</span>
                                          <span>
                                            {formatNumber(c.mileage)}{" "}
                                            {t("carCard.mileageUnit")}
                                          </span>
                                        </div>

                                        <div className="car-card-bottom">
                                          <strong>
                                            €{formatNumber(c.price_eur)}
                                          </strong>

                                          {c.score !== null &&
                                            c.score !== undefined && (
                                              <span
                                                className={`score-badge ${getScoreClass(
                                                  c.score
                                                )}`}
                                              >
                                                {Number(c.score).toFixed(0)}
                                              </span>
                                            )}
                                        </div>
                                      </div>
                                    </article>
                                  ))}
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: "16px",
                                  marginTop: "24px"
                                }}
                              >
                                <button
                                  className="action-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();

                                    if (visibleCount <= 12) {
                                      setViewMode(null);
                                    } else {
                                      setVisibleCount((v) => v - 12);
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    padding: "12px",
                                    background: "#f3f4f6",
                                    color: "black",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    fontWeight: 600
                                  }}
                                >
                                  {visibleCount <= 12
                                    ? t("carCard.collapse")
                                    : t("carCard.showLess")}
                                </button>

                                {visibleCount < recommendations.length && (
                                  <button
                                    className="action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVisibleCount((v) => v + 12);
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: "12px",
                                      background: "#17202A",
                                      color: "#fff",
                                      border: "1px solid #17202A",
                                      borderRadius: "8px",
                                      cursor: "pointer",
                                      fontWeight: 600
                                    }}
                                  >
                                    {t("carCard.showMore")}
                                  </button>
                                )}
                              </div>
                            </>
                          ) : (
                            <p>{t("carCard.noRecommendations")}</p>
                          )}
                        </div>
                      )}

                    {!loadingView &&
                      !viewError &&
                      viewMode === "risk" &&
                      riskResult && (
                        <div
                          className="risk-container"
                          style={{
                            background: "var(--brand-teal-tint)",
                            padding: "16px",
                            borderRadius: "12px",
                            marginTop: "16px",
                            border: "1px solid var(--brand-teal)"
                          }}
                        >
                          <AnomalyRiskResults
                            result={riskResult}
                            vehicle={{
                              ...car,
                              price: currentCar.price_eur,
                              engine: currentCar.engine_size
                            }}
                          />
                        </div>
                      )}
                  </div>
                )}
              </div>
            </article>
          </div>,
          document.body
        )}
    </>
  );
}

export default CarCard;


