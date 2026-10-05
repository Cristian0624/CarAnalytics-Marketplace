import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useComparator } from "../context/ComparatorContext";
import { getLogoFileName, getScoreClass } from "../components/CarCard";
import SaveItemButton from "../components/SaveItemButton";
import { createSaved } from "../api/saved_items";
import { assessAnomalyRisk } from "../api/anomaly_risk";
import { buildRiskPayload } from "../utils/anomalyRisk";
import "./ComparatorPage.css";

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return number.toLocaleString();
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

export default function ComparatorPage() {
  const { comparedCars, removeCar } = useComparator();
  const location = useLocation();
  const savedFilters = location.state?.savedFilters || {};
  const savedPage = location.state?.savedPage || 1;

  const [anomalyScores, setAnomalyScores] = useState({});

  useEffect(() => {
    let active = true;
    const fetchScores = async () => {
      for (const car of comparedCars) {
        setAnomalyScores(prev => {
          if (prev[car.id] !== undefined) return prev;
          
          const fetchSingle = async () => {
            try {
              const payloadForm = {
                brand: car.brand, model: car.model, generation: car.generation,
                price: car.price_eur, year: car.year, mileage: car.mileage, engine: car.engine_size,
                fuel_type: car.fuel_type, gearbox: car.gearbox, drivetrain: car.drivetrain, body_type: car.body_type
              };
              const payload = buildRiskPayload(payloadForm);
              payload.listing_id = car.id;
              const res = await assessAnomalyRisk(payload);
              if (active) setAnomalyScores(current => ({ ...current, [car.id]: res }));
            } catch (err) {
              if (active) setAnomalyScores(current => ({ ...current, [car.id]: null }));
            }
          };
          fetchSingle();
          return prev;
        });
      }
    };
    
    if (comparedCars.length > 0) {
      fetchScores();
    }
    return () => { active = false; };
  }, [comparedCars]);

  if (comparedCars.length === 0) {
    return (
      <main className="comparator-page">
        <div className="comparator-header">
          <h1>Comparare</h1>
          <Link to="/listings" state={{ savedFilters, savedPage, keepFiltersClosed: true }} className="back-to-market-btn">
            ← Înapoi la piață
          </Link>
        </div>
        <div className="comparator-empty">
          <h2>Nu ai nicio mașină în comparare</h2>
          <p>Compară până la 3 mașini simultan! Adaugă vehiculele preferate din piață pentru a le analiza detaliat specificațiile, prețul și evaluarea de risc, astfel încât să faci cea mai bună alegere.</p>
          <Link to="/listings" state={{ savedFilters, savedPage, keepFiltersClosed: true }} className="back-to-market-btn">
            Găsește mașini pe piață
          </Link>
        </div>
      </main>
    );
  }

  const findBest = (field, type = 'min') => {
    let bestVal = type === 'min' ? Infinity : -Infinity;
    comparedCars.forEach(car => {
      const val = Number(car[field]);
      if (!Number.isNaN(val)) {
        if (type === 'min' && val < bestVal) bestVal = val;
        if (type === 'max' && val > bestVal) bestVal = val;
      }
    });
    return bestVal;
  };

  const bestPrice = findBest('price_eur', 'min');
  const bestYear = findBest('year', 'max');
  const bestMileage = findBest('mileage', 'min');

  function getAnomalyScoreClass(score) {
    const value = Number(score);
    if (value < 30) return "score-green";
    if (value < 60) return "score-orange";
    return "score-red";
  }

  return (
    <main className="comparator-page" style={{ "--car-count": comparedCars.length }}>
      <div className="comparator-header">
        <h1>Comparare ({comparedCars.length}/3)</h1>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <SaveItemButton 
            label="Salvează compararea" 
            defaultName={comparedCars.map(c => c.brand).join(" vs ")}
            path="/saved-searches" 
            onSave={(name) => createSaved("searches", { name, filters: { is_comparison: true, cars: comparedCars } })} 
          />
          <Link to="/listings" state={{ savedFilters, savedPage, keepFiltersClosed: true }} className="back-to-market-btn">
            ← Înapoi la piață
          </Link>
        </div>
      </div>

      <div className="comparator-table-wrapper">
        <table className="comparator-table">
          <thead>
            <tr>
              <th>Specificații</th>
              {comparedCars.map(car => (
                <th key={car.id} className="car-header-cell">
                  <button className="remove-car-btn" onClick={() => removeCar(car.id)} title="Elimină din comparare">✕</button>
                  <img src={`/logos/${getLogoFileName(car.brand)}`} alt={car.brand} onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} />
                  <h3>{formatValue(car.brand)} {formatValue(car.model)}</h3>
                  <p>{formatValue(car.generation)}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Scor General</th>
              {comparedCars.map(car => {
                const score = Number(car.score);
                return (
                  <td key={car.id} className="score-cell">
                    <div className={`score-circle-comp ${getScoreClass(score)}`}>
                      <span>{score.toFixed(0)}</span>
                      <small>/80</small>
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <th>Scor Anomalie (Risc)</th>
              {comparedCars.map(car => {
                const res = anomalyScores[car.id];
                if (res === undefined) {
                  return (
                    <td key={car.id} className="score-cell">
                      <div className="score-circle-comp" style={{ borderColor: "var(--brand-muted)", color: "var(--brand-muted)" }}>
                        <span style={{ fontSize: "16px" }}>...</span>
                      </div>
                    </td>
                  );
                }
                if (!res || res.anomaly_score == null) {
                  return (
                    <td key={car.id} className="score-cell">
                      <span style={{ color: "var(--brand-muted)", fontSize: "14px" }}>Indisponibil</span>
                    </td>
                  );
                }
                const score = Number(res.anomaly_score);
                return (
                  <td key={car.id} className="score-cell">
                    <div className={`score-circle-comp ${getAnomalyScoreClass(score)}`}>
                      <span>{score.toFixed(0)}</span>
                      <small>/100</small>
                    </div>
                  </td>
                );
              })}
            </tr>
            <tr>
              <th>Preț</th>
              {comparedCars.map(car => (
                <td key={car.id}>
                  <div className={Number(car.price_eur) === bestPrice ? "best-value" : ""}>
                    €{formatNumber(car.price_eur)}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th>An Fabricație</th>
              {comparedCars.map(car => (
                <td key={car.id}>
                  <div className={Number(car.year) === bestYear ? "best-value" : ""}>
                    {formatValue(car.year)}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th>Kilometraj</th>
              {comparedCars.map(car => (
                <td key={car.id}>
                  <div className={Number(car.mileage) === bestMileage ? "best-value" : ""}>
                    {formatNumber(car.mileage)} km
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th>Motor</th>
              {comparedCars.map(car => (
                <td key={car.id}>{formatValue(car.engine_size)} {formatValue(car.fuel_type)}</td>
              ))}
            </tr>
            <tr>
              <th>Cutie de viteze</th>
              {comparedCars.map(car => (
                <td key={car.id}>{formatValue(car.gearbox)}</td>
              ))}
            </tr>
            <tr>
              <th>Tracțiune</th>
              {comparedCars.map(car => (
                <td key={car.id}>{formatValue(car.drivetrain)}</td>
              ))}
            </tr>
            <tr>
              <th>Caroserie</th>
              {comparedCars.map(car => (
                <td key={car.id}>{formatValue(car.body_type)}</td>
              ))}
            </tr>
            <tr>
              <th>Clasa</th>
              {comparedCars.map(car => (
                <td key={car.id}>{formatValue(car.class_)}</td>
              ))}
            </tr>
            <tr>
              <th>Tara înmatriculării</th>
              {comparedCars.map(car => (
                <td key={car.id}>{formatValue(car.registration_country)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
