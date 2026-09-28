import { useState, useEffect, useRef } from "react";
import "./CarCard.css";
import FavouriteButton from "./FavouriteButton";

function getLogoFileName(brand) {
  if (!brand) return "unknown";
  let name = brand.toLowerCase().trim().replace(/ /g, '-');
  if (name === "mercedes") name = "mercedes-benz";
  if (name === "vw") name = "volkswagen";
  return `${name}.png`;
}


function getScoreClass(score) {
  const value = Number(score);

  if (value < 30) {
    return "score-red";
  }

  if (value < 60) {
    return "score-orange";
  }

  return "score-green";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return value;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return value;
  }

  return number.toLocaleString();
}

function CarCard({
  car,
  expanded,
  position,
  onClick,
  showFavourite = true,
  peeking = false,
}) {
  const [isClosing, setIsClosing] = useState(false);
  const cardRef = useRef(null);
  const score = Number(car.score);

  // Handle outside click when expanded
  useEffect(() => {
    if (!expanded || isClosing) return;

    function handleClickOutside(event) {
      if (cardRef.current && !cardRef.current.contains(event.target)) {
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

    // Match the 0.3s CSS collapse animation duration
    setTimeout(() => {
      setIsClosing(false);
      onClick();
    }, 300);
  }

  function handleCardClick(event) {
    if (!expanded) {
      onClick();
    }
  }

  function openOriginalListing(event) {
    event.stopPropagation();

    if (car.url) {
      window.open(car.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <article
      ref={cardRef}
      className={`car-card ${expanded ? "car-card-expanded" : ""} ${
        isClosing ? "car-card-collapsing" : ""
      } car-card-${position}`}
      onClick={handleCardClick}
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          if (expanded) {
            handleClose(event);
          } else {
            onClick();
          }
        }
      }}
    >
      {!expanded ? (
        <div className="car-card-content">
          <div className="car-card-title-row">
            <div>
              <h3>
                {formatValue(car.brand)} {formatValue(car.model)}
              </h3>
              {car.generation && (
                <p className="car-generation">
                  {typeof car.generation === 'string' ? car.generation.trim() : car.generation}
                </p>
              )}
            </div>

            <img 
              src={`/logos/${getLogoFileName(car.brand)}`} 
              alt={car.brand} 
              className="collapsed-car-logo" 
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
              }}
            />
          </div>

          <div className="car-details">
            <span>{formatValue(car.year)}</span>
            <span>{formatNumber(car.mileage)} km</span>
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
      ) : (
        <div className="car-expanded-content">
          {showFavourite && <FavouriteButton car={car} />}
          <button
            className="original-listing-button"
            onClick={openOriginalListing}
            title="Deschide anunțul original pe 999.md"
          >
            <img src="/999-logo.png" alt="999.md" className="button-logo-999" />
            <span>Deschide anunțul</span>
          </button>

          <button
            className="close-card-button"
            onClick={handleClose}
            title="Close"
          >
            ✕
          </button>

          <div className="expanded-header">
            <div>
              <h2
                style={{
                  textTransform: "uppercase",
                  margin: "0 0 4px 0",
                  fontSize: "24px",
                }}
              >
                {formatValue(car.brand)} {formatValue(car.model)}{" "}
                {car.year ? `(${car.year})` : ""}
              </h2>

              {car.generation && (
                <p style={{ margin: '0 0 12px 0', color: '#555', textAlign: 'left' }}>
                  {typeof car.generation === 'string' ? car.generation.trim() : car.generation}
                </p>
              )}

              <div className="expanded-price">
                <span>PREȚ</span>
                <strong>€{formatNumber(car.price_eur)}</strong>
              </div>
            </div>

            <img 
              src={`/logos/${getLogoFileName(car.brand)}`} 
              alt={car.brand} 
              className="expanded-car-logo" 
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
              }}
            />

            {car.score !== null && car.score !== undefined && (
              <div
                className={`expanded-score-circular ${getScoreClass(score)}`}
              >
                <span className="score-label">SCORE</span>
                <div className="score-circle">
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
                  <div className="spec-item">
                    <span>Marcă</span>
                    <strong>{formatValue(car.brand)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Model</span>
                    <strong>{formatValue(car.model)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Caroserie</span>
                    <strong>{formatValue(car.body_type)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Înmatriculare</span>
                    <strong>{formatValue(car.registration_country)}</strong>
                  </div>
                </div>
              </div>

              <div className="spec-group">
                <h4>PERFORMANȚĂ</h4>
                <div className="spec-row">
                  <div className="spec-item">
                    <span>Cai Putere</span>
                    <strong>
                      {formatValue(car.horsepower)}{" "}
                      {car.horsepower ? "CP" : ""}
                    </strong>
                  </div>
                  <div className="spec-item">
                    <span>Cutie de viteze</span>
                    <strong>{formatValue(car.gearbox)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Tracțiune</span>
                    <strong>{formatValue(car.drivetrain)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Combustibil</span>
                    <strong>{formatValue(car.fuel_type)}</strong>
                  </div>
                </div>
              </div>

              <div className="spec-group">
                <h4>STARE ȘI DETALII</h4>
                <div className="spec-row">
                  <div className="spec-item">
                    <span>An</span>
                    <strong>{formatValue(car.year)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Rulaj</span>
                    <strong>
                      {formatNumber(car.mileage)}{" "}
                      {car.mileage ? "km" : ""}
                    </strong>
                  </div>
                  <div className="spec-item">
                    <span>Stare</span>
                    <strong>{formatValue(car.state)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Motor</span>
                    <strong>{formatValue(car.engine_size)}</strong>
                  </div>
                </div>
              </div>

              <div className="spec-group">
                <h4>CONFIGURAȚIE</h4>
                <div className="spec-row">
                  <div className="spec-item">
                    <span>Uși</span>
                    <strong>{formatValue(car.doors)}</strong>
                  </div>
                  <div className="spec-item">
                    <span>Locuri</span>
                    <strong>{formatValue(car.seats)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {car.description && (
              <div className="information-group" style={{ marginTop: "24px" }}>
                <h4
                  style={{
                    fontSize: "11px",
                    textTransform: "uppercase",
                    marginBottom: "12px",
                    color: "#111",
                  }}
                >
                  DESCRIERE
                </h4>
                <p
                  className="car-description"
                  style={{ margin: 0, color: "#555", lineHeight: "1.6" }}
                >
                  {car.description}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default CarCard;