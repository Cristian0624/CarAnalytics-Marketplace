import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import "../pages/AnomalyRiskPage.css";

import {
  getFieldLabel,
  extremeAnomalyMessage,
  hasOverallScore,
  riskExplanationItems,
  translateVehicleValue,
  usesCurrentRiskPolicy,
} from "../utils/anomalyRisk";
import { assessmentNumber } from "../utils/assessmentI18n";

function getToneFromPoints(points) {
  if (points == null) return "neutral";
  if (points <= 0.05) return "positive";
  if (points < 25) return "warning";
  return "danger";
}

function getDistributionData(price, expectedPrice, distMin, distMax, width = 1000, baselineY = 112, peakY = 14) {
  const points = price?.distribution?.points;
  const usableHeight = baselineY - peakY;
  const span = distMax - distMin;
  if (span <= 0) return null;

  let coords = [];
  if (points && points.length > 0) {
    coords = points.map((pt) => {
      const x = Math.max(0, Math.min(width, ((pt.price - distMin) / span) * width));
      const y = baselineY - Math.max(0, Math.min(1, pt.density)) * usableHeight;
      return {
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        price: pt.price,
        density: pt.density,
      };
    });
  } else if (price.p10 != null && price.p50 != null && price.p90 != null) {
    const sigma = Math.max(1, (price.p90 - price.p10) / 2.56);
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const p = distMin + (i / steps) * span;
      const density = Math.exp(-0.5 * Math.pow((p - price.p50) / sigma, 2));
      const x = (i / steps) * width;
      const y = baselineY - density * usableHeight;
      coords.push({
        x: Number(x.toFixed(1)),
        y: Number(y.toFixed(1)),
        price: p,
        density,
      });
    }
  }

  if (coords.length < 2) return null;

  let linePath = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    linePath += ` L ${coords[i].x} ${coords[i].y}`;
  }
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${baselineY} L ${coords[0].x} ${baselineY} Z`;

  let centralAreaPath = "";
  if (price.p10 != null && price.p90 != null) {
    const xP10 = Math.max(0, Math.min(width, ((price.p10 - distMin) / span) * width));
    const xP90 = Math.max(0, Math.min(width, ((price.p90 - distMin) / span) * width));
    const inside = coords.filter((c) => c.x >= xP10 && c.x <= xP90);
    if (inside.length > 0) {
      let cPath = `M ${xP10.toFixed(1)} ${baselineY}`;
      cPath += ` L ${xP10.toFixed(1)} ${inside[0].y}`;
      for (const pt of inside) {
        cPath += ` L ${pt.x} ${pt.y}`;
      }
      cPath += ` L ${xP90.toFixed(1)} ${inside[inside.length - 1].y}`;
      cPath += ` L ${xP90.toFixed(1)} ${baselineY} Z`;
      centralAreaPath = cPath;
    }
  }

  const getYAtPrice = (targetPrice) => {
    if (targetPrice == null) return baselineY;
    const targetX = Math.max(0, Math.min(width, ((targetPrice - distMin) / span) * width));
    for (let i = 0; i < coords.length - 1; i++) {
      if (targetX >= coords[i].x && targetX <= coords[i + 1].x) {
        const segSpan = coords[i + 1].x - coords[i].x;
        const ratio = segSpan === 0 ? 0 : (targetX - coords[i].x) / segSpan;
        return coords[i].y + ratio * (coords[i + 1].y - coords[i].y);
      }
    }
    return coords[coords.length - 1].y;
  };

  const yMedian = price.p50 != null ? getYAtPrice(price.p50) : baselineY;
  const yExpected = expectedPrice != null ? getYAtPrice(expectedPrice) : yMedian;
  const yAsking = price.actual_price != null ? getYAtPrice(price.actual_price) : baselineY;

  return {
    linePath,
    areaPath,
    centralAreaPath,
    baselineY,
    yMedian: Number(yMedian.toFixed(1)),
    yExpected: Number(yExpected.toFixed(1)),
    yAsking: Number(yAsking.toFixed(1)),
  };
}

function ContributionArrow({ direction, metric, t }) {
  const favorable = metric === "Încredere" ? direction === "up" : direction === "down";
  const tone = direction === "neutral" ? "neutral" : favorable ? "positive" : "negative";
  const visualDirection = tone === "positive" ? "up" : tone === "negative" ? "down" : "neutral";
  const label = t(`assessment.${tone}`);
  const metricLabel = t(
    `assessment.${metric === "Încredere" ? "confidence" : metric === "Anomalie" ? "anomaly" : "context"}`,
  );
  return (
    <span className={`risk-effect risk-effect-${tone}`}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d={
            visualDirection === "up"
              ? "M12 19V5m-6 6 6-6 6 6"
              : visualDirection === "down"
                ? "M12 5v14m-6-6 6 6 6-6"
                : "M5 12h14"
          }
        />
      </svg>
      <span>
        {metricLabel}
        <span className="risk-sr-only">: {label}</span>
      </span>
    </span>
  );
}

export default function AnomalyRiskResults({ result, vehicle }) {
  const { t } = useTranslation();
  const number = (value, digits = 0) =>
    value == null ? t("anomalyRiskResults.unavailable") : assessmentNumber(t, value, digits);

  const {
    price_anomaly: price,
    mileage_anomaly: mileage,
    specification_anomaly: specs,
  } = result.components;

  if (!usesCurrentRiskPolicy(result)) {
    return (
      <div className="risk-results">
        <div className="risk-results-heading">
          <h2>
            {vehicle.brand} {vehicle.model}
          </h2>
        </div>

        <article className="risk-detail-card">
          <h3>{t("anomalyRiskResults.historical.title")}</h3>
          <p>{t("anomalyRiskResults.historical.description")}</p>

          <dl className="risk-data-list">
            <div>
              <dt>{t("anomalyRiskResults.historical.overallScore")}</dt>
              <dd>{number(result.anomaly_score, 1)}</dd>
            </div>
            <div>
              <dt>{t("anomalyRiskResults.historical.priceScore")}</dt>
              <dd>{number(price.score, 1)}</dd>
            </div>
            <div>
              <dt>{t("anomalyRiskResults.historical.mileageScore")}</dt>
              <dd>{number(mileage.score, 1)}</dd>
            </div>
            <div>
              <dt>{t("anomalyRiskResults.historical.specificationScore")}</dt>
              <dd>{number(specs.score, 1)}</dd>
            </div>
            <div>
              <dt>{t("anomalyRiskResults.historical.savedRange")}</dt>
              <dd>
                {price.p10 == null
                  ? t("anomalyRiskResults.unavailable")
                  : `${number(price.p10)} € – ${number(price.p90)} €`}
              </dd>
            </div>
          </dl>

          <p>
            {t("anomalyRiskResults.historical.policy")}: {result.scoring_policy_version}
          </p>
        </article>
      </div>
    );
  }

  const scored = hasOverallScore(result);
  const rare = result.assessment_status === "very_rare";
  const partial = result.assessment_status === "partial";
  const lowConfidence = result.market_confidence === "low";
  const priceAvailable = price.score != null;
  const weights = result.effective_weights || {};

  const mileageRiskPts =
    mileage.risk_points != null
      ? Number(mileage.risk_points)
      : mileage.score != null && weights.mileage != null
        ? mileage.score * weights.mileage
        : null;
  const priceRiskPts =
    price.risk_points != null
      ? Number(price.risk_points)
      : price.score != null && weights.price != null
        ? price.score * weights.price
        : null;
  const specRiskPts =
    specs.risk_points != null
      ? Number(specs.risk_points)
      : specs.score != null && weights.specification != null
        ? specs.score * weights.specification
        : null;
  const rarityPts = Number(result.market_support?.rarity_penalty ?? 0);

  const dealScore = result.deal_score != null ? Number(result.deal_score) : null;
  const dealLevel =
    result.deal_level ||
    (dealScore != null
      ? dealScore >= 60
        ? "good"
        : dealScore >= 30
          ? "medium"
          : "bad"
      : null);

  // Step 1: Mileage vs Median
  const mileageHasGauge =
    mileage.actual_mileage != null &&
    mileage.expected_median_mileage != null &&
    mileage.expected_median_mileage > 0;
  const mileageDevPct =
    mileage.deviation_from_median_pct != null
      ? Number(mileage.deviation_from_median_pct)
      : mileageHasGauge
        ? ((mileage.actual_mileage - mileage.expected_median_mileage) / mileage.expected_median_mileage) * 100
        : null;

  const mileageGauge = useMemo(() => {
    if (!mileageHasGauge) return null;
    const med = mileage.expected_median_mileage;
    const act = mileage.actual_mileage;
    const lowRef = mileage.p05 ?? mileage.p10 ?? med * 0.4;
    const highRef = mileage.p95 ?? mileage.p90 ?? med * 1.6;
    const minM = Math.max(0, Math.min(lowRef, act, med * 0.55) * 0.9);
    const maxM = Math.max(highRef, act, med * 1.45) * 1.08;
    const span = Math.max(1, maxM - minM);
    const pos = (v) => Math.max(0, Math.min(100, ((v - minM) / span) * 100));
    const medPos = pos(med);
    const actPos = pos(act);
    const normLow = pos(med * 0.75);
    const normHigh = pos(med * 1.25);
    return {
      medPos,
      actPos,
      normLow,
      normWidth: Math.max(2, normHigh - normLow),
      deltaLeft: Math.min(medPos, actPos),
      deltaWidth: Math.abs(actPos - medPos),
    };
  }, [mileageHasGauge, mileage]);

  const mileageTone = getToneFromPoints(mileageRiskPts);
  const mileageFlagMsg = extremeAnomalyMessage(mileage.flag, t);

  // Step 2: Price vs Expected Price + Distribution Curve
  const expectedPrice = price.expected_price ?? price.p50;
  const showSeparateMedian =
    price.p50 != null && expectedPrice != null && Math.abs(expectedPrice - price.p50) >= 50;
  const priceGapEur =
    price.actual_price != null && expectedPrice != null
      ? price.actual_price - expectedPrice
      : null;
  const priceDevExpectedPct =
    price.deviation_from_expected_pct != null
      ? Number(price.deviation_from_expected_pct)
      : expectedPrice && price.actual_price != null
        ? ((price.actual_price - expectedPrice) / expectedPrice) * 100
        : price.deviation_from_p50_pct;

  const priceTone = getToneFromPoints(priceRiskPts);
  const priceFlagMsg = extremeAnomalyMessage(price.flag, t);

  const distMin = useMemo(() => {
    const candidates = [price.distribution?.min_price, price.p10, price.actual_price, expectedPrice].filter(
      (v) => v != null && Number.isFinite(v),
    );
    return candidates.length ? Math.min(...candidates) : 0;
  }, [price, expectedPrice]);

  const distMax = useMemo(() => {
    const candidates = [price.distribution?.max_price, price.p90, price.actual_price, expectedPrice].filter(
      (v) => v != null && Number.isFinite(v),
    );
    return candidates.length ? Math.max(...candidates) : 1000;
  }, [price, expectedPrice]);

  const position = (value) =>
    distMax === distMin || value == null
      ? 50
      : Math.max(0, Math.min(100, ((value - distMin) / (distMax - distMin)) * 100));

  const distData = useMemo(
    () => getDistributionData(price, expectedPrice, distMin, distMax),
    [price, expectedPrice, distMin, distMax],
  );

  const priceDirectionWord =
    priceDevExpectedPct < 0
      ? t("anomalyRiskResults.price.below")
      : priceDevExpectedPct > 0
        ? t("anomalyRiskResults.price.above")
        : t("anomalyRiskResults.price.equal");

  const expectedPos = position(expectedPrice);
  const actualPos = position(price.actual_price);
  const deltaLeft = Math.min(expectedPos, actualPos);
  const deltaWidth = Math.abs(actualPos - expectedPos);

  const unusualSpecs = (specs?.signals || []).filter((s) => s.score != null && s.score > 0);
  const ptsUnit = t("anomalyRiskResults.breakdown.pts");

  return (
    <div className="risk-results risk-results-clean">
      {/* Compact Header */}
      <div className="risk-clean-header">
        <h2>
          {vehicle.brand} {vehicle.model}
        </h2>
        <p>
          {[
            vehicle.generation,
            vehicle.year,
            vehicle.mileage != null ? `${number(vehicle.mileage)} km` : null,
            price.actual_price != null ? `${number(price.actual_price)} €` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* 1. AT-A-GLANCE VERDICT BANNER (using <div> so global section padding never leaks) */}
      <div className="risk-verdict-banner">
        <div
          className={`risk-verdict-main ${
            scored ? `risk-level-${result.risk_level}` : "risk-unavailable"
          }`}
        >
          <span className="risk-verdict-eyebrow">
            {scored
              ? t("anomalyRiskResults.overview.overallScore")
              : partial
                ? t("assessment.partialTitle")
                : t("anomalyRiskResults.overview.overallEvaluation")}
          </span>

          {scored ? (
            <>
              <div className="risk-verdict-score-row">
                <strong className="risk-verdict-number">
                  {number(result.anomaly_score, 0)}
                  <small>/ 100</small>
                </strong>
                <span className={`risk-level-pill risk-level-pill-${result.risk_level}`}>
                  {t(`anomalyRiskResults.levels.${result.risk_level}`)}
                </span>
              </div>

              <div className="risk-verdict-chips">
                <span>
                  {t("anomalyRiskResults.breakdown.mileage")}:{" "}
                  <strong>{mileageRiskPts == null ? "—" : `+${number(mileageRiskPts, 0)}`}</strong>
                </span>
                <span>
                  {t("anomalyRiskResults.breakdown.price")}:{" "}
                  <strong>{priceRiskPts == null ? "—" : `+${number(priceRiskPts, 0)}`}</strong>
                </span>
                {specRiskPts != null && specRiskPts > 0.4 && (
                  <span>
                    {t("anomalyRiskResults.breakdown.specs")}:{" "}
                    <strong>+{number(specRiskPts, 0)}</strong>
                  </span>
                )}
                {rarityPts > 0 && (
                  <span>
                    {t("anomalyRiskResults.breakdown.rarity")}:{" "}
                    <strong>+{number(rarityPts, 0)}</strong>
                  </span>
                )}
              </div>

              <p className="risk-verdict-caption">{t("anomalyRiskResults.overview.higherScore")}</p>
            </>
          ) : (
            <p className="risk-verdict-empty">
              {partial
                ? t("assessment.partialDescription")
                : t("anomalyRiskResults.overview.insufficientScore")}
            </p>
          )}
        </div>

        <div className="risk-verdict-side">
          {dealScore != null && dealLevel && (
            <div className="risk-verdict-deal">
              <span className={`risk-deal-badge risk-deal-badge-${dealLevel}`}>
                {Math.round(dealScore)}
              </span>
              <div className="risk-deal-grade-meta">
                <span className="risk-verdict-side-label">
                  {t("anomalyRiskResults.dealGrade.label")}
                </span>
                <strong>{t(`anomalyRiskResults.dealGrade.levels.${dealLevel}`)}</strong>
                <small>{number(dealScore, 0)} / 80</small>
              </div>
            </div>
          )}

          <div className="risk-verdict-meta-pills">
            <span>
              {t("anomalyRiskResults.overview.analysisConfidence")}:{" "}
              <strong>{t(`anomalyRiskResults.confidenceLevels.${result.market_confidence}`)}</strong>
            </span>
            <span>
              <strong>{number(result.market_support.model_generation_observations)}</strong>{" "}
              {t("anomalyRiskResults.overview.examples")}
            </span>
          </div>
        </div>
      </div>

      {(rare || partial || lowConfidence || result.assessment_status === "limited_support") && (
        <div className="risk-clean-caution" role="note">
          <strong>
            {rare
              ? t("anomalyRiskResults.caution.fewExamplesTitle")
              : partial
                ? t("assessment.partialCaution")
                : t("anomalyRiskResults.caution.cautionTitle")}
          </strong>
          <span>
            {rare
              ? t("anomalyRiskResults.caution.fewExamplesDescription")
              : partial
                ? t("assessment.partialCautionDescription")
                : t("anomalyRiskResults.caution.cautionDescription")}
          </span>
        </div>
      )}

      {/* 2. TWO VISUAL CHECK CARDS: MILEAGE + PRICE (WITH DISTRIBUTION CURVE & EXPLANATIONS) */}
      <div className="risk-checks-grid">
        {/* STEP 1: MILEAGE */}
        <article className="risk-check-card">
          <div className="risk-check-top">
            <div>
              <span className="risk-step-badge risk-step-badge-1">
                {t("anomalyRiskResults.steps.mileageStep")}
              </span>
              <h3>
                {mileage.actual_mileage == null
                  ? t("anomalyRiskResults.mileage.unspecified")
                  : t(`anomalyRiskResults.mileageLabels.${mileage.direction}`)}
              </h3>
            </div>
            <strong className={`risk-pts-pill risk-pts-pill-${mileageTone}`}>
              {mileageRiskPts == null ? "—" : `+${number(mileageRiskPts, 0)} ${ptsUnit}`}
            </strong>
          </div>

          <div className="risk-compare-pair">
            <div>
              <span>{t("anomalyRiskResults.mileage.realMileage")}</span>
              <strong>
                {mileage.actual_mileage == null
                  ? t("anomalyRiskResults.mileage.unspecified")
                  : `${number(mileage.actual_mileage)} km`}
              </strong>
            </div>
            <div>
              <span>{t("anomalyRiskResults.mileage.observedMedian")}</span>
              <strong className="is-expected">
                {mileage.expected_median_mileage == null
                  ? t("anomalyRiskResults.mileage.unavailable")
                  : `${number(mileage.expected_median_mileage)} km`}
              </strong>
            </div>
            {mileageDevPct != null && (
              <div className={`risk-diff-tag risk-diff-tag-${mileageTone}`}>
                {mileageDevPct > 0 ? "+" : ""}
                {number(mileageDevPct, 0)}%
              </div>
            )}
          </div>

          {mileageGauge && (
            <div className="risk-simple-gauge" role="group" aria-label={t("anomalyRiskResults.mileage.label")}>
              <div className="risk-simple-gauge-bar">
                <div
                  className="risk-mileage-normal-zone"
                  style={{
                    left: `${mileageGauge.normLow}%`,
                    width: `${mileageGauge.normWidth}%`,
                  }}
                />
                <div
                  className={`risk-delta-connector risk-delta-connector-${mileageTone}`}
                  style={{
                    left: `${mileageGauge.deltaLeft}%`,
                    width: `${mileageGauge.deltaWidth}%`,
                  }}
                />
                <div
                  className="risk-median risk-expected-marker"
                  style={{ left: `${mileageGauge.medPos}%` }}
                  aria-hidden="true"
                />
                <div
                  className={`risk-asking risk-pin-${mileageTone}`}
                  style={{ left: `${mileageGauge.actPos}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="risk-simple-gauge-legend">
                <span>
                  <i className="legend-dot legend-dot-expected" />
                  {t("anomalyRiskResults.mileage.medianShort")}: {number(mileage.expected_median_mileage)} km
                </span>
                <span>
                  <i className={`legend-dot legend-dot-${mileageTone}`} />
                  {t("anomalyRiskResults.mileage.realMileage")}: {number(mileage.actual_mileage)} km
                </span>
              </div>
            </div>
          )}

          <p className="risk-check-explanation">
            {t("anomalyRiskResults.mileage.comparison")}:{" "}
            <strong>{t(`anomalyRiskResults.comparisonLabels.${mileage.comparison_level}`)}</strong>.{" "}
            {t("anomalyRiskResults.mileage.warning")}
          </p>

          {mileageFlagMsg && (
            <p className="risk-alert-note" role="note">
              <strong>{mileageFlagMsg}</strong>
            </p>
          )}
        </article>

        {/* STEP 2: PRICE VS EXPECTED PRICE + DISTRIBUTION GRAPH */}
        <article className="risk-check-card">
          <div className="risk-check-top">
            <div>
              <span className="risk-step-badge risk-step-badge-2">
                {t("anomalyRiskResults.steps.priceStep")}
              </span>
              <h3>{t(`anomalyRiskResults.priceLabels.${price.direction}`)}</h3>
            </div>
            <strong className={`risk-pts-pill risk-pts-pill-${priceTone}`}>
              {priceRiskPts == null ? "—" : `+${number(priceRiskPts, 0)} ${ptsUnit}`}
            </strong>
          </div>

          {priceAvailable ? (
            <>
              <div className="risk-compare-pair">
                <div>
                  <span>{t("anomalyRiskResults.price.realPrice")}</span>
                  <strong>{number(price.actual_price)} €</strong>
                </div>
                <div>
                  <span>{t("anomalyRiskResults.price.expectedPrice")}</span>
                  <strong className="is-expected">{number(expectedPrice)} €</strong>
                </div>
                {priceGapEur != null && (
                  <div className={`risk-diff-tag risk-diff-tag-${priceTone}`}>
                    {priceGapEur > 0 ? "+" : ""}
                    {number(priceGapEur)} €
                    {priceDevExpectedPct != null && (
                      <small>
                        {" "}
                        ({priceDevExpectedPct > 0 ? "+" : ""}
                        {number(priceDevExpectedPct, 0)}%)
                      </small>
                    )}
                  </div>
                )}
              </div>

              <div className="risk-simple-gauge" role="group" aria-label={t("anomalyRiskResults.price.chartAriaLabel")}>
                {distData && (
                  <div className="risk-clean-dist-graph">
                    <svg
                      className="risk-distribution-svg"
                      viewBox="0 0 1000 116"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="riskDistGradClean" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.28" />
                          <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.03" />
                        </linearGradient>
                        <linearGradient id="riskDistCentralGradClean" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0F766E" stopOpacity="0.42" />
                          <stop offset="100%" stopColor="#0F766E" stopOpacity="0.08" />
                        </linearGradient>
                      </defs>

                      <line
                        x1="0"
                        y1={distData.baselineY}
                        x2="1000"
                        y2={distData.baselineY}
                        stroke="var(--risk-svg-baseline, #CBD5E1)"
                        strokeWidth="1.5"
                      />
                      <path d={distData.areaPath} fill="url(#riskDistGradClean)" />
                      {distData.centralAreaPath && (
                        <path d={distData.centralAreaPath} fill="url(#riskDistCentralGradClean)" />
                      )}
                      <path
                        d={distData.linePath}
                        fill="none"
                        stroke="var(--risk-svg-curve, #0F766E)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />

                      {showSeparateMedian && (
                        <line
                          x1={`${(position(price.p50) * 10).toFixed(1)}`}
                          y1={distData.yMedian}
                          x2={`${(position(price.p50) * 10).toFixed(1)}`}
                          y2={distData.baselineY}
                          stroke="#94A3B8"
                          strokeWidth="1.5"
                          strokeDasharray="2 3"
                        />
                      )}

                      {expectedPrice != null && (
                        <>
                          <line
                            x1={`${(expectedPos * 10).toFixed(1)}`}
                            y1="4"
                            x2={`${(expectedPos * 10).toFixed(1)}`}
                            y2={distData.baselineY}
                            stroke="var(--risk-svg-expected, #0D9488)"
                            strokeWidth="2.2"
                            strokeDasharray="5 3"
                          />
                          <circle
                            cx={`${(expectedPos * 10).toFixed(1)}`}
                            cy={distData.yExpected}
                            r="5.5"
                            fill="var(--risk-svg-expected, #0D9488)"
                            stroke="var(--risk-svg-dot-stroke, #FFFFFF)"
                            strokeWidth="2.2"
                          />
                        </>
                      )}

                      {price.actual_price != null && (
                        <>
                          <line
                            x1={`${(actualPos * 10).toFixed(1)}`}
                            y1={distData.yAsking}
                            x2={`${(actualPos * 10).toFixed(1)}`}
                            y2={distData.baselineY}
                            stroke={
                              priceTone === "danger"
                                ? "#EF4444"
                                : priceTone === "warning"
                                  ? "#F59E0B"
                                  : "var(--risk-svg-asking, #17202A)"
                            }
                            strokeWidth="2.4"
                            strokeDasharray="3 3"
                          />
                          <circle
                            cx={`${(actualPos * 10).toFixed(1)}`}
                            cy={distData.yAsking}
                            r="6"
                            fill={
                              priceTone === "danger"
                                ? "#EF4444"
                                : priceTone === "warning"
                                  ? "#F59E0B"
                                  : "var(--risk-svg-asking, #17202A)"
                            }
                            stroke="var(--risk-svg-dot-stroke, #FFFFFF)"
                            strokeWidth="2.2"
                          />
                        </>
                      )}
                    </svg>
                  </div>
                )}

                <div className="risk-simple-gauge-bar">
                  <div
                    className="risk-range"
                    style={{
                      left: `${position(price.p10)}%`,
                      width: `${Math.max(1, position(price.p90) - position(price.p10))}%`,
                    }}
                  />
                  <div
                    className={`risk-delta-connector risk-delta-connector-${priceTone}`}
                    style={{
                      left: `${deltaLeft}%`,
                      width: `${deltaWidth}%`,
                    }}
                  />
                  <div
                    className="risk-median risk-expected-marker"
                    style={{ left: `${expectedPos}%` }}
                    aria-hidden="true"
                  />
                  <div
                    className={`risk-asking risk-pin-${priceTone}`}
                    style={{ left: `${actualPos}%` }}
                    aria-hidden="true"
                  />
                </div>

                <div className="risk-simple-gauge-legend">
                  <span>
                    <i className="legend-dot legend-dot-expected" />
                    {t("anomalyRiskResults.price.expectedPrice")}: {number(expectedPrice)} €
                  </span>
                  <span>
                    <i className={`legend-dot legend-dot-${priceTone}`} />
                    {t("anomalyRiskResults.price.realPrice")}: {number(price.actual_price)} €
                  </span>
                </div>

                <div className="risk-simple-range-note">
                  <span>{number(price.p10)} €</span>
                  <small>
                    {t("anomalyRiskResults.price.marketMedian")}: {number(price.p50)} €
                  </small>
                  <span>{number(price.p90)} €</span>
                </div>
              </div>

              <p className="risk-check-explanation">
                {t("anomalyRiskResults.price.deviationExpected", {
                  actual: number(price.actual_price),
                  percent: number(Math.abs(priceDevExpectedPct ?? 0), 1),
                  direction: priceDirectionWord,
                  expected: number(expectedPrice),
                  median: number(price.p50),
                })}
              </p>
            </>
          ) : (
            <p className="risk-check-explanation">
              {t("anomalyRiskResults.price.insufficient", {
                group: vehicle.generation
                  ? t("anomalyRiskResults.price.sameGeneration")
                  : t("anomalyRiskResults.price.sameModel"),
              })}
            </p>
          )}

          {priceFlagMsg && (
            <p className="risk-alert-note" role="note">
              <strong>{priceFlagMsg}</strong>
            </p>
          )}
        </article>
      </div>

      {/* Show unusual specs chip bar inline ONLY if something is actually unusual */}
      {unusualSpecs.length > 0 && (
        <div className="risk-unusual-inline">
          <span className="risk-step-badge risk-step-badge-3">
            {t("anomalyRiskResults.specification.title")}
          </span>
          <div className="risk-unusual-chips">
            {unusualSpecs.map((signal) => (
              <span key={signal.field} className="risk-spec-label risk-spec-unusual">
                {getFieldLabel(t, signal.field)}:{" "}
                <strong>{translateVehicleValue(t, signal.field, signal.value)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 3. COLLAPSIBLE TECHNICAL DETAILS */}
      <details className="risk-explanation risk-explanation-compact">
        <summary>
          <span>{t("anomalyRiskResults.explanation.title")}</span>
          <svg
            className="risk-explanation-chevron"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>

        <div className="risk-explanation-content">
          <ul role="list">
            {riskExplanationItems(result, vehicle, t).map(({ text, effect }) => (
              <li key={text}>
                <ContributionArrow
                  direction={effect?.direction ?? "neutral"}
                  metric={effect?.metric ?? "Context"}
                  t={t}
                />
                <p>{text}</p>
              </li>
            ))}
          </ul>

          {specs?.signals?.length > 0 && (
            <div className="risk-details-specs-strip">
              {specs.signals
                .filter((s) => s.value != null)
                .map((signal) => (
                  <span
                    key={signal.field}
                    className={`risk-spec-label ${
                      signal.score != null && signal.score > 0 ? "risk-spec-unusual" : ""
                    }`}
                  >
                    {getFieldLabel(t, signal.field)}: {translateVehicleValue(t, signal.field, signal.value)}
                  </span>
                ))}
            </div>
          )}

          {priceAvailable && (
            <p className="risk-explanation-interval">
              {t("anomalyRiskResults.explanation.centralRange")}:{" "}
              <strong>
                {number(price.p25)} € – {number(price.p75)} €
              </strong>
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
