// Interactive Features & Algorithm Simulators
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BackgroundTriangles from "../components/BackgroundTriangles";
import "./FeaturesPage.css";

const SPAM_MILEAGES = new Set([
  0, 1, 10, 100, 1000, 10000, 1111, 11111, 111111, 12345, 123456, 9999, 99999,
  999999,
]);

function calculateScoreMod(pct) {
  if (Number.isNaN(pct)) return 0.0;
  if (pct > 0) {
    let bonus = 0;
    let remaining = pct;
    const t1 = Math.min(remaining, 10.0);
    bonus += t1 * 1.3;
    remaining -= t1;
    if (remaining > 0) {
      const t2 = Math.min(remaining, 10.0);
      bonus += t2 * 1.0;
      remaining -= t2;
    }
    if (remaining > 0) {
      const t3 = Math.min(remaining, 10.0);
      bonus += t3 * 0.5;
      remaining -= t3;
    }
    if (remaining > 0) {
      const t4 = Math.min(remaining, 5.0);
      bonus += 0;
      remaining -= t4;
    }
    if (remaining > 0) {
      bonus -= remaining * 2.0;
    }
    return bonus;
  } else {
    let penalty = 0;
    let remaining = Math.abs(pct);
    const t1 = Math.min(remaining, 15.0);
    penalty += t1 * 1.0;
    remaining -= t1;
    if (remaining > 0) {
      const t2 = Math.min(remaining, 10.0);
      penalty += t2 * 1.3;
      remaining -= t2;
    }
    if (remaining > 0) {
      const t3 = Math.min(remaining, 10.0);
      penalty += t3 * 1.6;
      remaining -= t3;
    }
    if (remaining > 0) {
      penalty += remaining * 2.0;
    }
    return -penalty;
  }
}

