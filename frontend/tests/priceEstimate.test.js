import test from "node:test";
import assert from "node:assert/strict";
import { priceEstimateMileageBounds, priceEstimateYearBounds } from "../src/utils/priceEstimate.js";

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
