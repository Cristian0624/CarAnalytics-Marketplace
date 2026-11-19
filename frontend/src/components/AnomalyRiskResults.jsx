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

function clampPercent(pct, min = 8, max = 92) {
  return Math.max(min, Math.min(max, pct));
}

function getToneFromPoints(points) {
  if (points == null) return "neutral";
  if (points <= 0.05) return "positive";
  if (points < 25) return "warning";
  return "danger";
}

function getDistributionData(price, expectedPrice, distMin, distMax, width = 1000, baselineY = 125, peakY = 18) {
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
        const t = segSpan === 0 ? 0 : (targetX - coords[i].x) / segSpan;
        return coords[i].y + t * (coords[i + 1].y - coords[i].y);
      }
    }
    return coords[coords.length - 1].y;
  };

  const yMedian = price.p50 != null ? getYAtPrice(price.p50) : baselineY;
  const yExpected = expectedPrice != null ? getYAtPrice(expectedPrice) : yMedian;
  const yAsking = price.actual_price != null ? getYAtPrice(price.actual_price) : baselineY;

  return {
    coords,
    linePath,
    areaPath,
    centralAreaPath,
    baselineY,
    yMedian: Number(yMedian.toFixed(1)),
    yExpected: Number(yExpected.toFixed(1)),
    yAsking: Number(yAsking.toFixed(1)),
  };
}

function ComponentScore({ value, weight, riskPoints, flag, t, contextual = false }) {
  const number = (val, digits = 0) => assessmentNumber(t, val, digits);
  const message = extremeAnomalyMessage(flag, t);
  const addedPoints =
    riskPoints != null
      ? Number(riskPoints)
      : value != null && weight != null
        ? value * weight
        : null;
  const tone = getToneFromPoints(addedPoints);

  return (
    <>
      {message && (
        <p className="risk-alert-note" role="note">
          <strong>{message}</strong>
          {contextual && t("assessment.contextual")}
        </p>
      )}

      <div className="risk-component-score">
        <div className="risk-component-score-main">
          <span>{t("anomalyRiskResults.breakdown.pointsAdded")}</span>
          <strong className={`risk-pts-pill risk-pts-pill-${tone}`}>
            {addedPoints == null
              ? t("anomalyRiskResults.componentScore.unavailable")
              : `+${number(addedPoints, 1)} ${t("anomalyRiskResults.breakdown.pts")}`}
          </strong>
        </div>

        {value != null && (
          <small className="component-score-contribution">
            {t("anomalyRiskResults.componentScore.score")}:{" "}
            <strong>{number(value, 1)} / 100</strong>
          </small>
        )}
      </div>
    </>
  );
}