export default function FeaturesPage() {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // 1. Exact eval.py Deal Score Simulator state (0 - 100 scale, baseline 50.0)
  const [simMedPrice, setSimMedPrice] = useState(15000);
  const [simAskingPrice, setSimAskingPrice] = useState(12800);
  const [simYear, setSimYear] = useState(2019);
  const [simMileage, setSimMileage] = useState(135000);
  const [simBaselineMileage, setSimBaselineMileage] = useState(165000);
  const [simDepPer10k, setSimDepPer10k] = useState(650);
  const [simIsDamaged, setSimIsDamaged] = useState(false);

  const age = Math.max(1, 2026 - simYear);
  const suspiciouslyLowThreshold = age * 6000;
  const isSpamMileage = SPAM_MILEAGES.has(simMileage);
  const isLowMileage = simMileage < suspiciouslyLowThreshold || isSpamMileage;
  const isTaxi = simMileage / age > 45000;

  let effectiveMileage = isSpamMileage ? simBaselineMileage : simMileage;
  effectiveMileage = Math.max(effectiveMileage, suspiciouslyLowThreshold);

  const rawExpectedPrice =
    simMedPrice -
    ((effectiveMileage - simBaselineMileage) / 10000) * simDepPer10k;
  const expectedPrice = Math.max(500, Math.round(rawExpectedPrice));

  const priceDiffPct =
    ((expectedPrice - simAskingPrice) / expectedPrice) * 100;
  const priceMod = calculateScoreMod(priceDiffPct);

  let calcScore = 50.0 + priceMod;
  let lowMileagePenalty = 0;
  if (isLowMileage) {
    lowMileagePenalty = age <= 3 ? -15.0 : -30.0;
    calcScore += lowMileagePenalty;
  }

  let taxiPenalty = 0;
  if (isTaxi) {
    taxiPenalty = -20.0;
    calcScore += taxiPenalty;
  }

  const isScamCap = priceDiffPct > 20.0 && isLowMileage;
  if (isScamCap) {
    calcScore = Math.min(calcScore, 20.0);
  }

  if (simIsDamaged) {
    calcScore = Math.min(calcScore, 10.0);
  }

  const finalScore = Number(Math.min(100, Math.max(0, calcScore)).toFixed(2));

  const dealBadgeClass =
    finalScore >= 65
      ? "sim-badge-good"
      : finalScore >= 45
      ? "sim-badge-medium"
      : "sim-badge-bad";

  // 2. Interactive Anomaly Risk Scenario state
  const [riskScenario, setRiskScenario] = useState("balanced");

  const RISK_SCENARIOS = {
    balanced: {
      overall: 14,
      priceScore: 12,
      mileageScore: 18,
      specScore: 8,
      markerPercent: 48,
      deviationText: "-3%",
      ruleKey: "balanced",
    },
    cheapExtreme: {
      overall: 86,
      priceScore: 91,
      mileageScore: 22,
      specScore: 15,
      markerPercent: 6,
      deviationText: "-52%",
      ruleKey: "cheapExtreme",
    },
    mileageAnomaly: {
      overall: 79,
      priceScore: 34,
      mileageScore: 88,
      specScore: 19,
      markerPercent: 66,
      deviationText: "-64% km",
      ruleKey: "mileageAnomaly",
    },
    rareSpec: {
      overall: 58,
      priceScore: 42,
      mileageScore: 39,
      specScore: 84,
      markerPercent: 74,
      deviationText: "+18%",
      ruleKey: "rareSpec",
    },
  };

  const activeRisk = RISK_SCENARIOS[riskScenario];

  // 3. Interactive Price Estimator Strategy state (Weighted Percentiles P20-P30, P40-P60, P70-P80)
  const [pricingStrategy, setPricingStrategy] = useState("normal");

  const PRICING_STRATEGIES = {
    fast: {
      percentileRange: "P20 – P30",
      multiplierMin: 0.86,
      multiplierMax: 0.93,
      days: "3 – 7",
      demand: 94,
    },
    normal: {
      percentileRange: "P40 – P60 (P50 Median)",
      multiplierMin: 0.96,
      multiplierMax: 1.04,
      days: "14 – 25",
      demand: 74,
    },
    higher: {
      percentileRange: "P70 – P80",
      multiplierMin: 1.08,
      multiplierMax: 1.16,
      days: "35 – 60+",
      demand: 38,
    },
  };

  const activeStrategy = PRICING_STRATEGIES[pricingStrategy];

  // 4. Interactive Pipeline Step state
  const [activeStep, setActiveStep] = useState(0);
  const pipelineSteps = [0, 1, 2, 3];

  return (
    <main className="features-page">
      <BackgroundTriangles />

      <div className="features-page-container">
        {/* HERO */}
        <header className="features-hero">
          <span className="features-eyebrow">{t("featuresPage.badge")}</span>
          <h1>
            {t("featuresPage.titlePrefix")}{" "}
            <span className="features-brand">
              Face<span>Auto</span>
            </span>
          </h1>
          <p className="features-subtitle">{t("featuresPage.subtitle")}</p>

          <div className="features-quick-nav">
            <a href="#scoring-lab" className="features-pill-link">
              01 · {t("featuresPage.nav.scoring")}
            </a>
            <a href="#risk-lab" className="features-pill-link">
              02 · {t("featuresPage.nav.risk")}
            </a>
            <a href="#estimator-lab" className="features-pill-link">
              03 · {t("featuresPage.nav.estimator")}
            </a>
            <a href="#pipeline-lab" className="features-pill-link">
              04 · {t("featuresPage.nav.pipeline")}
            </a>
          </div>
        </header>

        {/* SECTION 1: EXACT DEAL SCORING ALGORITHM (eval.py) */}
        <section id="scoring-lab" className="feature-lab-card">
          <div className="feature-lab-info">
            <span className="feature-step-tag">
              01 · {t("featuresPage.scoring.tag")}
            </span>
            <h2>{t("featuresPage.scoring.title")}</h2>
            <p className="feature-lab-lead">
              {t("featuresPage.scoring.description")}
            </p>

            <ul className="feature-explicit-list">
              <li>
                <strong>{t("featuresPage.scoring.points.groupingTitle")}:</strong>{" "}
                {t("featuresPage.scoring.points.groupingDesc")}
              </li>
              <li>
                <strong>
                  {t("featuresPage.scoring.points.depreciationTitle")}:
                </strong>{" "}
                {t("featuresPage.scoring.points.depreciationDesc")}
              </li>
              <li>
                <strong>{t("featuresPage.scoring.points.tiersTitle")}:</strong>{" "}
                {t("featuresPage.scoring.points.tiersDesc")}
              </li>
              <li>
                <strong>
                  {t("featuresPage.scoring.points.penaltiesTitle")}:
                </strong>{" "}
                {t("featuresPage.scoring.points.penaltiesDesc")}
              </li>
            </ul>

            <div className="formula-code-box">
              <code>
                Expected_Price = Med_Price − ((Effective_Km − Baseline_Km) /
                10,000) × Dep_per_10k
              </code>
              <code>
                Score = clip(50.0 + Tier_Mod(Price_Diff_%) − Penalties, 0, 100)
              </code>
            </div>

            <Link to="/listings" className="feature-inline-btn">
              {t("featuresPage.scoring.tryButton")} →
            </Link>
          </div>

          <div className="feature-lab-interactive">
            <div className="sim-panel-header">
              <span>{t("featuresPage.scoring.simTitle")}</span>
              <span className={`sim-score-pill ${dealBadgeClass}`}>
                {t("featuresPage.scoring.scoreLabel")}: {finalScore} / 100
              </span>
            </div>

            <div className="sim-sliders">
              <div className="sim-slider-group">
                <div className="sim-slider-label">
                  <span>{t("featuresPage.scoring.sliders.marketPrice")}</span>
                  <strong>€{simMedPrice.toLocaleString()}</strong>
                </div>
                <input
                  type="range"
                  min="4000"
                  max="40000"
                  step="500"
                  value={simMedPrice}
                  onChange={(e) => setSimMedPrice(Number(e.target.value))}
                />
              </div>

              <div className="sim-slider-group">
                <div className="sim-slider-label">
                  <span>{t("featuresPage.scoring.sliders.askingPrice")}</span>
                  <strong>€{simAskingPrice.toLocaleString()}</strong>
                </div>
                <input
                  type="range"
                  min="3000"
                  max="40000"
                  step="200"
                  value={simAskingPrice}
                  onChange={(e) => setSimAskingPrice(Number(e.target.value))}
                />
              </div>

              <div className="sim-slider-row-2col">
                <div className="sim-slider-group">
                  <div className="sim-slider-label">
                    <span>{t("featuresPage.scoring.sliders.year")}</span>
                    <strong>
                      {simYear} ({age} {t("featuresPage.scoring.yearsOld")})
                    </strong>
                  </div>
                  <input
                    type="range"
                    min="2005"
                    max="2025"
                    step="1"
                    value={simYear}
                    onChange={(e) => setSimYear(Number(e.target.value))}
                  />
                </div>

                <div className="sim-slider-group">
                  <div className="sim-slider-label">
                    <span>{t("featuresPage.scoring.sliders.depPer10k")}</span>
                    <strong>€{simDepPer10k}/10k km</strong>
                  </div>
                  <input
                    type="range"
                    min="200"
                    max="1800"
                    step="50"
                    value={simDepPer10k}
                    onChange={(e) => setSimDepPer10k(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="sim-slider-group">
                <div className="sim-slider-label">
                  <span>{t("featuresPage.scoring.sliders.mileage")}</span>
                  <strong>{simMileage.toLocaleString()} km</strong>
                </div>
                <input
                  type="range"
                  min="5000"
                  max="450000"
                  step="5000"
                  value={simMileage}
                  onChange={(e) => setSimMileage(Number(e.target.value))}
                />
              </div>

              <div className="sim-slider-group">
                <div className="sim-slider-label">
                  <span>
                    {t("featuresPage.scoring.sliders.expectedMileage")}
                  </span>
                  <strong>{simBaselineMileage.toLocaleString()} km</strong>
                </div>
                <input
                  type="range"
                  min="30000"
                  max="350000"
                  step="5000"
                  value={simBaselineMileage}
                  onChange={(e) =>
                    setSimBaselineMileage(Number(e.target.value))
                  }
                />
              </div>

              <label className="sim-checkbox-row">
                <input
                  type="checkbox"
                  checked={simIsDamaged}
                  onChange={(e) => setSimIsDamaged(e.target.checked)}
                />
                <span>{t("featuresPage.scoring.damagedToggle")}</span>
              </label>
            </div>

            <div className="sim-metrics-grid">
              <div className="sim-mini-stat">
                <span>{t("featuresPage.scoring.stats.expectedPrice")}</span>
                <strong>€{expectedPrice.toLocaleString()}</strong>
              </div>
              <div className="sim-mini-stat">
                <span>{t("featuresPage.scoring.stats.priceDiffPct")}</span>
                <strong
                  style={{
                    color:
                      priceDiffPct > 35
                        ? "#dc2626"
                        : priceDiffPct >= 0
                        ? "#059669"
                        : "#d97706",
                  }}
                >
                  {priceDiffPct >= 0 ? "+" : ""}
                  {priceDiffPct.toFixed(1)}%
                </strong>
              </div>
              <div className="sim-mini-stat">
                <span>{t("featuresPage.scoring.stats.tierMod")}</span>
                <strong>
                  {priceMod >= 0 ? "+" : ""}
                  {priceMod.toFixed(1)} pct
                </strong>
              </div>
            </div>

            <div className="sim-Subscores">
              <div className="sim-subscore-row">
                <span>{t("featuresPage.scoring.subscores.finalBar")}</span>
                <div className="sim-bar-track">
                  <div
                    className="sim-bar-fill"
                    style={{ width: `${finalScore}%` }}
                  />
                </div>
                <strong>{finalScore}/100</strong>
              </div>
            </div>

            <div className="sim-flags-list">
              {isLowMileage && (
                <span className="sim-flag-chip flag-warn">
                  ⚠️ {t("featuresPage.scoring.flags.lowMileage")} (
                  {lowMileagePenalty} pct, prag {suspiciouslyLowThreshold.toLocaleString()}{" "}
                  km)
                </span>
              )}
              {isScamCap && (
                <span className="sim-flag-chip flag-danger">
                  🛑 {t("featuresPage.scoring.flags.scamCap")} (Max 20.0)
                </span>
              )}
              {isTaxi && (
                <span className="sim-flag-chip flag-warn">
                  🚕 {t("featuresPage.scoring.flags.taxi")} (-20.0 pct,{" "}
                  {Math.round(simMileage / age).toLocaleString()} km/an)
                </span>
              )}
              {priceDiffPct > 35 && (
                <span className="sim-flag-chip flag-danger">
                  📉 {t("featuresPage.scoring.flags.tooCheap")} (-2.0 pct / 1%
                  peste 35%)
                </span>
              )}
              {simIsDamaged && (
                <span className="sim-flag-chip flag-danger">
                  🔧 {t("featuresPage.scoring.flags.damagedCap")} (Max 10.0)
                </span>
              )}
              {!isLowMileage &&
                !isScamCap &&
                !isTaxi &&
                priceDiffPct <= 35 &&
                !simIsDamaged && (
                  <span className="sim-flag-chip flag-ok">
                    ✓ {t("featuresPage.scoring.flags.clean")}
                  </span>
                )}
            </div>
          </div>
        </section>

        {/* SECTION 2: INTERACTIVE ANOMALY & RISK LAB */}
        <section id="risk-lab" className="feature-lab-card">
          <div className="feature-lab-info">
            <span className="feature-step-tag">
              02 · {t("featuresPage.risk.tag")}
            </span>
            <h2>{t("featuresPage.risk.title")}</h2>
            <p className="feature-lab-lead">
              {t("featuresPage.risk.description")}
            </p>

            <ul className="feature-explicit-list">
              <li>
                <strong>{t("featuresPage.risk.points.percentilesTitle")}:</strong>{" "}
                {t("featuresPage.risk.points.percentilesDesc")}
              </li>
              <li>
                <strong>{t("featuresPage.risk.points.overrideTitle")}:</strong>{" "}
                {t("featuresPage.risk.points.overrideDesc")}
              </li>
              <li>
                <strong>{t("featuresPage.risk.points.specsTitle")}:</strong>{" "}
                {t("featuresPage.risk.points.specsDesc")}
              </li>
            </ul>

            <Link to="/anomaly-risk" className="feature-inline-btn">
              {t("featuresPage.risk.tryButton")} →
            </Link>
          </div>

          <div className="feature-lab-interactive">
            <div className="sim-panel-header">
              <span>{t("featuresPage.risk.simTitle")}</span>
              <span
                className={`sim-score-pill ${
                  activeRisk.overall < 35
                    ? "sim-badge-good"
                    : activeRisk.overall < 65
                    ? "sim-badge-medium"
                    : "sim-badge-bad"
                }`}
              >
                {t("featuresPage.risk.anomalyScore")}: {activeRisk.overall} / 100
              </span>
            </div>

            <div className="scenario-buttons">
              {Object.keys(RISK_SCENARIOS).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`scenario-btn ${
                    riskScenario === key ? "active" : ""
                  }`}
                  onClick={() => setRiskScenario(key)}
                >
                  {t(`featuresPage.risk.scenarios.${key}.label`)}
                </button>
              ))}
            </div>

            <div className="percentile-visualizer">
              <div className="percentile-labels">
                <span>P10</span>
                <span>P25</span>
                <span>P50 (Median)</span>
                <span>P75</span>
                <span>P90</span>
              </div>
              <div className="percentile-bar-outer">
                <div className="percentile-zone-p10-p90" />
                <div className="percentile-zone-p25-p75" />
                <div
                  className="percentile-marker"
                  style={{ left: `${activeRisk.markerPercent}%` }}
                >
                  <span className="percentile-marker-tooltip">
                    {activeRisk.deviationText}
                  </span>
                </div>
              </div>
            </div>

            <div className="sim-Subscores">
              <div className="sim-subscore-row">
                <span>{t("featuresPage.risk.components.price")}</span>
                <div className="sim-bar-track">
                  <div
                    className="sim-bar-fill risk-fill"
                    style={{ width: `${activeRisk.priceScore}%` }}
                  />
                </div>
                <strong>{activeRisk.priceScore}/100</strong>
              </div>

              <div className="sim-subscore-row">
                <span>{t("featuresPage.risk.components.mileage")}</span>
                <div className="sim-bar-track">
                  <div
                    className="sim-bar-fill risk-fill"
                    style={{ width: `${activeRisk.mileageScore}%` }}
                  />
                </div>
                <strong>{activeRisk.mileageScore}/100</strong>
              </div>

              <div className="sim-subscore-row">
                <span>{t("featuresPage.risk.components.spec")}</span>
                <div className="sim-bar-track">
                  <div
                    className="sim-bar-fill risk-fill"
                    style={{ width: `${activeRisk.specScore}%` }}
                  />
                </div>
                <strong>{activeRisk.specScore}/100</strong>
              </div>
            </div>

            <p className="sim-verdict-note">
              {t(`featuresPage.risk.scenarios.${activeRisk.ruleKey}.explanation`)}
            </p>
          </div>
        </section>

        {/* SECTION 3: INTERACTIVE PRICE ESTIMATOR & STRATEGY */}
        <section id="estimator-lab" className="feature-lab-card">
          <div className="feature-lab-info">
            <span className="feature-step-tag">
              03 · {t("featuresPage.estimator.tag")}
            </span>
            <h2>{t("featuresPage.estimator.title")}</h2>
            <p className="feature-lab-lead">
              {t("featuresPage.estimator.description")}
            </p>

            <ul className="feature-explicit-list">
              <li>
                <strong>{t("featuresPage.estimator.points.minSupportTitle")}:</strong>{" "}
                {t("featuresPage.estimator.points.minSupportDesc")}
              </li>
              <li>
                <strong>{t("featuresPage.estimator.points.weightingTitle")}:</strong>{" "}
                {t("featuresPage.estimator.points.weightingDesc")}
              </li>
              <li>
                <strong>{t("featuresPage.estimator.points.bandsTitle")}:</strong>{" "}
                {t("featuresPage.estimator.points.bandsDesc")}
              </li>
            </ul>

            <Link to="/#price-estimator" className="feature-inline-btn">
              {t("featuresPage.estimator.tryButton")} →
            </Link>
          </div>

          <div className="feature-lab-interactive">
            <div className="sim-panel-header">
              <span>{t("featuresPage.estimator.simTitle")}</span>
              <span className="sim-score-pill sim-badge-good">
                {activeStrategy.percentileRange}
              </span>
            </div>

            <div className="scenario-buttons">
              {["fast", "normal", "higher"].map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`scenario-btn ${
                    pricingStrategy === key ? "active" : ""
                  }`}
                  onClick={() => setPricingStrategy(key)}
                >
                  {t(`featuresPage.estimator.strategies.${key}.title`)}
                </button>
              ))}
            </div>

            <div className="strategy-result-box">
              <div className="strategy-price-range">
                <span>
                  {t(`featuresPage.estimator.strategies.${pricingStrategy}.title`)}{" "}
                  ({activeStrategy.percentileRange})
                </span>
                <strong>
                  €
                  {Math.round(
                    15000 * activeStrategy.multiplierMin
                  ).toLocaleString()}{" "}
                  – €
                  {Math.round(
                    15000 * activeStrategy.multiplierMax
                  ).toLocaleString()}
                </strong>
              </div>

              <div className="strategy-metrics">
                <div className="strategy-metric">
                  <span>{t("featuresPage.estimator.metrics.estimatedTime")}</span>
                  <strong>
                    {activeStrategy.days} {t("featuresPage.estimator.metrics.days")}
                  </strong>
                </div>
                <div className="strategy-metric">
                  <span>{t("featuresPage.estimator.metrics.buyerInterest")}</span>
                  <strong>{activeStrategy.demand}%</strong>
                </div>
              </div>

              <div className="sim-bar-track">
                <div
                  className="sim-bar-fill"
                  style={{ width: `${activeStrategy.demand}%` }}
                />
              </div>

              <p className="sim-verdict-note">
                {t(
                  `featuresPage.estimator.strategies.${pricingStrategy}.explanation`
                )}
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 4: INTERACTIVE ARCHITECTURE & TOOLS PIPELINE */}
        <section id="pipeline-lab" className="feature-pipeline-section">
          <div className="feature-pipeline-header">
            <span className="features-eyebrow">
              04 · {t("featuresPage.pipeline.tag")}
            </span>
            <h2>{t("featuresPage.pipeline.title")}</h2>
            <p>{t("featuresPage.pipeline.subtitle")}</p>
          </div>

          <div className="pipeline-steps-tabs">
            {pipelineSteps.map((stepIdx) => (
              <button
                key={stepIdx}
                type="button"
                className={`pipeline-tab-btn ${
                  activeStep === stepIdx ? "active" : ""
                }`}
                onClick={() => setActiveStep(stepIdx)}
              >
                <span className="pipeline-step-num">0{stepIdx + 1}</span>
                <span>
                  {t(`featuresPage.pipeline.steps.${stepIdx}.shortTitle`)}
                </span>
              </button>
            ))}
          </div>

          <div className="pipeline-step-detail">
            <div className="pipeline-detail-main">
              <h3>{t(`featuresPage.pipeline.steps.${activeStep}.title`)}</h3>
              <p>{t(`featuresPage.pipeline.steps.${activeStep}.description`)}</p>
              <div className="pipeline-tech-badges">
                {(
                  t(`featuresPage.pipeline.steps.${activeStep}.badges`, {
                    returnObjects: true,
                  }) || []
                ).map((badge) => (
                  <span key={badge} className="pipeline-tech-badge">
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            <div className="pipeline-detail-Action">
              {activeStep === 0 && (
                <Link to="/listings" className="feature-inline-btn">
                  {t("featuresPage.scoring.tryButton")} →
                </Link>
              )}
              {activeStep === 1 && (
                <Link to="/recommendations" className="feature-inline-btn">
                  {t("featuresPage.pipeline.openRecommendations")} →
                </Link>
              )}
              {activeStep === 2 && (
                <Link to="/comparator" className="feature-inline-btn">
                  {t("featuresPage.pipeline.openComparator")} →
                </Link>
              )}
              {activeStep === 3 && (
                <Link to="/profile" className="feature-inline-btn">
                  {t("featuresPage.pipeline.openSaved")} →
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* BACK TO HOMEPAGE BUTTON */}
        <div className="features-footer-action">
          <Link to="/" className="features-home-btn">
            {t("featuresPage.backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
