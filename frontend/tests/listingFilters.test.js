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

test("changing brand or model clears dependent selections, while class search retains brand", () => {
  const form = { ...emptyListingFilters(), brandText: "Volkswagen", modelText: "Golf", generationText: "VII" };
  assert.equal(updateListingFilter(form, "brandText", "Toyota").modelText, "");
  assert.equal(updateListingFilter(form, "brandText", "Toyota").generationText, "");
  assert.equal(updateListingFilter(form, "modelText", "Polo").generationText, "");
  assert.equal(updateListingFilter(form, "modelText", "Golf").generationText, "VII");
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
