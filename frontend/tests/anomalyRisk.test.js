import test from "node:test";
import assert from "node:assert/strict";
import { buildRiskPayload, filterVehicleOptions, hasOverallScore, resolveVehicleOption, riskErrorMessage, riskExplanationLines } from "../src/utils/anomalyRisk.js";

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
  assert.ok(lines.some((line) => line.includes("prea puține exemple")));
  assert.ok(lines.some((line) => line.includes("An (2010)")));
  assert.ok(lines.some((line) => line.includes("Kilometrajul nu a fost introdus")));
  assert.ok(lines.every((line) => !/Asking price|Mileage is|model observations|Predicted P10/.test(line)));
});
