import { assessmentValidationMessage } from "./assessmentErrors.js";

export function priceEstimateErrorMessage(error) {
  if (error?.name === "TimeoutError") return "Estimarea durează prea mult. Încearcă din nou.";
  if (error instanceof TypeError) return "Nu putem contacta serverul. Verifică conexiunea și încearcă din nou.";
  if (error?.status === 422) return assessmentValidationMessage(error.detail) ?? "Verifică datele introduse pentru estimarea prețului.";
  if ([500, 502, 503, 504].includes(error?.status)) return "Estimarea este momentan indisponibilă. Încearcă din nou mai târziu.";
  if (error?.status === 401 || error?.status === 403) return "Autentifică-te pentru a continua.";
  return "Nu am putut calcula prețul estimat. Încearcă din nou.";
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
