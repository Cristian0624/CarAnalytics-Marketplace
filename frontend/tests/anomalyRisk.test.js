import test from "node:test";
import assert from "node:assert/strict";
import { extremeAnomalyMessage, usesCurrentRiskPolicy, buildRiskPayload, filterVehicleOptions, hasOverallScore, resolveVehicleOption, riskErrorMessage, riskExplanationLines } from "../src/utils/anomalyRisk.js";

test("extreme override policy explains the direct score in Romanian", () => {
  const result = {
    scoring_policy_version: "anomaly-risk-v2.9-median-override",
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
  assert.ok(lines.some((line) => line.includes("cel puțin 80/100")));
  assert.ok(lines.some((line) => line.includes("nu trebuie să atingă 80")));
  assert.ok(lines.every((line) => !line.includes("include o ajustare")));
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
});

test("validation errors name the affected fields without exposing server internals", () => {
  assert.equal(riskErrorMessage({ status: 422, detail: [{ loc: ["body", "year"] }, { loc: ["body", "price"] }, { loc: ["body", "year"] }] }), "Verifică aceste câmpuri: An, Preț cerut.");
  assert.match(riskErrorMessage({ status: 503 }), /momentan indisponibilă/);
  assert.match(riskErrorMessage(new TypeError("Failed to fetch")), /contacta serverul/);
  assert.match(riskErrorMessage({ name: "TimeoutError" }), /durează prea mult/);
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
