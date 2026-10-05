import test from "node:test";
import assert from "node:assert/strict";
import { createInstance } from "i18next";
import ro from "../src/languages/locales/ro.json" with { type: "json" };
import en from "../src/languages/locales/en.json" with { type: "json" };
import ru from "../src/languages/locales/ru.json" with { type: "json" };
import { riskExplanationItems, riskErrorMessage, getFieldLabel } from "../src/utils/anomalyRisk.js";
import { priceEstimateComparisonMessage, priceEstimateErrorMessage } from "../src/utils/priceEstimate.js";
import { localizeInputValidity } from "../src/utils/assessmentErrors.js";

const resources = { ro: { translation: ro }, en: { translation: en }, ru: { translation: ru } };

function assessment() {
  return {
    scoring_policy_version: "anomaly-risk-v2.18-young-mileage",
    assessment_status: "full", anomaly_score: 65,
    market_support: { model_generation_observations: 35, rarity_penalty: 0.3 },
    confidence: { p10_p90_width: 12000, relative_interval_width: 0.3 },
    effective_weights: { price: 0.7, mileage: 0.3 },
    scoring_context: { mode: "blended", relation: "consistent_opposite", price_ratio: 0.7,
      mileage_ratio: 1.4, coherence_strength: 0.5, joint_reduction: 15, joint_penalty: 1,
      override_scores: { price: 65, mileage: 80 } },
    components: {
      price_anomaly: { source: "database", score: 60, count: 35, actual_price: 30000,
        p25: 35000, p75: 45000, direction: "unusually_cheap", flag: "extreme_price_low" },
      mileage_anomaly: { score: 50, sample_size: 35, direction: "unusually_high", comparison_level: "model_generation" },
      specification_anomaly: { signals: [{ field: "fuel_type", value: "Benzină", severity: "uncommon" }] },
    },
  };
}

for (const language of ["ro", "en", "ru"]) {
  test(`merged risk messages and warnings resolve in ${language} without changing evidence`, async () => {
    const i18n = createInstance();
    await i18n.init({ resources, lng: language, fallbackLng: false, interpolation: { escapeValue: false } });
    const t = (key, values) => {
      assert.ok(i18n.exists(key), `Missing ${language} translation: ${key}`);
      const translated = i18n.t(key, values);
      assert.ok(!/\{\{|undefined|\btrue\b|\bfalse\b/.test(translated), translated);
      return translated;
    };
    const vehicle = { brand: "Toyota", model: "Yaris", generation: "I", mileage: 210000 };
    for (const scenario of ["blended", "reduced", "balanced", "bothHigh", "bothLow", "unbalanced", "bothExtreme", "secondary", "young", "partial", "normal", "historical"]) {
      const result = assessment();
      if (["reduced", "balanced"].includes(scenario)) {
        result.scoring_context.mode = "contextual_weighted";
        result.scoring_context.joint_reduction = scenario === "reduced" ? 15 : 0;
      }
      if (["bothHigh", "bothLow", "unbalanced", "bothExtreme", "secondary"].includes(scenario)) {
        result.scoring_context.mode = "extreme";
        result.scoring_context.relation = "inconsistent";
        result.scoring_context.price_ratio = scenario === "bothHigh" ? 2 : 0.3;
        result.scoring_context.mileage_ratio = scenario === "bothLow" ? 0.1 : 2;
        if (scenario === "secondary") result.scoring_context.override_scores = { price: 85 };
      }
      if (scenario === "young") {
        result.components.mileage_anomaly.age_adjustment_factor = 0.35;
        result.components.mileage_anomaly.vehicle_age_years = 2;
        result.components.mileage_anomaly.direction = "unusually_low";
      }
      if (scenario === "partial") {
        result.assessment_status = "partial";
        result.components.mileage_anomaly.score = null;
        result.components.mileage_anomaly.expected_median_mileage = 155000;
      }
      if (scenario === "normal") {
        result.scoring_context = null;
        result.components.price_anomaly.flag = null;
        result.components.price_anomaly.direction = "normal";
        result.components.price_anomaly.actual_price = 40000;
        result.components.mileage_anomaly.direction = "normal";
      }
      if (scenario === "historical") result.scoring_policy_version = "anomaly-risk-v2.10-gradual-override";
      const original = structuredClone(result);
      const baseline = riskExplanationItems(result, vehicle);
      const translated = riskExplanationItems(result, vehicle, t);
      assert.deepEqual(translated.map(item => item.effect), baseline.map(item => item.effect));
      assert.deepEqual(result, original);
      assert.ok(translated.length <= 11);
      if (language !== "ro") assert.ok(translated.every(item => !/Kilometrajul|Prețul|Câmpuri/.test(item.text)));
    }
    assert.notEqual(getFieldLabel(t, "fuel_type"), "fuel_type");
    const warning = "Anul de fabricație trebuie să corespundă generației selectate (1999–2005) și intervalului de ani ales.";
    assert.match(priceEstimateErrorMessage({ status: 422, detail: warning }, t), /1999–2005/);
    assert.match(riskErrorMessage({ status: 422, detail: [{ loc: ["body", "price"], type: "greater_than", ctx: { gt: 0 } }] }, t), /0/);
    for (const count of [0, 1, 2, 6, 29]) {
      const message = priceEstimateComparisonMessage({ total_used: count, limited_market_data: count < 8 }, t);
      if (count >= 2) assert.ok(message.includes(String(count)));
      assert.ok(!message.includes("undefined"));
    }
    const target = { validity: { rangeOverflow: true }, max: "2027", setCustomValidity(value) { this.message = value; } };
    localizeInputValidity({ target }, t);
    assert.ok(target.message.includes("2027"));
  });
}
