import test from "node:test";
import assert from "node:assert/strict";
import { assessmentValidationMessage, clearInputValidity, localizeInputValidity } from "../src/utils/assessmentErrors.js";
import { priceEstimateErrorMessage } from "../src/utils/priceEstimate.js";
import { riskErrorMessage } from "../src/utils/anomalyRisk.js";

test("generation warnings remain specific and Romanian in the price estimator", () => {
  const detail = "Anul de fabricație trebuie să corespundă generației selectate (1999–2005) și intervalului de ani ales.";
  assert.equal(priceEstimateErrorMessage({ status: 422, detail }), detail);
  assert.match(priceEstimateErrorMessage({ status: 422, detail: "Target year must fall within the selected generation" }), /Verifică datele/);
});

test("both features show Romanian model-validator messages without the English prefix", () => {
  const detail = [{ loc: ["body"], type: "value_error", msg: "Value error, Anul de fabricație nu poate depăși anul calendaristic următor." }];
  for (const formatter of [priceEstimateErrorMessage, riskErrorMessage]) {
    assert.equal(formatter({ status: 422, detail }), "Anul de fabricație nu poate depăși anul calendaristic următor.");
  }
});

test("framework validation errors translate numeric bounds, required fields and invalid values", () => {
  const cases = [
    [{ type: "missing", loc: ["body", "generation"], msg: "Field required" }, "Generație: completează acest câmp."],
    [{ type: "greater_than", loc: ["body", "price"], ctx: { gt: 0 }, msg: "Input should be greater than 0" }, "Preț cerut: valoarea trebuie să fie mai mare decât 0."],
    [{ type: "less_than_equal", loc: ["body", "engine"], ctx: { le: 20 }, msg: "Input should be less than or equal to 20" }, "Capacitate motor: valoarea nu poate depăși 20."],
    [{ type: "int_from_float", loc: ["body", "year"], msg: "Input should be a valid integer" }, "An fabricație: introdu un număr întreg valid."],
    [{ type: "finite_number", loc: ["body", "mileage"], msg: "Input should be a finite number" }, "Kilometraj: introdu un număr valid."],
  ];
  for (const [issue, expected] of cases) {
    assert.equal(assessmentValidationMessage([issue]), expected);
    for (const formatter of [priceEstimateErrorMessage, riskErrorMessage]) assert.equal(formatter({ status: 422, detail: [issue] }), expected);
  }
});

test("connection failures and unexpected server messages cannot leak English into the estimator", () => {
  assert.match(priceEstimateErrorMessage(new TypeError("Failed to fetch")), /Nu putem contacta serverul/);
  assert.match(priceEstimateErrorMessage({ status: 502, detail: "Internal Server Error" }), /momentan indisponibilă/);
  assert.match(priceEstimateErrorMessage(new Error("Request failed (500)")), /Nu am putut calcula/);
  assert.match(priceEstimateErrorMessage({ status: 422, detail: [{ type: "unknown_error", msg: "Unexpected English text" }] }), /Verifică datele/);
});

test("native validation speaks Romanian and clears when the input is edited", () => {
  for (const [validity, expected] of [
    [{ valueMissing: true }, "Completează acest câmp."],
    [{ rangeUnderflow: true }, "Valoarea trebuie să fie cel puțin 1886."],
    [{ rangeOverflow: true }, "Valoarea nu poate depăși 2027."],
    [{ stepMismatch: true }, "Introdu o valoare cu precizia permisă pentru acest câmp."],
  ]) {
    const target = { validity, min: "1886", max: "2027", setCustomValidity(message) { this.message = message; } };
    localizeInputValidity({ target });
    assert.equal(target.message, expected);
    clearInputValidity({ target });
    assert.equal(target.message, "");
  }
});
