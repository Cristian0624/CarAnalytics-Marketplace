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

function getDistributionData(price, distMin, distMax, width = 1000, baselineY = 125, peakY = 18) {
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
  const yAsking = price.actual_price != null ? getYAtPrice(price.actual_price) : baselineY;

  return {
    coords,
    linePath,
    areaPath,
    centralAreaPath,
    baselineY,
    yMedian: Number(yMedian.toFixed(1)),
    yAsking: Number(yAsking.toFixed(1)),
  };
}

function ComponentScore({ value, weight, flag, t, contextual = false }) {
  const number = (value, digits = 0) => assessmentNumber(t, value, digits);
  const message = extremeAnomalyMessage(flag, t);

  return (
    <>
      {message && (
        <p className="risk-description" role="note">
          <strong>{message}</strong>
           {contextual && t("assessment.contextual")}
        </p>
      )}

      <div className="risk-component-score">
        <span>{t("anomalyRiskResults.componentScore.score")}</span>

        <strong>
          {value == null
            ? t("anomalyRiskResults.componentScore.unavailable")
            : `${number(value, 1)} / 100`}
        </strong>

        {weight != null && (
          <small>
            {t("anomalyRiskResults.componentScore.weight")}:{" "}
            {number(weight * 100, 1)}%
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
  return <span className={`risk-effect risk-effect-${tone}`}>
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={visualDirection === "up" ? "M12 19V5m-6 6 6-6 6 6" : visualDirection === "down" ? "M12 5v14m-6-6 6 6 6-6" : "M5 12h14"} />
    </svg>
    <span>{metricLabel}<span className="risk-sr-only">: {label}</span></span>
  </span>;
}

export default function AnomalyRiskResults({ result, vehicle }) {
  const { t } = useTranslation();
  const number = (value, digits = 0) => value == null ? t("anomalyRiskResults.unavailable") : assessmentNumber(t, value, digits);

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
              <dt>
                {t("anomalyRiskResults.historical.specificationScore")}
              </dt>
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
            {t("anomalyRiskResults.historical.policy")}:{" "}
            {result.scoring_policy_version}
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

  const distMin = price.distribution?.min_price ?? Math.min(price.p10, price.actual_price);
  const distMax = price.distribution?.max_price ?? Math.max(price.p90, price.actual_price);

  const position = (value) =>
    distMax === distMin || value == null
      ? 50
      : Math.max(0, Math.min(100, ((value - distMin) / (distMax - distMin)) * 100));

  const distData = useMemo(
    () => getDistributionData(price, distMin, distMax),
    [price, distMin, distMax],
  );

  const weights = result.effective_weights;
  const contextual = result.scoring_context?.mode === "contextual_weighted"
    || (result.scoring_context?.mode === "blended" && result.scoring_context?.coherence_strength > 0);
  const packedRange = position(price.p90) - position(price.p10) < 45;

  const priceDirection =
    price.deviation_from_p50_pct < 0
      ? t("anomalyRiskResults.price.below")
      : price.deviation_from_p50_pct > 0
        ? t("anomalyRiskResults.price.above")
        : t("anomalyRiskResults.price.equal");

  const priceDescription = t("assessment.priceDescription", {
    count: number(price.count),
    group: t(vehicle.generation ? "assessment.sameGeneration" : "assessment.allGenerations"),
  });

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
        <div className="risk-overview">
          <div className="risk-summary">
            <article
              className={`risk-overall ${
                scored
                  ? `risk-level-${result.risk_level}`
                  : "risk-unavailable"
              }`}
            >
              <span>
                {scored
                  ? t("anomalyRiskResults.overview.overallScore")
                  : partial ? t("assessment.partialTitle") : t("anomalyRiskResults.overview.overallEvaluation")}
              </span>

              {scored ? (
                <>
                  <div className="risk-score-number">
                    {number(result.anomaly_score, 1)}
                    <small>/ 100</small>
                  </div>

                  <strong>
                    {t("anomalyRiskResults.overview.anomalyLevel")}:{" "}
                    {t(
                      `anomalyRiskResults.levels.${result.risk_level}`,
                    )}
                  </strong>

                  <p>
                    {t("anomalyRiskResults.overview.higherScore")}
                  </p>
                </>
              ) : (
                <>
                  <h3>
                    {partial ? t("assessment.partialScore") : t("anomalyRiskResults.overview.insufficientData")}
                  </h3>

                  <p>
                    {partial ? t("assessment.partialDescription") : t("anomalyRiskResults.overview.insufficientScore")}
                  </p>
                </>
              )}
            </article>

            <article className="risk-summary-card">
              <span>
                {t("anomalyRiskResults.overview.analysisConfidence")}
              </span>

              <h3>
                {t(
                  `anomalyRiskResults.confidenceLevels.${result.market_confidence}`,
                )}
              </h3>

              <p>{number(result.confidence_score, 1)} / 100</p>

              <small>
                {t("anomalyRiskResults.overview.confidenceDescription")}
              </small>
            </article>

            <article className="risk-summary-card">
              <span>
                {t(
                  `anomalyRiskResults.supportLabels.${result.market_support.support_level}`,
                )}
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
                      points: number(
                        result.market_support.rarity_penalty,
                        1,
                      ),
                    })
                  : t(
                      "anomalyRiskResults.overview.overallScoreUnavailable",
                    )}
              </small>
            </article>
          </div>

          {(rare || partial ||
            lowConfidence ||
            result.assessment_status === "limited_support") && (
            <div className="risk-caution" role="note">
              <strong>
                {rare
                  ? t("anomalyRiskResults.caution.fewExamplesTitle")
                  : partial ? t("assessment.partialCaution") : t("anomalyRiskResults.caution.cautionTitle")}
              </strong>

              <p>
                {rare
                  ? t(
                      "anomalyRiskResults.caution.fewExamplesDescription",
                    )
                  : partial ? t("assessment.partialCautionDescription") : t(
                      "anomalyRiskResults.caution.cautionDescription",
                    )}
              </p>
            </div>
          )}
        </div>

        <article className="risk-detail-card risk-price-card">
          <div className="risk-card-heading">
            <div>
              <span className="risk-eyebrow">
                {t("anomalyRiskResults.price.label")}
              </span>

              <h3>
                {t(
                  `anomalyRiskResults.priceLabels.${price.direction}`,
                )}
              </h3>
            </div>
          </div>

          <p className="risk-description">
            {priceDescription}
            {price.support_level === "limited" &&
              t("anomalyRiskResults.price.limitedSupport")}
          </p>

          {priceAvailable ? (
            <>
              {price.count >= 10 && (
                <div className="risk-distribution-badge">
                  <span className="risk-distribution-badge-dot" aria-hidden="true" />
                  <span>
                    {t("anomalyRiskResults.price.distributionBadge", {
                      count: number(price.count),
                    })}
                  </span>
                </div>
              )}

              <div
                className={`risk-price-chart ${packedRange ? "risk-price-chart-packed" : ""}`}
                role="group"
                aria-label={t(
                  "anomalyRiskResults.price.chartAriaLabel",
                )}
              >
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
                          <stop offset="0%" stopColor="#14B8A6" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.02" />
                        </linearGradient>
                        <linearGradient id="riskDistCentralGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0F766E" stopOpacity="0.42" />
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

                      {price.p50 != null && (
                        <>
                          <line
                            x1={`${(position(price.p50) * 10).toFixed(1)}`}
                            y1={distData.yMedian}
                            x2={`${(position(price.p50) * 10).toFixed(1)}`}
                            y2={distData.baselineY}
                            stroke="#0E7C70"
                            strokeWidth="2"
                            strokeDasharray="4 3"
                          />
                          <circle
                            cx={`${(position(price.p50) * 10).toFixed(1)}`}
                            cy={distData.yMedian}
                            r="4.5"
                            fill="#0E7C70"
                            stroke="#FFFFFF"
                            strokeWidth="2"
                          />
                        </>
                      )}

                      {price.actual_price != null && (
                        <>
                          <line
                            x1={`${(position(price.actual_price) * 10).toFixed(1)}`}
                            y1={distData.yAsking}
                            x2={`${(position(price.actual_price) * 10).toFixed(1)}`}
                            y2={distData.baselineY}
                            stroke="#17202A"
                            strokeWidth="2"
                            strokeDasharray="3 3"
                          />
                          <circle
                            cx={`${(position(price.actual_price) * 10).toFixed(1)}`}
                            cy={distData.yAsking}
                            r="5"
                            fill="#17202A"
                            stroke="#FFFFFF"
                            strokeWidth="2"
                          />
                        </>
                      )}
                    </svg>
                  </div>
                )}

                <div className="risk-price-plot">
                  <div
                    className="risk-range"
                    style={{
                      left: `${position(price.p10)}%`,
                      width: `${
                        position(price.p90) -
                        position(price.p10)
                      }%`,
                    }}
                  />

                  <div
                    className="risk-axis-label risk-label-asking"
                    style={{
                      left: `${position(price.actual_price)}%`,
                    }}
                  >
                    <span>
                      {t("anomalyRiskResults.price.asking")}
                    </span>
                    <strong>
                      {number(price.actual_price)} €
                    </strong>
                  </div>

                  <div
                    className="risk-axis-label risk-label-median"
                    style={{
                      left: `${position(price.p50)}%`,
                    }}
                  >
                    <span>
                      {t("anomalyRiskResults.price.median")}
                    </span>
                    <strong>{number(price.p50)} €</strong>
                  </div>

                  <div
                    className="risk-axis-label risk-label-min"
                    style={{
                      left: `${position(price.p10)}%`,
                    }}
                  >
                    <strong>{number(price.p10)} €</strong>
                    <span>
                      {t("anomalyRiskResults.price.percentile10")}
                    </span>
                  </div>

                  <div
                    className="risk-axis-label risk-label-max"
                    style={{
                      left: `${position(price.p90)}%`,
                    }}
                  >
                    <strong>{number(price.p90)} €</strong>
                    <span>
                      {t("anomalyRiskResults.price.percentile90")}
                    </span>
                  </div>

                  <div
                    className="risk-median"
                    style={{
                      left: `${position(price.p50)}%`,
                    }}
                    aria-hidden="true"
                  />

                  <div
                    className="risk-asking"
                    style={{
                      left: `${position(price.actual_price)}%`,
                    }}
                    aria-hidden="true"
                  />
                </div>
              </div>

              <p className="risk-description">
                {t("anomalyRiskResults.price.deviation", {
                  percent: number(
                    Math.abs(price.deviation_from_p50_pct),
                    1,
                  ),
                  direction: priceDirection,
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
            flag={price.flag}
            contextual={contextual}
            t={t}
          />
        </article>

        <div className="risk-detail-grid">
          <article className="risk-detail-card">
            <span className="risk-eyebrow">
              {t("anomalyRiskResults.mileage.label")}
            </span>

            <h3>
              {mileage.actual_mileage == null
                ? t("anomalyRiskResults.mileage.unspecified")
                : t(
                    `anomalyRiskResults.mileageLabels.${mileage.direction}`,
                  )}
            </h3>

            <dl className="risk-data-list">
              <div>
                <dt>{t("anomalyRiskResults.mileage.inListing")}</dt>
                <dd>
                  {mileage.actual_mileage == null
                    ? t("anomalyRiskResults.mileage.unspecified")
                    : `${number(mileage.actual_mileage)} km`}
                </dd>
              </div>

              <div>
                <dt>
                  {t("anomalyRiskResults.mileage.observedMedian")}
                </dt>
                <dd>
                  {mileage.expected_median_mileage == null
                    ? t("anomalyRiskResults.mileage.unavailable")
                    : `${number(
                        mileage.expected_median_mileage,
                      )} km`}
                </dd>
              </div>

              <div>
                <dt>
                  {t(
                    "anomalyRiskResults.mileage.examplesAvailable",
                  )}
                </dt>
                <dd>
                  {mileage.actual_mileage == null
                    ? t("anomalyRiskResults.mileage.notEvaluated")
                    : number(mileage.sample_size)}
                </dd>
              </div>
            </dl>

            <p className="risk-description">
              {t("anomalyRiskResults.mileage.comparison")}:{" "}
              {t(
                `anomalyRiskResults.comparisonLabels.${mileage.comparison_level}`,
              )}
              . {t("anomalyRiskResults.mileage.warning")}
            </p>

            <ComponentScore
              value={mileage.score}
              weight={weights.mileage}
              flag={mileage.flag}
              contextual={contextual}
              t={t}
            />
          </article>

          <article className="risk-detail-card">
            <span className="risk-eyebrow">
              {t("anomalyRiskResults.specification.label")}
            </span>

            <h3>
              {t("anomalyRiskResults.specification.title")}
            </h3>

            <p className="risk-description">
              {specs.supported_fields}{" "}
              {specs.supported_fields === 1
                ? t(
                    "anomalyRiskResults.specification.fieldEvaluated",
                  )
                : t(
                    "anomalyRiskResults.specification.fieldsEvaluated",
                  )}{" "}
              {t("assessment.configBasis")}
            </p>

            <ul className="risk-spec-list">
              {specs.signals.map((signal) => (
                <li key={signal.field}>
                  <div>
                    <strong>
                      {getFieldLabel(t, signal.field)}
                    </strong>

                    <span>
                      {signal.value == null
                        ? t(
                            "anomalyRiskResults.specification.unspecified",
                          )
                        : translateVehicleValue(t, signal.field, signal.value)}
                    </span>
                  </div>

                  <span
                    className={`risk-spec-label ${
                      signal.score != null && signal.score > 0
                        ? "risk-spec-unusual"
                        : ""
                    }`}
                  >
                    {signal.value == null
                      ? t(
                          "anomalyRiskResults.specification.unspecified",
                        )
                      : signal.score == null
                        ? t(
                            "anomalyRiskResults.specification.insufficientData",
                          )
                        : t(
                            `anomalyRiskResults.severityLabels.${signal.severity}`,
                          ) ||
                          t(
                            "anomalyRiskResults.specification.toCheck",
                          )}
                  </span>
                </li>
              ))}
            </ul>

            <ComponentScore
              value={specs.score}
              weight={weights.specification}
              t={t}
            />
          </article>
        </div>
      </div>

      <details className="risk-explanation">
        <summary>
          <span>
            {t("anomalyRiskResults.explanation.title")}
          </span>

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
                <ContributionArrow direction={effect?.direction ?? "neutral"} metric={effect?.metric ?? "Context"} t={t} />
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
