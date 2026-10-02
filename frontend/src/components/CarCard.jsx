import { useState, useEffect, useRef } from "react";
import "./CarCard.css";
import FavouriteButton from "./FavouriteButton";
import { assessAnomalyRisk } from "../api/anomaly_risk";
import { getRecommendationsForCar } from "../api/recommendations";
import AnomalyRiskResults from "./AnomalyRiskResults";
import { buildRiskPayload } from "../utils/anomalyRisk";
import { createPortal } from "react-dom";

export function getLogoFileName(brand) {
  if (!brand) return "unknown";
  let name = brand.toLowerCase().trim().replace(/ /g, '-');
  if (name === "mercedes") name = "mercedes-benz";
  if (name === "vw") name = "volkswagen";
  return `${name}.png`;
}

export function getScoreClass(score) {
  const value = Number(score);
  if (value < 30) return "score-red";
  if (value < 60) return "score-orange";
  return "score-green";
}

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

function CarCard({ car, expanded, position, onClick, showFavourite = true, peeking = false }) {
  const [currentCar, setCurrentCar] = useState(car);

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

  useEffect(() => {
    if (!expanded) {
      setViewMode(null);
      setCurrentCar(car);
    }
  }, [expanded, car]);

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
    if (viewMode === 'recommendations') {
      setViewMode(null);
      return;
    }
    setViewMode('recommendations');
    setVisibleCount(12);
    setLoadingView(true);
    setViewError("");
    try {
      const data = await getRecommendationsForCar(currentCar.id);
      setRecommendations(data.recommendations || []);
    } catch (err) {
      setViewError("Nu am putut încărca recomandările.");
    } finally {
      setLoadingView(false);
    }
  }

  async function handleViewRisk(event) {
    event.stopPropagation();
    if (viewMode === 'risk') {
      setViewMode(null);
      return;
    }
    setViewMode('risk');
    setLoadingView(true);
    setViewError("");
    try {
      const payloadForm = {
        brand: currentCar.brand, model: currentCar.model, generation: currentCar.generation,
        price: currentCar.price_eur, year: currentCar.year, mileage: currentCar.mileage, engine: currentCar.engine_size,
        fuel_type: currentCar.fuel_type, gearbox: currentCar.gearbox, drivetrain: currentCar.drivetrain, body_type: currentCar.body_type
      };
      const payload = buildRiskPayload(payloadForm);
      payload.listing_id = currentCar.id;
      const res = await assessAnomalyRisk(payload);
      setRiskResult(res);
    } catch (err) {
      setViewError("Nu am putut încărca analiza riscului.");
    } finally {
      setLoadingView(false);
    }
  }

  return (
    <>
      <article
        ref={cardRef}
        className={`car-card`}
        onClick={handleCardClick}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            if (!expanded) onClick();
          }
        }}
      >
        <div className="car-card-content">
          <div className="car-card-title-row">
            <div>
              <h3>{formatValue(currentCar.brand)} {formatValue(currentCar.model)}</h3>
              {currentCar.generation && (
                <p className="car-generation">
                  {typeof currentCar.generation === 'string' ? currentCar.generation.trim() : currentCar.generation}
                </p>
              )}
            </div>
            <img 
              src={`/logos/${getLogoFileName(currentCar.brand)}`} 
              alt={currentCar.brand} 
              className="collapsed-car-logo" 
              onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }}
            />
          </div>
          <div className="car-details">
            <span>{formatValue(currentCar.year)}</span>
            <span>{formatNumber(currentCar.mileage)} km</span>
          </div>
          <div className="car-card-bottom">
            <strong>€{formatNumber(currentCar.price_eur)}</strong>
            {currentCar.score !== null && currentCar.score !== undefined && (
              <span className={`score-badge ${getScoreClass(score)}`}>{score.toFixed(0)}</span>
            )}
          </div>
        </div>
      </article>

      {expanded && createPortal(
        <div className="filter-modal-overlay car-card-modal-overlay" onClick={handleClose}>
          <article
            ref={modalRef}
            className={`car-modal-content ${isClosing ? "car-card-collapsing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="car-expanded-content">
              {showFavourite && <FavouriteButton car={currentCar} />}
              <button className="original-listing-button" onClick={openOriginalListing} title="Deschide anunțul original pe 999.md">
                <img src="/999-logo.png" alt="999.md" className="button-logo-999" />
                <span>Deschide anunțul</span>
              </button>
              <button className="close-card-button" onClick={handleClose} title="Close">✕</button>

              <div className="expanded-header">
                  <div style={{ maxWidth: "50%" }}>
                  <h2 style={{ textTransform: "uppercase", margin: "0 0 4px 0", fontSize: "24px", color: '#17202A', fontWeight: 800, textAlign: "left" }}>
                      {formatValue(currentCar.brand)} {formatValue(currentCar.model)}
                      {currentCar.year ? <span style={{ display: "block", fontSize: "20px", fontWeight: 700, marginTop: "4px" }}>({currentCar.year})</span> : ""}
                    </h2>
                  {currentCar.generation && (
                    <p style={{ margin: '0 0 12px 0', color: '#54666E', textAlign: 'left' }}>
                      {typeof currentCar.generation === 'string' ? currentCar.generation.trim() : currentCar.generation}
                    </p>
                  )}
                  <div className="expanded-price">
                    <span>PREȚ</span>
                    <strong>€{formatNumber(currentCar.price_eur)}</strong>
                  </div>
                </div>
                <img src={`/logos/${getLogoFileName(currentCar.brand)}`} alt={currentCar.brand} className="expanded-car-logo" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} />
                {currentCar.score !== null && currentCar.score !== undefined && (
                  <div className={`expanded-score-circular ${getScoreClass(score)}`}>
                    <span className="score-label">SCORE</span>
                    <div className="score-circle" style={{ "--progress": `${Math.min(100, Math.max(0, (score / 80) * 100))}%` }}>
                      <span className="score-main">{score.toFixed(0)}</span>
                      <span className="score-sub">{score.toFixed(0)}/80</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="expanded-main">
                <div className="specs-container">
                  <div className="spec-group">
                    <h4>DATE GENERALE</h4>
                    <div className="spec-row">
                      <div className="spec-item"><span>Marcă</span><strong>{formatValue(currentCar.brand)}</strong></div>
                      <div className="spec-item"><span>Model</span><strong>{formatValue(currentCar.model)}</strong></div>
                      <div className="spec-item"><span>Caroserie</span><strong>{formatValue(currentCar.body_type)}</strong></div>
                      <div className="spec-item"><span>Înmatriculare</span><strong>{formatValue(currentCar.registration_country)}</strong></div>
                    </div>
                  </div>
                  <div className="spec-group">
                    <h4>PERFORMANȚĂ</h4>
                    <div className="spec-row">
                      <div className="spec-item"><span>Cai Putere</span><strong>{formatValue(currentCar.horsepower)} {currentCar.horsepower ? "CP" : ""}</strong></div>
                      <div className="spec-item"><span>Cutie de viteze</span><strong>{formatValue(currentCar.gearbox)}</strong></div>
                      <div className="spec-item"><span>Tracțiune</span><strong>{formatValue(currentCar.drivetrain)}</strong></div>
                      <div className="spec-item"><span>Combustibil</span><strong>{formatValue(currentCar.fuel_type)}</strong></div>
                    </div>
                  </div>
                  <div className="spec-group">
                    <h4>STARE ȘI DETALII</h4>
                    <div className="spec-row">
                      <div className="spec-item"><span>An</span><strong>{formatValue(currentCar.year)}</strong></div>
                      <div className="spec-item"><span>Rulaj</span><strong>{formatNumber(currentCar.mileage)} {currentCar.mileage ? "km" : ""}</strong></div>
                      <div className="spec-item"><span>Stare</span><strong>{formatValue(currentCar.state)}</strong></div>
                      <div className="spec-item"><span>Motor</span><strong>{formatValue(currentCar.engine_size)}</strong></div>
                    </div>
                  </div>
                  <div className="spec-group">
                    <h4>CONFIGURAȚIE</h4>
                    <div className="spec-row">
                      <div className="spec-item"><span>Uși</span><strong>{formatValue(currentCar.doors)}</strong></div>
                      <div className="spec-item"><span>Locuri</span><strong>{formatValue(currentCar.seats)}</strong></div>
                    </div>
                  </div>
                </div>

                {currentCar.description && (
                  <div className="information-group" style={{ marginTop: "24px" }}>
                    <h4 style={{ fontSize: "11px", textTransform: "uppercase", marginBottom: "12px", color: "#111", fontWeight: 700 }}>DESCRIERE</h4>
                    <p className="car-description" style={{ margin: 0, color: "#555", lineHeight: "1.6" }}>{currentCar.description}</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="car-card-actions">
                <button className={`action-btn ${viewMode === 'recommendations' ? 'active' : ''}`} onClick={handleViewRecommendations}>
                  Recomandări
                </button>
                <button className={`action-btn ${viewMode === 'risk' ? 'active' : ''}`} onClick={handleViewRisk}>
                  Analiza Riscului
                </button>
              </div>

              {/* Extra view sections */}
              {viewMode && (
                <div className="car-card-extra-view">
                  {loadingView && <div className="loading-state">Se încarcă...</div>}
                  {viewError && <div className="error-state">{viewError}</div>}
                  
                  {!loadingView && !viewError && viewMode === 'recommendations' && (
                    <div className="recommendations-container">
                      <h3 style={{marginTop: 0, marginBottom: "16px", fontSize: "18px", color: "#111"}}>Mașini Recomandate</h3>
                      {recommendations.length > 0 ? (
                        <>

                        <div className="recommendations-mini-grid">
                          {recommendations.slice(0, visibleCount).map(c => (
                            
                            <article key={c.id} className="car-card" onClick={(e) => {
                                e.stopPropagation();
                                setCurrentCar(c);
                                setViewMode(null);
                            }} style={{ cursor: 'pointer', margin: 0 }}>
                              <div className="car-card-content">
                                <div className="car-card-title-row">
                                  <div>
                                    <h3>{formatValue(c.brand)} {formatValue(c.model)}</h3>
                                    {c.generation && (
                                      <p className="car-generation">
                                        {typeof c.generation === 'string' ? c.generation.trim() : c.generation}
                                      </p>
                                    )}
                                  </div>
                                  <img 
                                    src={`/logos/${getLogoFileName(c.brand)}`} 
                                    alt={c.brand} 
                                    className="collapsed-car-logo" 
                                    onError={(ev) => { ev.target.onerror = null; ev.target.style.display = 'none'; }}
                                  />
                                </div>
                                <div className="car-details">
                                  <span>{formatValue(c.year)}</span>
                                  <span>{formatNumber(c.mileage)} km</span>
                                </div>
                                <div className="car-card-bottom">
                                  <strong>€{formatNumber(c.price_eur)}</strong>
                                  {c.score !== null && c.score !== undefined && (
                                    <span className={`score-badge ${getScoreClass(c.score)}`}>{Number(c.score).toFixed(0)}</span>
                                  )}
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
                          <button className="action-btn" onClick={(e) => { e.stopPropagation(); if (visibleCount <= 12) { setViewMode(null); } else { setVisibleCount(v => v - 12); } }} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                            {visibleCount <= 12 ? "Restrânge" : "Arată mai puțin"}
                          </button>
                          {visibleCount < recommendations.length && (
                            <button className="action-btn" onClick={(e) => { e.stopPropagation(); setVisibleCount(v => v + 12); }} style={{ flex: 1, padding: '12px', background: '#17202A', color: '#fff', border: '1px solid #17202A', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                              Arată mai mult
                            </button>
                          )}
                        </div>
                        </>
                      ) : (
                        <p>Nu s-au găsit recomandări pentru această mașină.</p>
                      )}
                    </div>
                  )}

                  {!loadingView && !viewError && viewMode === 'risk' && riskResult && (
                    <div className="risk-container" style={{background: "#f9fafb", padding: "16px", borderRadius: "12px", marginTop: "16px", border: "1px solid #eee"}}>
                      <AnomalyRiskResults result={riskResult} vehicle={{...car, price: currentCar.price_eur, engine: currentCar.engine_size}} />
                    </div>
                  )}
                </div>
              )}

            </div>
          </article>
        </div>
      , document.body)}
    </>
  );
}

export default CarCard;

