import { assessmentValidationMessage } from "./assessmentErrors.js";
import { translateAssessment } from "./assessmentI18n.js";

export function priceEstimateErrorMessage(error, t) {
  const tr = (key) => translateAssessment(t, `assessment.${key}`);
  if (error?.name === "TimeoutError") return tr("priceTimeout");
  if (error instanceof TypeError) return tr("connection");
  if (error?.status === 422) return assessmentValidationMessage(error.detail, t) ?? tr("priceInvalid");
  if ([500, 502, 503, 504].includes(error?.status)) return tr("priceUnavailable");
  if (error?.status === 401 || error?.status === 403) return tr("login");
  return tr("priceFailed");
}

export function priceEstimateComparisonMessage(comparison, t) {
  if (!comparison) return "";
  const tr = (key, values) => translateAssessment(t, `assessment.${key}`, values);
  const count = comparison.total_used;
  if (count === 0) return tr("zeroListings");
  if (count === 1) return tr("oneListing");
  if (count < 7) return tr("fewListings", { count });
  return [
    tr("estimateGroup", { count }), tr("estimateWeighting"),
    comparison.limited_market_data ? tr("estimateLimited") : "",
    tr("askingDisclaimer"),
  ].filter(Boolean).join(" ");
}

export function priceEstimateYearBounds(year, currentYear = new Date().getFullYear()) {
  return {
    year_min: Math.max(1886, year - 2),
    year_max: Math.min(currentYear + 1, year + 2),
  };
}

export function priceEstimateMileageBounds() {
  // The generation supplies the comparison pool. Mileage is a soft preference.
  // Keep the legacy request fields without introducing hidden mileage limits.
  return {
    mileage_min: 0,
    mileage_max: 10000000,
  };
}
