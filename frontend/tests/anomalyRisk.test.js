import test from "node:test";
import assert from "node:assert/strict";
import { extremeAnomalyMessage, usesCurrentRiskPolicy, buildRiskPayload, filterVehicleOptions, hasOverallScore, resolveVehicleOption, riskErrorMessage, riskExplanationLines, riskExplanationItems } from "../src/utils/anomalyRisk.js";

test("extreme override policy explains the direct score in Romanian", () => {
  const result = {
    scoring_policy_version: "anomaly-risk-v2.10-gradual-override",
    assessment_status: "full", anomaly_score: 95,
    market_support: { model_generation_observations: 25, rarity_penalty: 0 },
    confidence: { p10_p90_width: 1000, relative_interval_width: .2 },
    components: {
      price_anomaly: { source: "database", score: 95, flag: "extreme_price_high", count: 25, direction: "unusually_expensive" },
      mileage_anomaly: { score: null },
      specification_anomaly: { signals: [] },
    },
  };
  assert.equal(usesCurrentRiskPolicy(result), true);
  const lines = riskExplanationLines(result, { brand: "Toyota", model: "Auris" });
  assert.ok(lines.some((line) => line.includes("fără media ponderată")));
  assert.ok(lines.some((line) => line.includes("peste 45%")));
  assert.ok(lines.some((line) => line.includes("crește gradual de la 80")));
  assert.ok(lines.some((line) => line.includes("100% sau mai mare")));
  assert.ok(lines.every((line) => !line.includes("include o ajustare")));
});

function contextualResult() {
  return {
    scoring_policy_version: "anomaly-risk-v2.12-unified-scores", assessment_status: "full", anomaly_score: 65,
    market_support: { model_generation_observations: 30, rarity_penalty: 0 },
    confidence: { p10_p90_width: 2000, relative_interval_width: .4 },
    effective_weights: { price: .60 / .85, mileage: .25 / .85 },
    scoring_context: { mode: "contextual_weighted", relation: "consistent_opposite", price_ratio: .5,
      mileage_ratio: 2, balance_deviation: 0, joint_penalty: 3, override_scores: {} },
    components: {
      price_anomaly: { source: "database", score: 90, count: 30, direction: "unusually_cheap", actual_price: 2500, p25: 4500, p75: 5500 },
      mileage_anomaly: { score: 60, sample_size: 30, direction: "unusually_high", comparison_level: "model_generation" },
      specification_anomaly: { score: null, supported_fields: 0, signals: [] },
    },
  };
}

test("joint explanations stay concise and add only the applicable case", () => {
  const result = contextualResult();
  assert.equal(usesCurrentRiskPolicy(result), true);
  const vehicle = { brand: "Toyota", model: "Auris", generation: "II", mileage: 300000 };
  const items = riskExplanationItems(result, vehicle);
  assert.ok(items.some(item => item.text.includes("Prețul mai mic însoțește kilometrajul mai mare")));
  assert.ok(items.some(item => item.text.includes("3 puncte")));
  assert.ok(items.every(item => !/Severitate|65%|60%|curba din percentile/.test(item.text)));
  assert.deepEqual(riskExplanationLines(result, vehicle), items.map(item => item.text));
  assert.ok(items.some(item => item.effect?.metric === "Anomalie" && item.effect.direction === "up"));
  assert.ok(items.some(item => item.effect?.metric === "Încredere" && item.effect.direction === "down"));
  assert.ok(items.length <= 9);
});

test("adaptive context policy displays the existing concise joint explanation", () => {
  const result = contextualResult();
  result.scoring_policy_version = "anomaly-risk-v2.13-adaptive-context";
  result.scoring_context.price_ratio = 32000 / 41500;
  result.scoring_context.mileage_ratio = 200000 / 150000;
  assert.equal(usesCurrentRiskPolicy(result), true);
  const lines = riskExplanationLines(result, { brand: "Toyota", model: "Auris" });
  assert.ok(lines.some(line => line.includes("Prețul mai mic însoțește kilometrajul mai mare")));
});

