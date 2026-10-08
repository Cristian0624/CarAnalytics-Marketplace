import test from "node:test";
import assert from "node:assert/strict";
import { priceEstimateComparisonMessage, priceEstimateMileageBounds, priceEstimateYearBounds } from "../src/utils/priceEstimate.js";

test("current and next-year cars keep year bounds inside the API limit", () => {
  for (const currentYear of [2026, 2027]) {
    for (const year of [currentYear - 1, currentYear, currentYear + 1]) {
      const bounds = priceEstimateYearBounds(year, currentYear);
      assert.ok(bounds.year_min <= year && year <= bounds.year_max);
      assert.ok(bounds.year_max <= currentYear + 1);
    }
  }
  assert.deepEqual(priceEstimateYearBounds(2002, 2026), { year_min: 2000, year_max: 2004 });
});

test("automatic estimate bounds allow the complete Yaris generation mileage spread", () => {
  const bounds = priceEstimateMileageBounds();
  for (const mileage of [2600, 110000, 201000, 220000, 270000, 330000, 450000]) {
    assert.ok(mileage >= bounds.mileage_min && mileage <= bounds.mileage_max);
  }
});

test("generation comparison bounds accept low and maximum API mileage inputs", () => {
  const bounds = priceEstimateMileageBounds();
  assert.equal(bounds.mileage_min, 0);
  assert.equal(bounds.mileage_max, 10000000);
});


test("fewer than seven comparisons show an insufficient-data message in all languages", async () => {
  const { createInstance } = await import("i18next");
  const { readFile } = await import("node:fs/promises");
  for (const language of ["ro", "en", "ru"]) {
    const translations = JSON.parse(await readFile(new URL(`../src/languages/locales/${language}.json`, import.meta.url), "utf8"));
    const i18n = createInstance();
    await i18n.init({ lng: language, resources: { [language]: { translation: translations } }, fallbackLng: false });
    for (let count = 0; count < 7; count++) {
      const message = priceEstimateComparisonMessage({ total_used: count, limited_market_data: true }, i18n.t.bind(i18n));
      assert.ok(message.includes("7"), message);
      assert.ok(!message.includes("{{") && !message.includes("undefined"), message);
      if (count > 1) assert.ok(message.includes(String(count)), message);
    }
    const message = priceEstimateComparisonMessage({ total_used: 7, limited_market_data: true }, i18n.t.bind(i18n));
    assert.ok(message.startsWith(i18n.t("assessment.estimateGroup", { count: 7 })));
  }
});
