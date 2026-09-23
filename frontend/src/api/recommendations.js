import { apiRequest } from "./api";

function buildQueryString(params) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            searchParams.append(key, value);
        }
    });

    const query = searchParams.toString();

    return query ? `?${query}` : "";
}

export async function getRecommendationsForCar(carId) {
    return apiRequest(`/recommendations/${carId}`);
}

export async function getCustomRecommendations({
    brand,
    model,
    price_eur,
    mileage,
    year,
    body_type,
  }) {
    const query = buildQueryString({
      brand,
      model,
      price_eur,
      mileage,
      year,
      body_type,
    });
  
    return apiRequest(`/recommendations${query}`);
  }