test("cheaper higher-mileage reduction uses a downward anomaly arrow and one concise message", () => {
  const result = contextualResult();
  result.scoring_policy_version = "anomaly-risk-v2.14-mileage-price-reduction";
  result.scoring_context.joint_reduction = 15.3;
  result.scoring_context.joint_penalty = 1.3;
  assert.equal(usesCurrentRiskPolicy(result), true);
  const items = riskExplanationItems(result, { brand: "Toyota", model: "Auris" });
  const explanation = items.find(item => item.text.includes("Kilometrajul explică parțial"));
  assert.ok(explanation.text.includes("−15,3 puncte"));
  assert.ok(explanation.text.includes("+1,3 puncte"));
  assert.deepEqual(explanation.effect, { metric: "Anomalie", direction: "down" });
  assert.equal(items.filter(item => item.text.includes("Kilometrajul explică parțial")).length, 1);
});

test("extreme explanations distinguish the pair without duplicating component scores", () => {
  for (const [price_ratio, mileage_ratio, expected] of [[1.6, 1.8, "ambele ridicate"], [.4, .1, "ambele scăzute"], [10, .01, "abateri opuse"]]) {
    const result = contextualResult();
    result.scoring_context = { mode: "extreme", relation: "inconsistent", price_ratio, mileage_ratio, override_scores: { price: 85, mileage: 70 } };
    const lines = riskExplanationLines(result, { brand: "Toyota", model: "Auris", mileage: 300000 });
    assert.ok(lines.some(line => line.includes(expected)));
    assert.ok(lines.some(line => line.includes("plus 5% din celălalt")));
    assert.ok(lines.every(line => !/85\/100|70\/100|Severitate|65%/.test(line)));
    assert.ok(lines.length <= 10);
  }
});

test("a non-extreme counterpart is included in the concise joint explanation", () => {
  for (const primary of ["price", "mileage"]) {
    const result = contextualResult();
    result.scoring_policy_version = "anomaly-risk-v2.16-joint-contributions";
    result.effective_weights = { price: primary === "price" ? 1 : .05, mileage: primary === "mileage" ? 1 : .05 };
    result.scoring_context = { mode: "extreme", relation: "inconsistent", price_ratio: 1.4,
      mileage_ratio: 1.8, override_scores: { [primary]: 85 } };
    assert.equal(usesCurrentRiskPolicy(result), true);
    const lines = riskExplanationLines(result, { brand: "Toyota", model: "Auris", mileage: 300000 });
    assert.ok(lines.some(line => line.includes("contează integral") && line.includes("adaugă 5% din scorul său")));
    assert.ok(!lines.some(line => line.includes("Ambele semnale extreme")));
    assert.ok(lines.length <= 10);

    // Previously saved assessments retain their original explanation.
    result.scoring_policy_version = "anomaly-risk-v2.15-risk-bands";
    const historical = riskExplanationLines(result, { brand: "Toyota", model: "Auris" });
    assert.ok(historical.some(line => line.includes("determină scorul general, fără ponderare")));
    assert.ok(!historical.some(line => line.includes("adaugă 5% din scorul său")));
  }
});

test("request preserves exact database names, sends numbers, and excludes search-only fields", () => {
  const result = buildRiskPayload({ brand: " BMW ", model: "3 Series", generation: "F30 (2011 - 2019)", price: "12000.50", year: "2016", mileage: "150000", engine: "2.0", fuel_type: "Benzină", year_min: "2010" });
  assert.equal(result.brand, "BMW");
  assert.equal(result.model, "3 Series");
  assert.equal(result.generation, "F30 (2011 - 2019)");
  assert.equal(result.price, 12000.5);
  assert.equal(result.year, 2016);
  assert.equal(result.mileage, 150000);
  assert.equal(result.engine, 2);
  assert.equal(result.fuel_type, "Benzină");
  assert.equal(result.gearbox, null);
  assert.equal(Object.keys(result).length, 11);
  assert.ok(!("year_min" in result));
});

test("omitted details stay null while zero-mileage EV input stays zero", () => {
  const result = buildRiskPayload({ brand: "Tesla", model: "Model 3", price: "20000", engine: "0", mileage: "0", fuel_type: "Electricitate", generation: "  " });
  assert.equal(result.engine, 0);
  assert.equal(result.mileage, 0);
  assert.equal(result.generation, null);
  assert.equal(result.year, null);
});