function ContributionArrow({ direction, metric, t }) {
  const favorable = metric === "Încredere" ? direction === "up" : direction === "down";
  const tone = direction === "neutral" ? "neutral" : favorable ? "positive" : "negative";
  const visualDirection = tone === "positive" ? "up" : tone === "negative" ? "down" : "neutral";
  const label = t(`assessment.${tone}`);
  const metricLabel = t(`assessment.${metric === "Încredere" ? "confidence" : metric === "Anomalie" ? "anomaly" : "context"}`);
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
      <section className="risk-results">
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
      </section>
    );
  }

  const scored = hasOverallScore(result);
  const rare = result.assessment_status === "very_rare";
  const partial = result.assessment_status === "partial";
  const lowConfidence = result.market_confidence === "low";
  const priceAvailable = price.score != null;
  const weights = result.effective_weights || {};

  // Exact additive risk points per step
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

  // Step 1: Mileage visual gauge calculations
  const mileageHasGauge =
    mileage.actual_mileage != null && mileage.expected_median_mileage != null && mileage.expected_median_mileage > 0;
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
      minM,
      maxM,
      medPos,
      actPos,
      normLow,
      normWidth: Math.max(2, normHigh - normLow),
      deltaLeft: Math.min(medPos, actPos),
      deltaWidth: Math.abs(actPos - medPos),
    };
  }, [mileageHasGauge, mileage]);

  const mileageTone = getToneFromPoints(mileageRiskPts);

  // Step 2: Price vs Expected Price calculations
  const expectedPrice = price.expected_price ?? price.p50;
  const mileageAdjEur =
    price.mileage_adjustment_eur != null
      ? Number(price.mileage_adjustment_eur)
      : expectedPrice != null && price.p50 != null
        ? Number((expectedPrice - price.p50).toFixed(2))
        : 0;
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

  const contextual =
    result.scoring_context?.mode === "contextual_weighted" ||
    (result.scoring_context?.mode === "blended" && result.scoring_context?.coherence_strength > 0);

  const priceDirectionWord =
    priceDevExpectedPct < 0
      ? t("anomalyRiskResults.price.below")
      : priceDevExpectedPct > 0
        ? t("anomalyRiskResults.price.above")
        : t("anomalyRiskResults.price.equal");

  const priceDescription = t("assessment.priceDescription", {
    count: number(price.count),
    group: t(vehicle.generation ? "assessment.sameGeneration" : "assessment.allGenerations"),
  });

  const expectedPos = position(expectedPrice);
  const actualPos = position(price.actual_price);
  const deltaLeft = Math.min(expectedPos, actualPos);
  const deltaWidth = Math.abs(actualPos - expectedPos);

  return (
    <div className="risk-results">
      <div className="risk-results-heading">
        <h2>
          {vehicle.brand} {vehicle.model}
        </h2>

        <p>
          {[
            vehicle.generation,
            vehicle.year,
            vehicle.mileage != null ? `${number(vehicle.mileage)} km` : null,
            `${t("anomalyRiskResults.header.askingPrice")}: ${
              price.actual_price == null
                ? t("anomalyRiskResults.unavailable")
                : `${number(price.actual_price)} €`
            }`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {!vehicle.generation && (
        <p className="risk-description risk-generation-note">
          {t("anomalyRiskResults.generationNote")}
        </p>
      )}

      <div className="risk-report-layout">
        {/* LEFT SIDEBAR: Overall Risk + Breakdown + Deal Score + Confidence + Support */}
        <div className="risk-overview">
          <div className="risk-summary">
            <article
              className={`risk-overall ${
                scored ? `risk-level-${result.risk_level}` : "risk-unavailable"
              }`}
            >
              <span>
                {scored
                  ? t("anomalyRiskResults.overview.overallScore")
                  : partial
                    ? t("assessment.partialTitle")
                    : t("anomalyRiskResults.overview.overallEvaluation")}
              </span>

              {scored ? (
                <>
                  <div className="risk-score-number">
                    {number(result.anomaly_score, 1)}
                    <small>/ 100</small>
                  </div>

                  <strong>
                    {t("anomalyRiskResults.overview.anomalyLevel")}:{" "}
                    {t(`anomalyRiskResults.levels.${result.risk_level}`)}
                  </strong>

                  <div className="risk-breakdown-box" aria-label={t("anomalyRiskResults.breakdown.title")}>
                    <span className="risk-breakdown-title">{t("anomalyRiskResults.breakdown.title")}</span>
                    <div className="risk-breakdown-rows">
                      <div className="risk-breakdown-row">
                        <span>1 · {t("anomalyRiskResults.breakdown.mileage")}</span>
                        <strong>
                          {mileageRiskPts == null ? "—" : `+${number(mileageRiskPts, 1)}`}
                        </strong>
                      </div>
                      <div className="risk-breakdown-row">
                        <span>2 · {t("anomalyRiskResults.breakdown.price")}</span>
                        <strong>
                          {priceRiskPts == null ? "—" : `+${number(priceRiskPts, 1)}`}
                        </strong>
                      </div>
                      {specRiskPts != null && (
                        <div className="risk-breakdown-row">
                          <span>3 · {t("anomalyRiskResults.breakdown.specs")}</span>
                          <strong>+{number(specRiskPts, 1)}</strong>
                        </div>
                      )}
                      {rarityPts > 0 && (
                        <div className="risk-breakdown-row">
                          <span>{t("anomalyRiskResults.breakdown.rarity")}</span>
                          <strong>+{number(rarityPts, 1)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  <p>{t("anomalyRiskResults.overview.higherScore")}</p>
                </>
              ) : (
                <>
                  <h3>
                    {partial
                      ? t("assessment.partialScore")
                      : t("anomalyRiskResults.overview.insufficientData")}
                  </h3>

                  <p>
                    {partial
                      ? t("assessment.partialDescription")
                      : t("anomalyRiskResults.overview.insufficientScore")}
                  </p>
                </>
              )}
            </article>

            <article className="risk-summary-card risk-deal-grade-card">
              <span>{t("anomalyRiskResults.dealGrade.label")}</span>

              {dealScore != null && dealLevel ? (
                <div className="risk-deal-grade-row">
                  <span className={`risk-deal-badge risk-deal-badge-${dealLevel}`}>
                    {Math.round(dealScore)}
                  </span>
                  <div className="risk-deal-grade-meta">
                    <strong>{t(`anomalyRiskResults.dealGrade.levels.${dealLevel}`)}</strong>
                    <small>{number(dealScore, 1)} / 80</small>
                  </div>
                </div>
              ) : (
                <>
                  <h3>{t("anomalyRiskResults.dealGrade.unavailable")}</h3>
                  <small>{t("anomalyRiskResults.overview.insufficientScore")}</small>
                </>
              )}
            </article>

            <article className="risk-summary-card">
              <span>{t("anomalyRiskResults.overview.analysisConfidence")}</span>

              <h3>{t(`anomalyRiskResults.confidenceLevels.${result.market_confidence}`)}</h3>

              <p>{number(result.confidence_score, 1)} / 100</p>

              <small>{t("anomalyRiskResults.overview.confidenceDescription")}</small>
            </article>

            <article className="risk-summary-card">
              <span>
                {t(`anomalyRiskResults.supportLabels.${result.market_support.support_level}`)}
              </span>

              <h3>
                {number(result.market_support.model_generation_observations)}{" "}
                <small>{t("anomalyRiskResults.overview.examples")}</small>
              </h3>

              <p>
                {vehicle.generation
                  ? t("anomalyRiskResults.overview.sameModelGeneration")
                  : t("anomalyRiskResults.overview.allGenerations")}{" "}
                {t("anomalyRiskResults.overview.databaseAtAnalysis")}
              </p>

              <small>
                {scored
                  ? t("anomalyRiskResults.overview.rarityAdjustment", {
                      points: number(result.market_support.rarity_penalty, 1),
                    })
                  : t("anomalyRiskResults.overview.overallScoreUnavailable")}
              </small>
            </article>
          </div>

          {(rare || partial || lowConfidence || result.assessment_status === "limited_support") && (
            <div className="risk-caution" role="note">
              <strong>
                {rare
                  ? t("anomalyRiskResults.caution.fewExamplesTitle")
                  : partial
                    ? t("assessment.partialCaution")
                    : t("anomalyRiskResults.caution.cautionTitle")}
              </strong>

              <p>
                {rare
                  ? t("anomalyRiskResults.caution.fewExamplesDescription")
                  : partial
                    ? t("assessment.partialCautionDescription")
                    : t("anomalyRiskResults.caution.cautionDescription")}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Sequential Algorithm Cards (Step 1 Mileage -> Step 2 Price vs Expected -> Step 3 Specs) */}
        <div className="risk-steps-column">
          {/* STEP 1: MILEAGE CHECK */}
          <article className="risk-detail-card risk-mileage-card">
            <div className="risk-card-heading">
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

              {mileage.age_adjustment_factor != null && mileage.age_adjustment_factor < 1 && (
                <span className="risk-leniency-pill">
                  {t("anomalyRiskResults.mileage.youngLeniency", {
                    age: number(mileage.vehicle_age_years ?? 0),
                  })}
                </span>
              )}
            </div>

            <div className="risk-kpi-strip">
              <div className="risk-kpi-box risk-kpi-real">
                <span>{t("anomalyRiskResults.mileage.realMileage")}</span>
                <strong>
                  {mileage.actual_mileage == null
                    ? t("anomalyRiskResults.mileage.unspecified")
                    : `${number(mileage.actual_mileage)} km`}
                </strong>
              </div>

              <div className="risk-kpi-box risk-kpi-expected">
                <span>{t("anomalyRiskResults.mileage.observedMedian")}</span>
                <strong>
                  {mileage.expected_median_mileage == null
                    ? t("anomalyRiskResults.mileage.unavailable")
                    : `${number(mileage.expected_median_mileage)} km`}
                </strong>
                {mileage.sample_size > 0 && (
                  <small>
                    {number(mileage.sample_size)} {t("anomalyRiskResults.overview.examples")}
                  </small>
                )}
              </div>

              <div className={`risk-kpi-box risk-kpi-delta risk-kpi-tone-${mileageTone}`}>
                <span>{t("anomalyRiskResults.mileage.deviation")}</span>
                <strong>
                  {mileageDevPct == null
                    ? t("anomalyRiskResults.unavailable")
                    : `${mileageDevPct > 0 ? "+" : ""}${number(mileageDevPct, 1)}%`}
                </strong>
                <small>{t("anomalyRiskResults.mileage.normalBand")}</small>
              </div>
            </div>

            {mileageGauge && (
              <div className="risk-mileage-gauge" role="group" aria-label={t("anomalyRiskResults.mileage.label")}>
                <div className="risk-gauge-top-labels">
                  <div
                    className="risk-gauge-pill risk-gauge-pill-median"
                    style={{ left: `${clampPercent(mileageGauge.medPos, 14, 86)}%` }}
                  >
                    <span>{t("anomalyRiskResults.mileage.medianShort")}</span>
                    <strong>{number(mileage.expected_median_mileage)} km</strong>
                  </div>
                </div>

                <div className="risk-mileage-track">
                  <div
                    className="risk-mileage-normal-zone"
                    style={{
                      left: `${mileageGauge.normLow}%`,
                      width: `${mileageGauge.normWidth}%`,
                    }}
                    title={t("anomalyRiskResults.mileage.normalBand")}
                  />

                  <div
                    className={`risk-delta-connector risk-delta-connector-${mileageTone}`}
                    style={{
                      left: `${mileageGauge.deltaLeft}%`,
                      width: `${mileageGauge.deltaWidth}%`,
                    }}
                  />

                  <div
                    className="risk-median"
                    style={{ left: `${mileageGauge.medPos}%` }}
                    aria-hidden="true"
                  />

                  <div
                    className={`risk-asking risk-pin-${mileageTone}`}
                    style={{ left: `${mileageGauge.actPos}%` }}
                    aria-hidden="true"
                  />
                </div>

                <div className="risk-gauge-bottom-labels">
                  <div
                    className="risk-gauge-pill risk-gauge-pill-real"
                    style={{ left: `${clampPercent(mileageGauge.actPos, 14, 86)}%` }}
                  >
                    <span>{t("anomalyRiskResults.mileage.realMileage")}</span>
                    <strong>{number(mileage.actual_mileage)} km</strong>
                  </div>
                </div>
              </div>
            )}

            <p className="risk-description">
              {t("anomalyRiskResults.mileage.comparison")}:{" "}
              {t(`anomalyRiskResults.comparisonLabels.${mileage.comparison_level}`)}.{" "}
              {t("anomalyRiskResults.mileage.warning")}
            </p>

            <ComponentScore
              value={mileage.score}
              weight={weights.mileage}
              riskPoints={mileageRiskPts}
              flag={mileage.flag}
              contextual={contextual}
              t={t}
            />
          </article>

          {/* STEP 2: REAL PRICE VS EXPECTED PRICE */}
          <article className="risk-detail-card risk-price-card">
            <div className="risk-card-heading">
              <div>
                <span className="risk-step-badge risk-step-badge-2">
                  {t("anomalyRiskResults.steps.priceStep")}
                </span>

                <h3>{t(`anomalyRiskResults.priceLabels.${price.direction}`)}</h3>
              </div>

              {priceAvailable && price.count >= 10 && (
                <div className="risk-distribution-badge">
                  <span className="risk-distribution-badge-dot" aria-hidden="true" />
                  <span>
                    {t("anomalyRiskResults.price.distributionBadge", {
                      count: number(price.count),
                    })}
                  </span>
                </div>
              )}
            </div>

            <p className="risk-description">
              {priceDescription}
              {price.support_level === "limited" && t("anomalyRiskResults.price.limitedSupport")}
            </p>

            {priceAvailable ? (
              <>
                {/* 3-Box Price Comparison Strip: Real Price vs Expected Price vs Gap */}
                <div className="risk-kpi-strip">
                  <div className="risk-kpi-box risk-kpi-real">
                    <span>{t("anomalyRiskResults.price.realPrice")}</span>
                    <strong>{number(price.actual_price)} €</strong>
                  </div>

                  <div className="risk-kpi-box risk-kpi-expected">
                    <span>{t("anomalyRiskResults.price.expectedPrice")}</span>
                    <strong>{number(expectedPrice)} €</strong>
                    <small>
                      {showSeparateMedian
                        ? `${t("anomalyRiskResults.price.marketMedian")}: ${number(price.p50)} € (${
                            mileageAdjEur > 0 ? "+" : ""
                          }${number(mileageAdjEur)} € ${t("anomalyRiskResults.price.mileageAdj")})`
                        : t("anomalyRiskResults.price.expectedPriceSub")}
                    </small>
                  </div>

                  <div className={`risk-kpi-box risk-kpi-delta risk-kpi-tone-${priceTone}`}>
                    <span>{t("anomalyRiskResults.price.difference")}</span>
                    <strong>
                      {priceGapEur == null
                        ? t("anomalyRiskResults.unavailable")
                        : `${priceGapEur > 0 ? "+" : ""}${number(priceGapEur)} €`}
                    </strong>
                    {priceDevExpectedPct != null && (
                      <small>
                        {priceDevExpectedPct > 0 ? "+" : ""}
                        {number(priceDevExpectedPct, 1)}% vs. {t("anomalyRiskResults.price.expectedPrice")}
                      </small>
                    )}
                  </div>
                </div>

                {/* Price Market Curve + Expected Price vs Real Price Visual Plot */}
                <div
                  className="risk-price-chart-modern"
                  role="group"
                  aria-label={t("anomalyRiskResults.price.chartAriaLabel")}
                >
                  {/* Top floating label for Expected Price (always cleanly separated above curve) */}
                  <div className="risk-chart-top-track">
                    <div
                      className="risk-chart-marker-pill risk-marker-pill-expected"
                      style={{ left: `${clampPercent(expectedPos, 14, 86)}%` }}
                    >
                      <span>{t("anomalyRiskResults.price.expectedPrice")}</span>
                      <strong>{number(expectedPrice)} €</strong>
                    </div>
                  </div>

                  {distData && (
                    <div className="risk-distribution-graph">
                      <svg
                        className="risk-distribution-svg"
                        viewBox="0 0 1000 130"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <defs>
                          <linearGradient id="riskDistGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.02" />
                          </linearGradient>
                          <linearGradient id="riskDistCentralGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0F766E" stopOpacity="0.40" />
                            <stop offset="100%" stopColor="#0F766E" stopOpacity="0.08" />
                          </linearGradient>
                        </defs>

                        <line
                          x1="0"
                          y1={distData.baselineY}
                          x2="1000"
                          y2={distData.baselineY}
                          stroke="#CBD5E1"
                          strokeWidth="1.5"
                        />

                        <path d={distData.areaPath} fill="url(#riskDistGrad)" />

                        {distData.centralAreaPath && (
                          <path d={distData.centralAreaPath} fill="url(#riskDistCentralGrad)" />
                        )}

                        <path
                          d={distData.linePath}
                          fill="none"
                          stroke="#0F766E"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />

                        {/* Subtle raw P50 market median guide when distinct from expected price */}
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

                        {/* Expected Price vertical dashed line + glowing emerald circle */}
                        {expectedPrice != null && (
                          <>
                            <line
                              x1={`${(expectedPos * 10).toFixed(1)}`}
                              y1="2"
                              x2={`${(expectedPos * 10).toFixed(1)}`}
                              y2={distData.baselineY}
                              stroke="#0D9488"
                              strokeWidth="2.2"
                              strokeDasharray="5 3"
                            />
                            <circle
                              cx={`${(expectedPos * 10).toFixed(1)}`}
                              cy={distData.yExpected}
                              r="5.5"
                              fill="#0D9488"
                              stroke="#FFFFFF"
                              strokeWidth="2.2"
                            />
                          </>
                        )}

                        {/* Real Asking Price vertical dashed line + dark/toned dot */}
                        {price.actual_price != null && (
                          <>
                            <line
                              x1={`${(actualPos * 10).toFixed(1)}`}
                              y1={distData.yAsking}
                              x2={`${(actualPos * 10).toFixed(1)}`}
                              y2={distData.baselineY}
                              stroke={priceTone === "danger" ? "#DC2626" : priceTone === "warning" ? "#D97706" : "#17202A"}
                              strokeWidth="2.4"
                              strokeDasharray="3 3"
                            />
                            <circle
                              cx={`${(actualPos * 10).toFixed(1)}`}
                              cy={distData.yAsking}
                              r="6"
                              fill={priceTone === "danger" ? "#DC2626" : priceTone === "warning" ? "#D97706" : "#17202A"}
                              stroke="#FFFFFF"
                              strokeWidth="2.2"
                            />
                          </>
                        )}
                      </svg>
                    </div>
                  )}

                  {/* Horizontal Range Bar with P10-P90, Expected-to-Real Delta Connector & Pins */}
                  <div className="risk-price-plot">
                    <div
                      className="risk-range"
                      style={{
                        left: `${position(price.p10)}%`,
                        width: `${Math.max(1, position(price.p90) - position(price.p10))}%`,
                      }}
                    />

                    {/* Highlighted delta segment connecting Expected Price <-> Real Price */}
                    <div
                      className={`risk-delta-connector risk-delta-connector-${priceTone}`}
                      style={{
                        left: `${deltaLeft}%`,
                        width: `${deltaWidth}%`,
                      }}
                    />

                    {showSeparateMedian && (
                      <div
                        className="risk-raw-median-tick"
                        style={{ left: `${position(price.p50)}%` }}
                        title={`${t("anomalyRiskResults.price.marketMedian")}: ${number(price.p50)} €`}
                        aria-hidden="true"
                      />
                    )}

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

                  {/* Bottom floating label for Real Asking Price */}
                  <div className="risk-chart-bottom-track">
                    <div
                      className={`risk-chart-marker-pill risk-marker-pill-real risk-marker-pill-${priceTone}`}
                      style={{ left: `${clampPercent(actualPos, 14, 86)}%` }}
                    >
                      <span>{t("anomalyRiskResults.price.realPrice")}</span>
                      <strong>{number(price.actual_price)} €</strong>
                    </div>
                  </div>

                  {/* Clean Legend & P10 / P50 / P90 Reference Row (zero overlapping labels) */}
                  <div className="risk-chart-footer-legend">
                    <div className="risk-legend-item">
                      <span>{t("anomalyRiskResults.price.percentile10")}</span>
                      <strong>{number(price.p10)} €</strong>
                    </div>
                    <div className="risk-legend-item">
                      <span>{t("anomalyRiskResults.price.marketMedian")}</span>
                      <strong>{number(price.p50)} €</strong>
                    </div>
                    <div className="risk-legend-item">
                      <span>{t("anomalyRiskResults.price.percentile90")}</span>
                      <strong>{number(price.p90)} €</strong>
                    </div>
                  </div>
                </div>

                <p className="risk-description">
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
              <p className="risk-description">
                {t("anomalyRiskResults.price.insufficient", {
                  group: vehicle.generation
                    ? t("anomalyRiskResults.price.sameGeneration")
                    : t("anomalyRiskResults.price.sameModel"),
                })}
              </p>
            )}

            <ComponentScore
              value={price.score}
              weight={weights.price}
              riskPoints={priceRiskPts}
              flag={price.flag}
              contextual={contextual}
              t={t}
            />
          </article>

          {/* STEP 3: SPECIFICATIONS SUPPORTING CHECK */}
          <article className="risk-detail-card risk-spec-card">
            <div className="risk-card-heading">
              <div>
                <span className="risk-step-badge risk-step-badge-3">
                  {t("anomalyRiskResults.steps.specStep")}
                </span>

                <h3>{t("anomalyRiskResults.specification.title")}</h3>
              </div>
            </div>

            <p className="risk-description">
              {specs.supported_fields}{" "}
              {specs.supported_fields === 1
                ? t("anomalyRiskResults.specification.fieldEvaluated")
                : t("anomalyRiskResults.specification.fieldsEvaluated")}{" "}
              {t("assessment.configBasis")}
            </p>

            <ul className="risk-spec-list risk-spec-grid">
              {specs.signals.map((signal) => (
                <li key={signal.field}>
                  <div>
                    <strong>{getFieldLabel(t, signal.field)}</strong>

                    <span>
                      {signal.value == null
                        ? t("anomalyRiskResults.specification.unspecified")
                        : translateVehicleValue(t, signal.field, signal.value)}
                    </span>
                  </div>

                  <span
                    className={`risk-spec-label ${
                      signal.score != null && signal.score > 0 ? "risk-spec-unusual" : ""
                    }`}
                  >
                    {signal.value == null
                      ? t("anomalyRiskResults.specification.unspecified")
                      : signal.score == null
                        ? t("anomalyRiskResults.specification.insufficientData")
                        : t(`anomalyRiskResults.severityLabels.${signal.severity}`) ||
                          t("anomalyRiskResults.specification.toCheck")}
                  </span>
                </li>
              ))}
            </ul>

            <ComponentScore
              value={specs.score}
              weight={weights.specification}
              riskPoints={specRiskPts}
              t={t}
            />
          </article>
        </div>
      </div>

      <details className="risk-explanation">
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

          {priceAvailable && (
            <p className="risk-explanation-interval">
              {t("anomalyRiskResults.explanation.centralRange")}:{" "}
              <strong>
                {number(price.p25)} € – {number(price.p75)} €
              </strong>
              .
            </p>
          )}
        </div>
      </details>
    </div>
  );
}
