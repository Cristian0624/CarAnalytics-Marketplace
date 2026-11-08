import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useComparator } from "../context/ComparatorContext";
import { getLogoFileName, getScoreClass } from "../utils/carCard";
import SaveItemButton from "../components/SaveItemButton";
import BackgroundTriangles from "../components/BackgroundTriangles";
import { createSaved } from "../api/saved_items";
import { assessAnomalyRisk } from "../api/anomaly_risk";
import { buildRiskPayload } from "../utils/anomalyRisk";
import { comparisonColumnWidths, translateComparisonValue } from "../utils/comparator";
import "./ComparatorPage.css";
import { BackArrow } from "../components/ComparisonIcons";
import "../components/ComparisonSelection.css";

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
  const { t } = useTranslation();
  const { comparedCars, removeCar, clearComparator } = useComparator();
  const tableWrapper = useRef(null);
  const tableArea = useRef(null);
  const scoreRequests = useRef(new Map());
  const location = useLocation();
  const navigate = useNavigate();
  const savedFilters = location.state?.savedFilters || {};
  const savedPage = location.state?.savedPage || 1;
  const savedSortBy = location.state?.savedSortBy;
  const savedSortOrder = location.state?.savedSortOrder;
  const isSavedComparison = location.state?.savedComparisonId != null;
  const backLabel = t(isSavedComparison ? "comparatorPage.backToSaved" : "comparatorPage.backToMarket");

  const handleBackToMarket = () => {
    if (isSavedComparison) {
      navigate("/saved-comparisons");
      return;
    }
    navigate("/listings", {
      state: {
        savedFilters,
        savedPage,
        savedSortBy,
        savedSortOrder,
        keepFiltersClosed: true,
      },
    });
  };

  const [anomalyScores, setAnomalyScores] = useState({});

  useLayoutEffect(() => {
    const area = tableArea.current;
    if (!area) return;
    const resizeColumns = () => {
      const { labelWidth, carWidth } = comparisonColumnWidths(area.clientWidth, comparedCars.length);
      area.style.setProperty("--label-width", `${labelWidth}px`);
      area.style.setProperty("--car-width", `${carWidth}px`);
    };
    resizeColumns();
    let resizeFrame;
    const observer = new ResizeObserver(() => {
      // Apply outside the observer delivery cycle because column widths can
      // also change the table height as translated text wraps.
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resizeColumns);
    });
    observer.observe(area);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(resizeFrame);
    };
  }, [comparedCars.length]);

  useEffect(() => {
    let active = true;
    const fetchScores = async () => {
      for (const car of comparedCars) {
        if (!active) return;
        const payloadForm = {
          brand: car.brand,
          model: car.model,
          generation: car.generation,
          price: car.price_eur,
          year: car.year,
          mileage: car.mileage,
          engine: car.engine_size,
          fuel_type: car.fuel_type,
          gearbox: car.gearbox,
          drivetrain: car.drivetrain,
          body_type: car.body_type,
        };
        try {
          const payload = buildRiskPayload(payloadForm);
          payload.listing_id = car.id;
          const key = JSON.stringify(payload);
          if (!scoreRequests.current.has(key)) {
            // Reuse in-flight results across selection changes and StrictMode.
            // Fetch sequentially so larger comparisons don't flood the backend.
            scoreRequests.current.set(key, assessAnomalyRisk(payload).catch(() => null));
          }
          const result = await scoreRequests.current.get(key);
          if (active) setAnomalyScores(current => ({ ...current, [car.id]: result }));
        } catch {
          if (active) setAnomalyScores(current => ({ ...current, [car.id]: null }));
        }
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
        <BackgroundTriangles />
        <div className="comparator-header">
          <h1>{t("comparatorPage.title")}</h1>
          <button onClick={handleBackToMarket} className="back-to-market-btn">
            <BackArrow />{backLabel}</button>
        </div>
        <div className="comparator-empty">
          <h2>{t("comparatorPage.emptyTitle")}</h2>
          <p>{t("comparatorPage.emptyDescription")}</p>
          <button onClick={() => navigate("/listings")} className="back-to-market-btn">
            {t("comparatorPage.findCars")}</button>
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
      <BackgroundTriangles />
      <div className="comparator-header">
        <h1>{t("comparatorPage.titleCount", { count: comparedCars.length })}</h1>
        <div className="comparator-header-actions">
          {!isSavedComparison && <SaveItemButton
            label={t("comparatorPage.saveComparison")} 
            defaultName={comparedCars.map(c => c.brand).join(" vs ")}
            path="/saved-searches" 
            onSave={(name) => createSaved("searches", { name, filters: { is_comparison: true, cars: comparedCars } })} 
          />}
          <button onClick={handleBackToMarket} className="back-to-market-btn">
            <BackArrow />{backLabel}</button>
        </div>
      </div>

      <div className="comparator-layout">
      <aside className="comparison-sidebar" aria-label={t("comparatorPage.selectionTitle")}>
        <div className="comparison-sidebar-heading">
          <h2>{t("comparatorPage.selectionTitle")}</h2>
          <span>{comparedCars.length}</span>
        </div>
        <p>{t("comparatorPage.selectionHint")}</p>
        <ol>
          {comparedCars.map((car, index) => (
            <li key={car.id}>
              <button type="button" className="comparison-sidebar-car" onClick={() => {
                const wrapper = tableWrapper.current;
                const column = wrapper?.querySelectorAll(".car-header-cell")[index];
                const labelWidth = wrapper?.querySelector("th")?.getBoundingClientRect().width || 0;
                if (column) wrapper.scrollTo({ left: column.offsetLeft - labelWidth, behavior: "smooth" });
              }}>
                <span className="comparison-sidebar-number">{index + 1}</span>
                <span><strong>{car.brand} {car.model}</strong><small>{formatValue(car.year)} · €{formatNumber(car.price_eur)}</small></span>
              </button>
              <button type="button" className="comparison-sidebar-remove" onClick={() => removeCar(car.id)} aria-label={`${t("comparatorPage.removeFromComparison")}: ${car.brand} ${car.model}`} title={t("comparatorPage.removeFromComparison")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="comparison-sidebar-clear" onClick={clearComparator}>{t("comparatorPage.clearSelection")}</button>
      </aside>
      <div className="comparison-table-area" ref={tableArea}>
      <div className="comparator-table-wrapper" ref={tableWrapper} tabIndex={0} role="region" aria-label={t("comparatorPage.title")}>
        <table className="comparator-table">
          <colgroup>
            <col className="comparison-label-column" />
            {comparedCars.map(car => <col className="comparison-car-column" key={car.id} />)}
          </colgroup>
          <thead>
            <tr>
              <th>{t("comparatorPage.specs")}</th>
              {comparedCars.map(car => (
                <th key={car.id} className="car-header-cell">
                  <button className="remove-car-btn" onClick={() => removeCar(car.id)} aria-label={`${t("comparatorPage.removeFromComparison")}: ${car.brand} ${car.model}`} title={t("comparatorPage.removeFromComparison")}>✕</button>
                  <img src={`/logos/${getLogoFileName(car.brand)}`} alt={car.brand} onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; }} />
                  <h3>{formatValue(car.brand)} {formatValue(car.model)}</h3>
                  <p>{translateComparisonValue(t, "generation", car.generation)}</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{t("comparatorPage.overallScore")}</th>
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
              <th>{t("comparatorPage.anomalyScore")}</th>
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
                      <span style={{ color: "var(--brand-muted)", fontSize: "14px" }}>{t("comparatorPage.unavailable")}</span>
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
              <th>{t("comparatorPage.price")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>
                  <div className={Number(car.price_eur) === bestPrice ? "best-value" : ""}>
                    €{formatNumber(car.price_eur)}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.year")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>
                  <div className={Number(car.year) === bestYear ? "best-value" : ""}>
                    {formatValue(car.year)}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.mileage")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>
                  <div className={Number(car.mileage) === bestMileage ? "best-value" : ""}>
                    {formatNumber(car.mileage)} km
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.engine")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>{formatValue(car.engine_size ?? car.engine)} {translateComparisonValue(t, "fuel_type", car.fuel_type)}</td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.gearbox")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>{translateComparisonValue(t, "gearbox", car.gearbox)}</td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.drivetrain")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>{translateComparisonValue(t, "drivetrain", car.drivetrain)}</td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.body")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>{translateComparisonValue(t, "body_type", car.body_type)}</td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.carClass")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>{translateComparisonValue(t, "class", car.class_ ?? car.class)}</td>
              ))}
            </tr>
            <tr>
              <th>{t("comparatorPage.country")}</th>
              {comparedCars.map(car => (
                <td key={car.id}>{translateComparisonValue(t, "registration_country", car.registration_country)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      </div>
      </div>
    </main>
  );
}