test("very rare and missing overall scores are never displayed as zero risk", () => {
  assert.equal(hasOverallScore({ assessment_status: "very_rare", anomaly_score: null }), false);
  assert.equal(hasOverallScore({ assessment_status: "very_rare", anomaly_score: 99 }), false);
  assert.equal(hasOverallScore({ assessment_status: "limited_support", anomaly_score: null }), false);
  assert.equal(hasOverallScore({ assessment_status: "limited_support", anomaly_score: 25 }), true);
  assert.equal(hasOverallScore({ assessment_status: "full", anomaly_score: 0 }), true);
  assert.equal(hasOverallScore({ assessment_status: "partial", anomaly_score: null }), false);
  assert.equal(hasOverallScore({ assessment_status: "partial", anomaly_score: 3.5 }), false);
});

test("smooth escalation explains actual contributions without mislabelling a large deviation as favourable", () => {
  const result = contextualResult();
  result.scoring_policy_version = "anomaly-risk-v2.17-smooth-extremes";
  result.scoring_context = { mode: "blended", relation: "not_applicable", override_scores: { mileage: 95 } };
  Object.assign(result.components.mileage_anomaly, { direction: "normal", score: 95, flag: null, sample_size: 24 });
  assert.equal(usesCurrentRiskPolicy(result), true);
  const items = riskExplanationItems(result, { brand: "Toyota", model: "Auris", mileage: 10 });
  assert.ok(items.some(item => item.text.includes("crește progresiv în funcție") && item.effect.direction === "up"));
  const mileage = items.find(item => item.text.startsWith("Kilometrajul are o abatere mare"));
  assert.equal(mileage.effect.direction, "up");
  assert.ok(!items.some(item => item.text.startsWith("Kilometrajul se află")));
});

test("validation errors name the affected fields without exposing server internals", () => {
  assert.equal(riskErrorMessage({ status: 422, detail: [{ loc: ["body", "year"] }, { loc: ["body", "price"] }, { loc: ["body", "year"] }] }), "Verifică aceste câmpuri: An, Preț cerut.");
  assert.match(riskErrorMessage({ status: 503 }), /momentan indisponibilă/);
  assert.match(riskErrorMessage(new TypeError("Failed to fetch")), /contacta serverul/);
  assert.match(riskErrorMessage({ name: "TimeoutError" }), /durează prea mult/);
});

test("partial price-mileage compensation explains remaining escalation without claiming normal weights", () => {
  const result = contextualResult();
  result.scoring_policy_version = "anomaly-risk-v2.17-smooth-extremes";
  result.scoring_context = { mode: "blended", relation: "consistent_opposite", coherence_strength: .5,
    price_ratio: 1.65, mileage_ratio: .76, joint_penalty: .4, joint_reduction: 0,
    override_scores: { price: 88 } };
  const items = riskExplanationItems(result, { brand: "Toyota", model: "Auris", mileage: 100000 });
  const pairing = items.find(item => item.text.includes("Compensarea este doar parțială"));
  assert.ok(pairing);
  assert.equal(pairing.effect.direction, "down");
  assert.ok(items.some(item => item.text.includes("crește progresiv") && item.effect.direction === "up"));
  assert.ok(!items.some(item => item.text.includes("ponderi normale")));
  assert.ok(items.length <= 10);
});

test("full vehicle option lists can be searched with case and accent differences", () => {
  const all = ["Șkoda", "Volkswagen", "Toyota"];
  assert.deepEqual(filterVehicleOptions(all, ""), all);
  assert.deepEqual(filterVehicleOptions(all, "  skO "), ["Șkoda"]);
  assert.deepEqual(filterVehicleOptions(["3 Series", "5 Series", "X3"], "series"), ["3 Series", "5 Series"]);
  assert.deepEqual(filterVehicleOptions(["Toyota", "Tesla", "Volkswagen"], "Toyta"), ["Toyota"]);
});

