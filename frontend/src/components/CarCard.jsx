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

function RecommendationCard({ car, onClick, isCompared, t }) {
  const [imgFailed, setImgFailed] = useState(false);
  const score = Number(car.score);

  return (
    <article
      className="car-card recommendation-card"
      onClick={onClick}
      style={{ cursor: "pointer", margin: 0 }}
    >
      <div className="car-card-image-wrap">
        {isCompared && (
          <div
            className="car-card-compare-badge"
            title={t("comparatorPage.compared")}
          >
            <svg
              viewBox="0 0 24 24"
              width="12"
              height="12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" />
            </svg>
            <span>{t("comparatorPage.compared")}</span>
          </div>
        )}

        {car.image_url && !imgFailed ? (
          <img
            src={car.image_url}
            alt={`${car.brand || ""} ${car.model || ""}`}
            className="car-card-image"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="car-card-image-placeholder">
            <img
              src={`/logos/${getLogoFileName(car.brand)}`}
              alt={car.brand}
              className="car-card-brand-fallback-logo"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        )}
      </div>

      <div className="car-card-content">
        <div className="car-card-title-row">
          <div>
            <h3>
              {formatValue(car.brand)} {formatValue(car.model)}
            </h3>

            {car.generation && (
              <p className="car-generation">
                {typeof car.generation === "string"
                  ? car.generation.trim()
                  : car.generation}
              </p>
            )}
          </div>

          <img
            src={`/logos/${getLogoFileName(car.brand)}`}
            alt={car.brand}
            className="collapsed-car-logo"
            loading="lazy"
            decoding="async"
            onError={(ev) => {
              ev.target.onerror = null;
              ev.target.style.display = "none";
            }}
          />
        </div>

        <div className="car-details">
          <span>{formatValue(car.year)}</span>
          <span>
            {formatNumber(car.mileage)} {t("carCard.mileageUnit")}
          </span>
        </div>

        <div className="car-card-bottom">
          <strong>€{formatNumber(car.price_eur)}</strong>

          {car.score !== null && car.score !== undefined && (
            <span className={`score-badge ${getScoreClass(score)}`}>
              {score.toFixed(0)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function CarCard({
  car,
  expanded,
  position,
  onClick,
  showFavourite = true,
  peeking = false,
  fadeDelay = 0
}) {
  const { t } = useTranslation();

  const [currentCar, setCurrentCar] = useState(car);
  const [carHistory, setCarHistory] = useState([]);
  const { comparedCars, addCar, removeCar } = useComparator();
  const isCompared = comparedCars.some(c => c.id === currentCar.id);

  const [cardImageFailed, setCardImageFailed] = useState(false);
  const [modalImageFailed, setModalImageFailed] = useState(false);

  useEffect(() => {
    setCurrentCar(car);
    setCarHistory([]);
    setCardImageFailed(false);
    setModalImageFailed(false);
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
      setCarHistory([]);
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
      setCurrentCar(car);
      setCarHistory([]);
      setViewMode(null);
    }, 200);
  }

  function handleSelectRecommendedCar(e, recommendedCar) {
    e.stopPropagation();
    setCarHistory((prev) => [...prev, currentCar]);
    setCurrentCar(recommendedCar);
    setModalImageFailed(false);
    setViewMode(null);
    if (modalRef.current) {
      modalRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleGoBack(e) {
    if (e) e.stopPropagation();
    if (carHistory.length === 0) return;
    const previousCar = carHistory[carHistory.length - 1];
    setCarHistory((prev) => prev.slice(0, -1));
    setCurrentCar(previousCar);
    setModalImageFailed(false);
    setViewMode(null);
    if (modalRef.current) {
      modalRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleBackToOriginal(e) {
    if (e) e.stopPropagation();
    if (carHistory.length === 0) return;
    const originalCar = carHistory[0];
    setCarHistory([]);
    setCurrentCar(originalCar);
    setModalImageFailed(false);
    setViewMode(null);
    if (modalRef.current) {
      modalRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
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
        className="car-card car-card-fade-in"
        style={{ "--card-delay": `${fadeDelay}ms` }}
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
        <div className="car-card-image-wrap">
          {isCompared && (
            <div
              className="car-card-compare-badge"
              title={t("comparatorPage.compared")}
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" />
              </svg>
              <span>{t("comparatorPage.compared")}</span>
            </div>
          )}

          {currentCar.image_url && !cardImageFailed ? (
            <img
              src={currentCar.image_url}
              alt={`${currentCar.brand || ""} ${currentCar.model || ""}`}
              className="car-card-image"
              loading="lazy"
              decoding="async"
              onError={() => setCardImageFailed(true)}
            />
          ) : (
            <div className="car-card-image-placeholder">
              <img
                src={`/logos/${getLogoFileName(currentCar.brand)}`}
                alt={currentCar.brand}
                className="car-placeholder-logo"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
          )}
        </div>

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
                <div className="car-modal-top-bar">
                  <div className="car-modal-top-left">
                    {carHistory.length > 0 && (
                      <button
                        type="button"
                        className="car-modal-back-button"
                        onClick={handleGoBack}
                        title={t("carCard.backToPrevious", {
                          car: `${carHistory[carHistory.length - 1]?.brand || ""} ${carHistory[carHistory.length - 1]?.model || ""}`
                        })}
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="19" y1="12" x2="5" y2="12" />
                          <polyline points="12 19 5 12 12 5" />
                        </svg>
                        <span>
                          {t("carCard.backToPrevious", {
                            car: `${carHistory[carHistory.length - 1]?.brand || ""} ${carHistory[carHistory.length - 1]?.model || ""}`
                          })}
                        </span>
                      </button>
                    )}
                    {showFavourite && <FavouriteButton car={currentCar} />}
                  </div>

                  <div className="car-modal-top-actions">
                    <button
                      type="button"
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
                        width="16"
                        height="16"
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
                      type="button"
                      className="original-listing-button"
                      onClick={openOriginalListing}
                      title={t("carCard.openOriginalListingTitle")}
                    >
                      <img
                        src="/999-logo.png"
                        alt="999.md"
                        className="button-logo-999"
                        loading="lazy"
                        decoding="async"
                      />
                      <span>{t("carCard.openOriginalListing")}</span>
                    </button>

                    <button
                      type="button"
                      className="close-card-button"
                      onClick={handleClose}
                      title={t("carCard.close")}
                      aria-label={t("carCard.close")}
                    >
                      <svg
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
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {carHistory.length > 0 && (
                  <div className="modal-history-banner">
                    <div className="modal-history-info">
                      <span className="modal-history-badge">
                        {t("carCard.viewingRecommendation")}
                      </span>
                      <span className="modal-history-text">
                        {t("carCard.navigatedFrom", {
                          car: `${carHistory[0]?.brand || ""} ${carHistory[0]?.model || ""}`
                        })}
                      </span>
                    </div>

                    <div className="modal-history-actions">
                      {carHistory.length > 1 && (
                        <button
                          type="button"
                          className="modal-history-btn-secondary"
                          onClick={handleGoBack}
                          title={t("carCard.backToPrevious", {
                            car: `${carHistory[carHistory.length - 1]?.brand || ""} ${carHistory[carHistory.length - 1]?.model || ""}`
                          })}
                        >
                          ← {t("carCard.previous")}
                        </button>
                      )}

                      <button
                        type="button"
                        className="modal-history-btn-primary"
                        onClick={handleBackToOriginal}
                        title={t("carCard.backToOriginal", {
                          car: `${carHistory[0]?.brand || ""} ${carHistory[0]?.model || ""}`
                        })}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="9 14 4 9 9 4" />
                          <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
                        </svg>
                        <span>
                          {t("carCard.backToOriginal", {
                            car: `${carHistory[0]?.brand || ""} ${carHistory[0]?.model || ""}`
                          })}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="expanded-hero">
                  <div className="expanded-hero-photo-wrap">
                    {isCompared && (
                      <span className="car-card-compare-badge hero-compare-badge">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        {t("comparatorPage.compared")}
                      </span>
                    )}

                    {currentCar.image_url && !modalImageFailed ? (
                      <div className="expanded-hero-photo-box">
                        <img
                          src={currentCar.image_url}
                          alt={`${currentCar.brand || ""} ${currentCar.model || ""}`}
                          className="expanded-hero-photo"
                          loading="lazy"
                          decoding="async"
                          onError={() => setModalImageFailed(true)}
                        />
                        <a
                          href={currentCar.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="expanded-photo-zoom-btn"
                          title={t("carCard.viewFullPhoto")}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="15 3 21 3 21 9" />
                            <polyline points="9 21 3 21 3 15" />
                            <line x1="21" y1="3" x2="14" y2="10" />
                            <line x1="3" y1="21" x2="10" y2="14" />
                          </svg>
                          <span>{t("carCard.viewFullPhoto")}</span>
                        </a>
                      </div>
                    ) : (
                      <div className="expanded-hero-photo-placeholder">
                        <img
                          src={`/logos/${getLogoFileName(currentCar.brand)}`}
                          alt={currentCar.brand}
                          className="expanded-placeholder-logo"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.target.style.display = "none";
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="expanded-hero-details">
                    <div className="expanded-hero-headline">
                      <div className="expanded-hero-title-group">
                        <h2 className="expanded-hero-title">
                          {formatValue(currentCar.brand)}{" "}
                          {formatValue(currentCar.model)}
                        </h2>

                        {currentCar.generation && (
                          <p className="expanded-hero-gen">
                            {typeof currentCar.generation === "string"
                              ? currentCar.generation.trim()
                              : currentCar.generation}
                          </p>
                        )}
                      </div>

                      <img
                        src={`/logos/${getLogoFileName(currentCar.brand)}`}
                        alt={currentCar.brand}
                        className="expanded-hero-brand-logo"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = "none";
                        }}
                      />
                    </div>

                    <div className="expanded-hero-chips">
                      {currentCar.year && (
                        <span className="hero-chip" title={t("carCard.year")}>
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span>{formatValue(currentCar.year)}</span>
                        </span>
                      )}

                      {currentCar.mileage !== null &&
                        currentCar.mileage !== undefined && (
                          <span className="hero-chip" title={t("carCard.mileage")}>
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M12 2v2M12 20v2m10-10h-2M4 12H2m15.07-7.07-1.41 1.41M8.34 17.66l-1.41 1.41m0-14.14 1.41 1.41m8.73 8.73 1.41 1.41" />
                              <circle cx="12" cy="12" r="7" />
                              <polyline points="12 9 12 12 14 14" />
                            </svg>
                            <span>
                              {formatNumber(currentCar.mileage)}{" "}
                              {t("carCard.mileageUnit")}
                            </span>
                          </span>
                        )}

                      {currentCar.fuel_type && (
                        <span className="hero-chip" title={t("carCard.fuel")}>
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M3 22h12M4 9h10M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L19 6" />
                          </svg>
                          <span>{formatValue(currentCar.fuel_type)}</span>
                        </span>
                      )}

                      {currentCar.gearbox && (
                        <span className="hero-chip" title={t("carCard.gearbox")}>
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                          <span>{formatValue(currentCar.gearbox)}</span>
                        </span>
                      )}

                      {currentCar.horsepower && (
                        <span className="hero-chip" title={t("carCard.horsepower")}>
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                          <span>
                            {formatValue(currentCar.horsepower)}{" "}
                            {t("carCard.horsepowerUnit")}
                          </span>
                        </span>
                      )}

                      {currentCar.body_type && (
                        <span className="hero-chip" title={t("carCard.body")}>
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.9 2 11.2 2 11.5V16c0 .6.4 1 1 1h2" />
                            <circle cx="7" cy="17" r="2" />
                            <path d="M9 17h6" />
                            <circle cx="17" cy="17" r="2" />
                          </svg>
                          <span>{formatValue(currentCar.body_type)}</span>
                        </span>
                      )}
                    </div>

                    <div className="expanded-hero-metrics">
                      <div className="expanded-price-card">
                        <span className="expanded-price-label">
                          {t("carCard.price")}
                        </span>
                        <strong className="expanded-price-value">
                          €{formatNumber(currentCar.price_eur)}
                        </strong>
                      </div>

                      {currentCar.score !== null &&
                        currentCar.score !== undefined && (
                          <div
                            className={`expanded-score-card ${getScoreClass(
                              score
                            )}`}
                            title={t("carCard.scoreTooltip", {
                              score: score.toFixed(0)
                            })}
                          >
                            <div className="score-details-col">
                              <span className="score-label">
                                {t("carCard.accountScore")}
                              </span>
                              <span className="score-sub-label">/ 80</span>
                            </div>

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
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                </div>

                <div className="expanded-main">
                  <div className="specs-container">
                    <div className="spec-card">
                      <div className="spec-card-header">
                        <div className="spec-card-icon" aria-hidden="true">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 10.9 2 11.2 2 11.5V16c0 .6.4 1 1 1h2" />
                            <circle cx="7" cy="17" r="2" />
                            <path d="M9 17h6" />
                            <circle cx="17" cy="17" r="2" />
                          </svg>
                        </div>
                        <h4>{t("carCard.generalData")}</h4>
                      </div>

                      <div className="spec-card-grid">
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

                    <div className="spec-card">
                      <div className="spec-card-header">
                        <div className="spec-card-icon" aria-hidden="true">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                          </svg>
                        </div>
                        <h4>{t("carCard.performance")}</h4>
                      </div>

                      <div className="spec-card-grid">
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

                    <div className="spec-card">
                      <div className="spec-card-header">
                        <div className="spec-card-icon" aria-hidden="true">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                        </div>
                        <h4>{t("carCard.conditionDetails")}</h4>
                      </div>

                      <div className="spec-card-grid">
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

                    <div className="spec-card">
                      <div className="spec-card-header">
                        <div className="spec-card-icon" aria-hidden="true">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                          </svg>
                        </div>
                        <h4>{t("carCard.configuration")}</h4>
                      </div>

                      <div className="spec-card-grid">
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
                    <div className="spec-card spec-card-description">
                      <div className="spec-card-header">
                        <div className="spec-card-icon" aria-hidden="true">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        </div>
                        <h4>{t("carCard.description")}</h4>
                      </div>

                      <p className="car-description">
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
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    <span>{t("carCard.recommendations")}</span>
                  </button>

                  <button
                    className={`action-btn ${
                      viewMode === "risk" ? "active" : ""
                    }`}
                    onClick={handleViewRisk}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>{t("carCard.riskAnalysis")}</span>
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
                                    <RecommendationCard
                                      key={c.id}
                                      car={c}
                                      onClick={(e) =>
                                        handleSelectRecommendedCar(e, c)
                                      }
                                      isCompared={comparedCars.some(
                                        (comp) => comp.id === c.id
                                      )}
                                      t={t}
                                    />
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


