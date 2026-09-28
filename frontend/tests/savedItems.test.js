import test from "node:test";
import assert from "node:assert/strict";
import { describeFilters, emptyListingFilters, listingFiltersToApi, listingFiltersToForm } from "../src/utils/listingFilters.js";
import { findFavourite, savedError } from "../src/utils/savedItems.js";

test("saved filters round trip all supported fields including class, false and zero", () => {
  const filters = { brand: ["BMW", "Toyota"], model: ["3 Series"], generation: ["F30"], class: ["D-segment (Mid-size)"],
    fuel_type: ["Diesel"], gearbox: ["Automată"], body_types: ["Sedan"], state: ["Cu rulaj"], drivetrains: ["Din spate"],
    seller_type: ["Dealer auto"], registration_country: ["Republica Moldova"], same_model: false,
    price_min: 0, price_max: 20000, mileage_min: 0, mileage_max: 250000, year_min: 2012, year_max: 2018,
    engine_min: 0, engine_max: 3.0, horsepower_min: 0, horsepower_max: 350, doors_min: 2, doors_max: 5,
    seats_min: 2, seats_max: 7, score_min: 0, score_max: 80, sort_by: "price_eur", sort_order: "desc" };
  assert.deepEqual(listingFiltersToApi(listingFiltersToForm(filters)), filters);
});

test("empty filters and API nulls remain an unrestricted search", () => {
  assert.deepEqual(listingFiltersToApi(emptyListingFilters()), {});
  assert.deepEqual(listingFiltersToApi(listingFiltersToForm({ brand: null, class: null, year_min: null })), {});
});

test("draft edits cannot mutate the applied filter snapshot", () => {
  const form = listingFiltersToForm({ brand: ["Toyota"], fuel_type: ["Diesel"], price_max: 9000 });
  const applied = listingFiltersToApi(form);
  form.fuel_type.push("Benzină");
  form.brandText = "BMW";
  form.price_max = 12000;
  assert.deepEqual(applied, { brand: ["Toyota"], fuel_type: ["Diesel"], price_max: 9000 });
});

test("filter requests exclude UI-only fields and normalize numeric strings", () => {
  const form = { ...emptyListingFilters(), search: "arbitrary UI search", brandText: " BMW, Toyota ", price_max: "12000.50" };
  assert.deepEqual(listingFiltersToApi(form), { brand: ["BMW", "Toyota"], price_max: 12000.5 });
});

test("favourite matching follows source URL across changed local IDs", () => {
  const item = { id: 8, listing_id: 1, listing_url: "https://example.test/one" };
  assert.equal(findFavourite([item], { id: 99, url: item.listing_url }), item);
  assert.equal(findFavourite([item], { id: 1, url: "https://example.test/different" }), undefined);
  const noUrl = { id: 9, listing_id: 12, listing_url: null };
  assert.equal(findFavourite([noUrl], { id: "12" }), noUrl);
});

test("saved filter summaries show actual criteria rather than listing results", () => {
  assert.deepEqual(describeFilters({ price_min: 0, price_max: 9000, same_model: false }), ["Preț (€): 0 – 9000", "Același model: nu"]);
  assert.deepEqual(describeFilters({}), ["Toate anunțurile"]);
});

test("saved item failures are actionable without exposing server details", () => {
  assert.match(savedError({ status: 401 }), /Autentifică/);
  assert.match(savedError({ status: 404 }), /disponibil/);
  assert.match(savedError({ status: 422 }), /intervalele/);
  assert.ok(!savedError({ status: 500, message: "secret database details" }).includes("secret"));
});
