import test from "node:test";
import assert from "node:assert/strict";
import { highlightParts } from "../src/utils/autocomplete.js";
import { emptyListingFilters, listingFilterError, listingFiltersToApi, listingFiltersToForm, updateListingFilter } from "../src/utils/listingFilters.js";
import { filterVehicleOptions } from "../src/utils/anomalyRisk.js";

test("generation punctuation is literal text, including incomplete parentheses", () => {
  const text = "I (2007 - 2013)";
  for (const query of ["I (2007 - 2013", "(", ")", "[", "\\", ".*", "+", "?"]) {
    const parts = highlightParts(text, query);
    assert.equal(parts.map((part) => part.text).join(""), text);
    assert.ok(parts.filter((part) => part.match).every((part) => part.text.toLowerCase() === query.toLowerCase()));
  }
  assert.deepEqual(filterVehicleOptions([text, "II (2013 - 2021)"], "I (2007 - 2013"), [text]);
});

test("complete option lists remain searchable past C", () => {
  const options = ["Audi", "BMW", "Citroen", "Toyota", "Volkswagen", "Volvo"];
  assert.deepEqual(filterVehicleOptions(options, ""), options);
  assert.deepEqual(filterVehicleOptions(options, "volv"), ["Volvo"]);
});

test("model requires brand and generation requires both; brand and multiple classes are valid", () => {
  assert.match(listingFilterError({ modelText: "Golf" }), /marca/);
  assert.match(listingFilterError({ brandText: "Volkswagen", generationText: "VII" }), /modelul/);
  assert.match(listingFilterError({ brandText: "Volkswagen", modelText: "Golf", class: ["E"] }), /fie modelul/);
  assert.equal(listingFilterError({ brandText: "Volkswagen", class: ["C", "E"] }), "");
  assert.equal(listingFilterError({ brandText: "Volkswagen", modelText: "Golf", generationText: "VII" }), "");
});

test("the vehicle tree can commit all three selections without losing another selected model", () => {
  const form = { ...emptyListingFilters(), brandText: "Volkswagen", modelText: "Golf", generationText: "VII" };
  // main's VehicleTree owns dependent selections and commits all three fields.
  // The generic updater must not clear selections belonging to another branch.
  let next = updateListingFilter(form, "brandText", "Volkswagen, Toyota");
  next = updateListingFilter(next, "modelText", "Golf, Yaris");
  next = updateListingFilter(next, "generationText", "VII, I (1999 - 2005)");
  assert.deepEqual(listingFiltersToApi(next), {
    brand: ["Volkswagen", "Toyota"], model: ["Golf", "Yaris"],
    generation: ["VII", "I (1999 - 2005)"],
  });
  next = updateListingFilter(next, "brandText", "Toyota");
  next = updateListingFilter(next, "modelText", "Yaris");
  next = updateListingFilter(next, "generationText", "I (1999 - 2005)");
  assert.deepEqual(listingFiltersToApi(next), {
    brand: ["Toyota"], model: ["Yaris"], generation: ["I (1999 - 2005)"],
  });
  assert.equal(updateListingFilter({ ...form, modelText: "", generationText: "" }, "class", ["C"]).brandText, "Volkswagen");
});

test("retired same_model flag cannot broaden a reopened saved search", () => {
  const original = { brand: ["Toyota"], model: ["Auris"], generation: ["II"], same_model: false };
  assert.deepEqual(listingFiltersToApi(listingFiltersToForm(original)), {
    brand: ["Toyota"], model: ["Auris"], generation: ["II"],
  });
  // Keep invalid historical combinations visible for correction, never silently drop one.
  assert.match(listingFilterError(listingFiltersToForm({ ...original, class: ["D"] })), /fie modelul/);
});

test("older generations have no implicit year cutoff and explicit older ranges round trip", () => {
  const form = {
    ...emptyListingFilters(), brandText: "Mercedes", modelText: "S-Class",
    generationText: "W116 (1972 - 1980)",
  };
  const filters = listingFiltersToApi(form);
  assert.equal(filters.year_min, undefined);
  assert.equal(filters.year_max, undefined);
  assert.deepEqual(filters.generation, ["W116 (1972 - 1980)"]);

  const olderRange = { ...filters, year_min: 1972, year_max: 1980 };
  assert.deepEqual(listingFiltersToApi(listingFiltersToForm(olderRange)), olderRange);
});

test("changing vehicles resets a narrowed year range while other filter edits preserve it", () => {
  const form = {
    ...emptyListingFilters(), brandText: "Mercedes", modelText: "S-Class",
    generationText: "W116 (1972 - 1980)", year_min: "1975", year_max: "1978",
    price_max: "20000",
  };
  for (const [field, value] of [
    ["brandText", "Mercedes, Toyota"], ["modelText", "S-Class, Yaris"],
    ["generationText", "W116 (1972 - 1980), III (2011 - 2020)"],
    ["generationText", ""], ["brandText", ""],
  ]) {
    const next = updateListingFilter(form, field, value);
    assert.equal(next.year_min, "");
    assert.equal(next.year_max, "");
    assert.equal(next.price_max, "20000");
  }
  for (const [field, value] of [["price_max", "15000"], ["modelText", "S-Class"]]) {
    const next = updateListingFilter(form, field, value);
    assert.equal(next.year_min, "1975");
    assert.equal(next.year_max, "1978");
  }
});
