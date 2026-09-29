import { FIELD_LABELS, hasOverallScore, riskExplanationLines, usesCurrentRiskPolicy } from "../utils/anomalyRisk";

const number = (value, digits = 0) => value == null ? "Indisponibil" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: digits }).format(value);
const money = (value) => value == null ? "Indisponibil" : `${number(value)} €`;
const levels = { low: "Scăzut", medium: "Moderat", high: "Ridicat" };
const confidenceLevels = { low: "Scăzută", medium: "Medie", high: "Ridicată" };
const supportLabels = { normal: "Suport normal", limited: "Suport limitat", rare: "Grup rar", very_rare: "Foarte puține date" };
const priceLabels = { normal: "În intervalul observat", unusually_cheap: "Sub intervalul observat", unusually_expensive: "Peste intervalul observat", unknown: "Date insuficiente" };
const mileageLabels = { normal: "În intervalul observat", unusually_low: "Neobișnuit de mic", unusually_high: "Neobișnuit de mare", unknown: "Date insuficiente" };
const comparisonLabels = { exact_year: "același an", nearby_years: "ani apropiați", model_generation: "același model și generație, ani diferiți", model: "același model, generații și ani diferiți", unsupported: "fără grup de comparație" };
const severityLabels = { normal: "Obișnuit", uncommon: "Rar întâlnit", very_rare: "Foarte rar", unsupported: "Date insuficiente", unobserved: "Neobservat", outside_observed_range: "În afara intervalului" };

function ComponentScore({ value, weight }) {
  return <div className="risk-component-score"><span>Scor anomalie</span><strong>{value == null ? "Indisponibil" : `${number(value, 1)} / 100`}</strong>{weight != null && <small>Pondere în scor: {number(weight * 100, 1)}%</small>}</div>;
}

