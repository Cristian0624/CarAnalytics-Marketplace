import test from "node:test";
import assert from "node:assert/strict";
import { riskExplanationItems, usesCurrentRiskPolicy } from "../src/utils/anomalyRisk.js";

function result() {
  return {
    scoring_policy_version: "anomaly-risk-v2.18-young-mileage",
    assessment_status: "full", anomaly_score: 18,
    market_support: { model_generation_observations: 75, rarity_penalty: 0 },
    confidence: { p10_p90_width: 10000, relative_interval_width: .25 },
    scoring_context: { mode: "blended", relation: "not_applicable", override_scores: { mileage: 30 } },
    components: {
      price_anomaly: { source: "database", score: 0, count: 75, actual_price: 40000, p25: 35000, p75: 45000, direction: "normal" },
      mileage_anomaly: { score: 30, sample_size: 75, comparison_level: "model_generation", direction: "unusually_low", age_adjustment_factor: .35, vehicle_age_years: 1 },
      specification_anomaly: { signals: [] },
    },
  };
}

test("young low mileage has one age-aware explanation without an extreme alert", () => {
  const assessment = result();
  assert.equal(usesCurrentRiskPolicy(assessment), true);
  const lines = riskExplanationItems(assessment, { brand: "Lexus", model: "NX", generation: "AZ20", year: 2025, mileage: 7300 });
  assert.equal(lines.filter(line => line.text.includes("evaluat mai permisiv")).length, 1);
  assert.ok(lines.some(line => line.text.includes("aproximativ 1 an.")));
  assert.ok(lines.every(line => !line.text.includes("Alertă:")));
  assert.ok(lines.length <= 9);
});

test("high-mileage and historical assessments keep their existing explanation", () => {
  const assessment = result();
  assessment.components.mileage_anomaly.age_adjustment_factor = 1;
  assessment.components.mileage_anomaly.direction = "unusually_high";
  const vehicle = { brand: "Lexus", model: "NX", generation: "AZ20", mileage: 200000 };
  let lines = riskExplanationItems(assessment, vehicle);
  assert.ok(lines.every(line => !line.text.includes("evaluat mai permisiv")));
  assessment.scoring_policy_version = "anomaly-risk-v2.17-smooth-extremes";
  delete assessment.components.mileage_anomaly.age_adjustment_factor;
  delete assessment.components.mileage_anomaly.vehicle_age_years;
  lines = riskExplanationItems(assessment, vehicle);
  assert.equal(usesCurrentRiskPolicy(assessment), true);
  assert.ok(lines.every(line => !line.text.includes("undefined") && !line.text.includes("evaluat mai permisiv")));
});