test("typed exact names and unique prefixes resolve to database values, while ambiguous names wait", () => {
  const brands = ["Toyota", "Tesla", "Volkswagen"];
  assert.equal(resolveVehicleOption(brands, " toyota "), "Toyota");
  assert.equal(resolveVehicleOption(brands, "Toyo"), "Toyota");
  assert.equal(resolveVehicleOption(brands, "T"), null);
  assert.equal(resolveVehicleOption(brands, "T-e"), null);
  assert.equal(resolveVehicleOption(["Auris", "Avensis"], "A"), null);
  assert.equal(resolveVehicleOption(["Auris", "Avensis"], "Au"), "Auris");
});

test("expanded explanations use structured evidence and Romanian text", () => {
  const result = {
    assessment_status: "very_rare",
    confidence: { model_observations: 3, p10_p90_width: 6000, relative_interval_width: 0.5 },
    market_support: { model_generation_observations: 1, rarity_penalty: 0 },
    components: {
      price_anomaly: { direction: "unusually_expensive" },
      mileage_anomaly: { score: null },
      specification_anomaly: { signals: [{ field: "year", value: 2010, severity: "outside_observed_range" }] },
    },
  };
  const lines = riskExplanationLines(result, { brand: "Toyota", model: "Auris", generation: "II", price: 9000, year: 2010, mileage: null });
  assert.ok(lines.some((line) => line.includes("prea puține anunțuri")));
  assert.ok(lines.some((line) => line.includes("An (2010)")));
  assert.ok(lines.some((line) => line.includes("Kilometrajul nu a fost introdus")));
  assert.ok(lines.every((line) => !/Asking price|Mileage is|model observations|Predicted P10/.test(line)));
});

test("unavailable database price has no fabricated interval explanation", () => {
  const result = {
    assessment_status: "limited_support",
    confidence: { model_observations: 200, p10_p90_width: null, relative_interval_width: null },
    market_support: { model_generation_observations: 100, rarity_penalty: 0 },
    components: {
      price_anomaly: { score: null, count: 9, direction: "unknown" },
      mileage_anomaly: { score: null },
      specification_anomaly: { signals: [] },
    },
  };
  const lines = riskExplanationLines(result, { ...buildRiskPayload({}), price: 5000 });
  assert.ok(lines.some((line) => line.includes("9 anunțuri comparabile") && line.includes("minimum 10")));
  assert.ok(lines.every((line) => typeof line === "string" && !/NaN|0 €|intervalul estimat/i.test(line)));
});

test("available database price explains the exact unfiltered comparison group", () => {
  const result = {
    assessment_status: "full",
    confidence: { model_observations: 200, p10_p90_width: 1600, relative_interval_width: .32 },
    market_support: { model_generation_observations: 100, rarity_penalty: 0 },
    components: {
      price_anomaly: { score: 0, count: 21, direction: "normal", actual_price: 5000, p25: 4500, p75: 5500 },
      mileage_anomaly: { score: null },
      specification_anomaly: { signals: [] },
    },
  };
  const lines = riskExplanationLines(result, { price: 5000 });
  assert.ok(lines.some((line) => line.includes("21 anunțuri") && line.includes("nu filtrează acest grup")));
  assert.ok(lines.some((line) => line.includes("zona centrală observată")));
  assert.ok(lines.every((line) => !line.includes("Prețul nu a fost evaluat")));
});

