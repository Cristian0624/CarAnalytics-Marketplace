import { useTranslation } from "react-i18next";

import {
  getFieldLabel,
  extremeAnomalyMessage,
  hasOverallScore,
  riskExplanationLines,
  usesCurrentRiskPolicy,
} from "../utils/anomalyRisk";

const number = (value, digits = 0) =>
  value == null
    ? null
    : new Intl.NumberFormat(undefined, {
        maximumFractionDigits: digits,
      }).format(value);

function ComponentScore({ value, weight, flag, t }) {
  const message = extremeAnomalyMessage(flag, t);

  return (
    <>
      {message && (
        <p className="risk-description" role="note">
          <strong>{message}</strong>
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

export default function AnomalyRiskResults({ result, vehicle }) {
  const { t } = useTranslation();

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
                  : `${price.p10} – ${price.p90}`}
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
  const lowConfidence = result.market_confidence === "low";
  const priceAvailable = price.score != null;

  const rangeStart = Math.min(price.p10, price.actual_price);
  const rangeEnd = Math.max(price.p90, price.actual_price);

  const position = (value) =>
    rangeEnd === rangeStart
      ? 50
      : ((value - rangeStart) / (rangeEnd - rangeStart)) * 100;

  const weights = result.effective_weights;

  const priceDirection =
    price.deviation_from_p50_pct < 0
      ? t("anomalyRiskResults.price.below")
      : price.deviation_from_p50_pct > 0
        ? t("anomalyRiskResults.price.above")
        : t("anomalyRiskResults.price.equal");

  const priceDescription = t("anomalyRiskResults.price.description", {
    count: number(price.count),
    generation: vehicle.generation
      ? t("anomalyRiskResults.price.generation")
      : "",
    allGenerations: vehicle.generation
      ? ""
      : t("anomalyRiskResults.price.allGenerations"),
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
                    {t("anomalyRiskResults.overview.insufficientData")}
                  </h3>

                  <p>
                    {t("anomalyRiskResults.overview.insufficientScore")}
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

          {(rare ||
            lowConfidence ||
            result.assessment_status === "limited_support") && (
            <div className="risk-caution" role="note">
              <strong>
                {rare
                  ? t("anomalyRiskResults.caution.fewExamplesTitle")
                  : t("anomalyRiskResults.caution.cautionTitle")}
              </strong>

              <p>
                {rare
                  ? t(
                      "anomalyRiskResults.caution.fewExamplesDescription",
                    )
                  : t(
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
              <div
                className="risk-price-chart"
                role="group"
                aria-label={t(
                  "anomalyRiskResults.price.chartAriaLabel",
                )}
              >
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
              {t("anomalyRiskResults.overview.databaseAtAnalysis")}
            </p>

            <ul className="risk-spec-list">
              {specs.signals.map((signal) => (
                <li key={signal.field}>
                  <div>
                    <strong>
                      {getFieldLabel[t, signal.field] ?? signal.field}
                    </strong>

                    <span>
                      {signal.value == null
                        ? t(
                            "anomalyRiskResults.specification.unspecified",
                          )
                        : String(signal.value)}
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
            {riskExplanationLines(result, vehicle, t).map((reason) => (
              <li key={reason}>{reason}</li>
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