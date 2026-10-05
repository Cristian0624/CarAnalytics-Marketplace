import { translateAssessment } from "./assessmentI18n.js";

const FIELD_NAMES = new Set([
  "brand", "model", "generation", "year", "year_min", "year_max", "mileage",
  "mileage_min", "mileage_max", "price", "engine", "fuel_type", "gearbox", "drivetrain", "body_type",
]);

function serverValidationMessage(message, t) {
  if (typeof message !== "string") return null;
  const text = message.replace(/^Value error,\s*/, "");
  const keys = [
    "unknownGeneration", "futureYear", "futureYearRange", "yearRange", "mileageRange",
    "enginePositive", "engineOption", "fuelOption", "comparisonLoad",
  ];
  for (const key of keys) {
    if (text === translateAssessment(undefined, `assessment.${key}`)) {
      return translateAssessment(t, `assessment.${key}`);
    }
  }
  const range = text.match(/^Anul de fabricație trebuie să corespundă generației selectate \(([^)]+)\) și intervalului de ani ales\.$/);
  if (range) return translateAssessment(t, "assessment.generationYear", { range: range[1] });
  const category = text.match(/^Selectează (.+) din opțiunile disponibile pentru mașina aleasă\.$/);
  if (category) {
    const field = { marca: "brand", modelul: "model", "generația": "generation",
      combustibilul: "fuel_type", "cutia de viteze": "gearbox", "tracțiunea": "drivetrain", caroseria: "body_type" }[category[1]];
    if (field) {
      // Keep the original inflection in Romanian; translate the label in other languages.
      if (translateAssessment(t, "assessment.locale") === "ro-RO") return text;
      return translateAssessment(t, "assessment.categoryOption", { field: translateAssessment(t, `assessment.fields.${field}`) });
    }
  }
  if (text === translateAssessment(undefined, "anomalyRiskResults.errors.unavailable")) {
    return translateAssessment(t, "anomalyRiskResults.errors.unavailable");
  }
  return null;
}

export function assessmentValidationMessage(detail, t) {
  const message = serverValidationMessage(detail, t);
  if (message) return message;
  if (!Array.isArray(detail)) return null;
  const messages = detail.map((issue) => {
    const custom = serverValidationMessage(issue.msg, t);
    if (custom) return custom;
    const fieldName = issue.loc?.[1];
    const field = translateAssessment(t, FIELD_NAMES.has(fieldName) ? `assessment.fields.${fieldName}` : "assessment.field");
    const tr = (key, bound) => translateAssessment(t, `assessment.${key}`, { field, bound });
    const bounds = { greater_than: "gt", greater_than_equal: "ge", less_than: "lt", less_than_equal: "le" };
    if (bounds[issue.type]) {
      const bound = issue.ctx?.[bounds[issue.type]];
      return bound == null ? null : tr(issue.type, bound);
    }
    switch (issue.type) {
      case "missing":
      case "string_too_short": return tr("missing");
      case "int_parsing":
      case "int_from_float":
      case "int_type": return tr("integer");
      case "float_parsing":
      case "decimal_parsing":
      case "finite_number": return tr("number");
      case "string_too_long": return issue.ctx?.max_length == null ? null : tr("tooLong", issue.ctx.max_length);
      default: return null;
    }
  }).filter(Boolean);
  return messages.length ? [...new Set(messages)].join(" ") : null;
}

export function localizeInputValidity(event, t) {
  const input = event.target;
  if (!input.setCustomValidity) return;
  input.setCustomValidity("");
  const validity = input.validity;
  if (validity.valid) return;
  const key = validity.valueMissing ? "required"
    : validity.rangeUnderflow ? "atLeast"
    : validity.rangeOverflow ? "atMost"
    : validity.stepMismatch ? "precision" : "valid";
  input.setCustomValidity(translateAssessment(t, `assessment.${key}`, {
    bound: validity.rangeUnderflow ? input.min : input.max,
  }));
}

export function clearInputValidity(event) {
  event.target.setCustomValidity?.("");
}