test("ordinary price and mileage findings are favourable even with small nonzero scores", () => {
  const result = contextualResult();
  result.scoring_context = null;
  const price = result.components.price_anomaly;
  const mileage = result.components.mileage_anomaly;
  Object.assign(price, { direction: "normal", actual_price: 5100, score: 4 });
  Object.assign(mileage, { direction: "normal", score: 10 });
  const vehicle = { brand: "Toyota", model: "Auris", mileage: 160000 };
  let items = riskExplanationItems(result, vehicle);
  assert.deepEqual(items.find(item => item.text.includes("zona centrală observată")).effect,
    { metric: "Anomalie", direction: "down" });
  assert.deepEqual(items.find(item => item.text.startsWith("Kilometrajul se află")).effect,
    { metric: "Anomalie", direction: "down" });

  price.actual_price = 5800;
  mileage.direction = "unusually_high";
  items = riskExplanationItems(result, vehicle);
  assert.equal(items.find(item => item.text.includes("în afara zonei centrale")).effect.direction, "up");
  assert.equal(items.find(item => item.text.startsWith("Kilometrajul este neobișnuit")).effect.direction, "up");

  // Broad observed intervals cannot turn an actual extreme alert green.
  Object.assign(price, { actual_price: 5100, flag: "extreme_price_high", score: 85 });
  Object.assign(mileage, { direction: "normal", flag: "extreme_mileage_high", score: 70 });
  items = riskExplanationItems(result, vehicle);
  assert.equal(items.find(item => item.text.startsWith("Alertă: preț")).effect.direction, "up");
  assert.equal(items.find(item => item.text.startsWith("Alertă: kilometraj")).effect.direction, "up");
  assert.ok(!items.some(item => item.text.includes("zona centrală observată") || item.text.startsWith("Kilometrajul se află")));
});

test("explanations show selected group instead of totals across other generations", () => {
  const result = {
    assessment_status: "full",
    confidence: { model_observations: 471, p10_p90_width: 1625, relative_interval_width: .551 },
    market_support: { model_generation_observations: 116, rarity_penalty: 0 },
    components: {
      price_anomaly: { score: 0, count: 116, direction: "normal", actual_price: 2950, p25: 2500, p75: 3325 },
      mileage_anomaly: { score: 10, sample_size: 110, direction: "normal", comparison_level: "model_generation" },
      specification_anomaly: { signals: [] },
    },
  };
  const vehicle = { brand: "Toyota", model: "Yaris", generation: "I", mileage: 200000 };
  const lines = riskExplanationLines(result, vehicle);
  assert.match(lines[0], /Grupul analizat: 116/);
  assert.match(lines[0], /Nu sunt incluse alte generații/);
  assert.ok(lines.every((line) => !line.includes("471")));
  assert.ok(lines.some((line) => line.includes("110 anunțuri cu kilometraj disponibil")));
  assert.ok(lines.some((line) => line.includes("minimum 25")));

  const withoutGeneration = riskExplanationLines(result, { ...vehicle, generation: null });
  assert.match(withoutGeneration[0], /din toate generațiile/);
  result.components.mileage_anomaly = { score: null, sample_size: 17, expected_median_mileage: 180000 };
  const medianOnly = riskExplanationLines(result, vehicle).join(" ");
  assert.match(medianOnly, /minimum 10, iar scorul minimum 20/);
  assert.match(medianOnly, /Mediana este disponibilă, dar scorul nu/);
});


test("historical results cannot receive current database explanations", () => {
  const result = { scoring_policy_version: "anomaly-risk-v2.6-selected-group",
    components: { price_anomaly: { source: "database" } } };
  assert.equal(usesCurrentRiskPolicy(result), true);
  assert.equal(usesCurrentRiskPolicy({ ...result, scoring_policy_version: "anomaly-risk-v2.7-extreme-signals" }), true);
  assert.equal(usesCurrentRiskPolicy({ ...result, scoring_policy_version: "anomaly-risk-v2.3" }), false);
  assert.equal(usesCurrentRiskPolicy({ ...result, scoring_policy_version: "anomaly-risk-v2.5-db-comparisons" }), false);
  assert.equal(usesCurrentRiskPolicy({ ...result, components: { price_anomaly: {} } }), false);
});

test("extreme flags identify the component and direction without inventing alerts for saved results", () => {
  assert.match(extremeAnomalyMessage("extreme_price_low"), /preț mult sub mediana/);
  assert.match(extremeAnomalyMessage("extreme_price_high"), /preț mult peste mediana/);
  assert.match(extremeAnomalyMessage("extreme_mileage_low"), /kilometraj mult sub mediana/);
  assert.match(extremeAnomalyMessage("extreme_mileage_high"), /kilometraj mult peste mediana/);
  assert.equal(extremeAnomalyMessage(undefined), null);
  assert.equal(extremeAnomalyMessage(null), null);
  assert.equal(extremeAnomalyMessage("unknown"), null);
});