export default function AnomalyRiskResults({ result, vehicle }) {
  const { price_anomaly: price, mileage_anomaly: mileage, specification_anomaly: specs } = result.components;
  if (!usesCurrentRiskPolicy(result)) {
    return <section className="risk-results">
      <div className="risk-results-heading"><h2>{vehicle.brand} {vehicle.model}</h2></div>
      <article className="risk-detail-card">
        <h3>Analiză istorică</h3>
        <p>Acest rezultat a fost calculat cu o strategie anterioară. Valorile sunt păstrate așa cum au fost salvate; explicațiile regulilor actuale nu i se aplică. Folosește Reanalizează pentru o evaluare actuală.</p>
        <dl className="risk-data-list">
          <div><dt>Scor general salvat</dt><dd>{number(result.anomaly_score, 1)}</dd></div>
          <div><dt>Scor preț salvat</dt><dd>{number(price.score, 1)}</dd></div>
          <div><dt>Scor kilometraj salvat</dt><dd>{number(mileage.score, 1)}</dd></div>
          <div><dt>Scor configurație salvat</dt><dd>{number(specs.score, 1)}</dd></div>
          <div><dt>Interval salvat P10–P90</dt><dd>{money(price.p10)} – {money(price.p90)}</dd></div>
        </dl>
        <p>Reguli la salvare: {result.scoring_policy_version}</p>
      </article>
    </section>;
  }
  const scored = hasOverallScore(result);
  const rare = result.assessment_status === "very_rare";
  const lowConfidence = result.market_confidence === "low";
  const priceAvailable = price.score != null;
  const rangeStart = Math.min(price.p10, price.actual_price);
  const rangeEnd = Math.max(price.p90, price.actual_price);
  const position = (value) => rangeEnd === rangeStart ? 50 : (value - rangeStart) / (rangeEnd - rangeStart) * 100;
  const weights = result.effective_weights;

  return (
    <div className="risk-results">
      <div className="risk-results-heading"><h2>{vehicle.brand} {vehicle.model}</h2><p>{[vehicle.generation, vehicle.year, `Preț cerut: ${money(price.actual_price)}`].filter(Boolean).join(" · ")}</p></div>
      <div className="risk-summary">
        <article className={`risk-overall ${scored ? `risk-level-${result.risk_level}` : "risk-unavailable"}`}>
          <span>{scored ? "Scor general de anomalie" : "Evaluare generală"}</span>
          {scored ? <><div className="risk-score-number">{number(result.anomaly_score, 1)}<small>/ 100</small></div><strong>Nivel de anomalie: {levels[result.risk_level]}</strong><p>Un scor mai mare indică o ofertă mai neobișnuită.</p></> : <><h3>Date insuficiente</h3><p>Nu putem produce un scor general fiabil pentru grupul selectat.</p></>}
        </article>
        <article className="risk-summary-card"><span>Încredere în analiză</span><h3>{confidenceLevels[result.market_confidence]}</h3><p>{number(result.confidence_score, 1)} / 100</p><small>Depinde de datele din grupul selectat, variația prețurilor și câmpurile disponibile.</small></article>
        <article className="risk-summary-card"><span>{supportLabels[result.market_support.support_level]}</span><h3>{number(result.market_support.model_generation_observations)} <small>exemple</small></h3><p>{vehicle.generation ? "Același model și aceeași generație" : "Același model, toate generațiile"} în baza de date la momentul analizei.</p><small>{scored ? `Ajustare pentru raritate: +${number(result.market_support.rarity_penalty, 1)} puncte.` : "Scor general indisponibil."}</small></article>
      </div>

      {(rare || lowConfidence || result.assessment_status === "limited_support") && <div className="risk-caution" role="note"><strong>{rare ? "Prea puține exemple pentru o concluzie." : "Interpretează rezultatul cu prudență."}</strong><p>{rare ? "Grupul selectat are prea puține anunțuri pentru un scor general." : "Datele disponibile limitează încrederea în analiză. Folosește rezultatul ca punct de pornire pentru verificări."}</p></div>}
      {!vehicle.generation && <p className="risk-description">Generația nu a fost completată. Analiza folosește toate anunțurile pentru acest model; adaugă generația pentru o comparație mai precisă.</p>}

      <article className="risk-detail-card risk-price-card">
        <div className="risk-card-heading"><div><span className="risk-eyebrow">Preț</span><h3>{priceLabels[price.direction]}</h3></div></div>
        <p className="risk-description">{number(price.count)} anunțuri cu aceeași marcă și același model{vehicle.generation ? " și aceeași generație" : ", din toate generațiile"}.{price.support_level === "limited" ? " Suport de preț limitat (10–19 anunțuri)." : ""}</p>
        {priceAvailable ? <><div className="risk-price-chart" role="group" aria-label="Prețul ofertei și intervalul observat">
          <div className="risk-price-plot">
            <div className="risk-range" style={{ left: `${position(price.p10)}%`, width: `${position(price.p90) - position(price.p10)}%` }} />
            <div className="risk-axis-label risk-label-asking" style={{ left: `${position(price.actual_price)}%` }}><span>Preț cerut</span><strong>{money(price.actual_price)}</strong></div>
            <div className="risk-axis-label risk-label-median" style={{ left: `${position(price.p50)}%` }}><span>Mediană (P50)</span><strong>{money(price.p50)}</strong></div>
            <div className="risk-axis-label risk-label-min" style={{ left: `${position(price.p10)}%` }}><strong>{money(price.p10)}</strong><span>Percentila 10 (P10)</span></div>
            <div className="risk-axis-label risk-label-max" style={{ left: `${position(price.p90)}%` }}><strong>{money(price.p90)}</strong><span>Percentila 90 (P90)</span></div>
            <div className="risk-median" style={{ left: `${position(price.p50)}%` }} aria-hidden="true" />
            <div className="risk-asking" style={{ left: `${position(price.actual_price)}%` }} aria-hidden="true" />
          </div>
        </div>
        <p className="risk-description">Prețul cerut este {number(Math.abs(price.deviation_from_p50_pct), 1)}% {price.deviation_from_p50_pct < 0 ? "sub" : price.deviation_from_p50_pct > 0 ? "peste" : "față de"} mediana observată. Intervalul P10–P90 cuprinde zona centrală a prețurilor cerute în baza de date, nu garantează prețul de vânzare.</p></> : <p className="risk-description">Sunt necesare cel puțin 10 anunțuri din {vehicle.generation ? "aceeași generație" : "același model"} pentru evaluarea prețului.</p>}
        <ComponentScore value={price.score} weight={weights.price} />
      </article>

      <div className="risk-detail-grid">
        <article className="risk-detail-card"><span className="risk-eyebrow">Kilometraj</span><h3>{mileage.actual_mileage == null ? "Nespecificat" : mileageLabels[mileage.direction]}</h3>
          <dl className="risk-data-list"><div><dt>În anunț</dt><dd>{mileage.actual_mileage == null ? "Nespecificat" : `${number(mileage.actual_mileage)} km`}</dd></div><div><dt>Mediană observată</dt><dd>{mileage.expected_median_mileage == null ? "Indisponibilă" : `${number(mileage.expected_median_mileage)} km`}</dd></div><div><dt>Exemple disponibile</dt><dd>{mileage.actual_mileage == null ? "Neevaluat" : number(mileage.sample_size)}</dd></div></dl>
          <p className="risk-description">Comparație: {comparisonLabels[mileage.comparison_level]}. Un kilometraj neobișnuit nu dovedește modificarea odometrului.</p>
          <ComponentScore value={mileage.score} weight={weights.mileage} />
        </article>
        <article className="risk-detail-card"><span className="risk-eyebrow">Configurație</span><h3>Specificațiile ofertei</h3>
          <p className="risk-description">{specs.supported_fields} {specs.supported_fields === 1 ? "câmp evaluat" : "câmpuri evaluate"} pe baza configurațiilor observate.</p>
          <ul className="risk-spec-list">{specs.signals.map((signal) => <li key={signal.field}><div><strong>{FIELD_LABELS[signal.field] ?? signal.field}</strong><span>{signal.value == null ? "Nespecificat" : String(signal.value)}</span></div><span className={`risk-spec-label ${signal.score != null && signal.score > 0 ? "risk-spec-unusual" : ""}`}>{signal.value == null ? "Nespecificat" : signal.score == null ? "Date insuficiente" : severityLabels[signal.severity] ?? "De verificat"}</span></li>)}</ul>
          <ComponentScore value={specs.score} weight={weights.specification} />
        </article>
      </div>
      <details className="risk-explanation">
        <summary>
          <span>Explicații și detalii suplimentare</span>
          <svg className="risk-explanation-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>
        </summary>
        <div className="risk-explanation-content">
          <ul role="list">{riskExplanationLines(result, vehicle).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {priceAvailable && <p className="risk-explanation-interval">Interval central P25–P75: <strong>{money(price.p25)} – {money(price.p75)}</strong>.</p>}
          <p className="risk-explanation-source">Sursa comparațiilor: {price.source === "database" ? "listings_cleaned, la momentul analizei" : result.model_version} · Reguli de evaluare: {result.scoring_policy_version}</p>
        </div>
      </details>
    </div>
  );
}
