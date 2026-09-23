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

export async function getPredictionBrands(query = "") {
    const params = buildQueryString({ query });
  
    return apiRequest(`/predict/brands${params}`);
}

export async function getPredictionModels(
    brand,
    query = ""
  ) {
    const params = buildQueryString({
      brand,
      query,
    });
  
    return apiRequest(`/predict/models${params}`);
}

export async function getPredictionGenerations(
    brand,
    model,
    query = ""
  ) {
    const params = buildQueryString({
      brand,
      model,
      query,
    });
  
    return apiRequest(`/predict/generations${params}`);
}

export async function getPredictionEngines(
    brand,
    model,
    generation,
    query = ""
  ) {
    const params = buildQueryString({
      brand,
      model,
      generation,
      query,
    });
  
    return apiRequest(`/predict/engines${params}`);
}

export async function getPredictionFuels(
    brand,
    model,
    generation,
    engine_size,
    query = ""
  ) {
    const params = buildQueryString({
      brand,
      model,
      generation,
      engine_size,
      query,
    });
  
    return apiRequest(`/predict/fuels${params}`);
}

export async function getPredictionGearboxes(
    brand,
    model,
    generation,
    engine_size,
    fuel_type,
    query = ""
  ) {
    const params = buildQueryString({
      brand,
      model,
      generation,
      engine_size,
      fuel_type,
      query,
    });
  
    return apiRequest(`/predict/gearboxes${params}`);
}

export async function predictPrice({
    brand,
    model,
    generation,
    engine_size,
    fuel_type,
    gearbox,
    mileage,
    year,
  }) {
    const query = buildQueryString({
      brand,
      model,
      generation,
      engine_size,
      fuel_type,
      gearbox,
      mileage,
      year,
    });
  
    return apiRequest(`/predict/price${query}`);
}