import { apiRequest } from "./api";

function buildQueryString(params) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key , value]) => {
        if (value === undefined || value === null || value === ""){
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => {
                searchParams.append(key, item);
            });
        } else {
            searchParams.append(key, value);
        }
    });

    const query = searchParams.toString();

    return query ? `?${query}` : "";
}

export async function searchListings(filters = {}) {
    const query = buildQueryString(filters);

    return apiRequest(`/listings${query}`);
}

export async function searchListingsPaginated(
    filters = {},
    page = 1,
    limit = 20
) {
    const query = buildQueryString({
        ...filters,
        page,
        limit,
    });

    return apiRequest(`/listings/paginated${query}`);
}

export async function getListing(listingID) {
    return apiRequest(`listings/${listingID}`);
}

export async function getListingYearRange(filters = {}) {
    return apiRequest(`/listings/year-range${buildQueryString(filters)}`);
}

const optionsCache = new Map();
const resolvedCache = new Map();

export function getCachedListingOptions({ brand, model, generation } = {}) {
    const key = `${brand || ""}|${model || ""}|${generation || ""}`;
    return resolvedCache.get(key) || null;
}

export async function getListingOptions({
    brand,
    model,
    generation,
  } = {}) {
    const key = `${brand || ""}|${model || ""}|${generation || ""}`;
    if (resolvedCache.has(key)) {
      return resolvedCache.get(key);
    }
    if (optionsCache.has(key)) {
      return optionsCache.get(key);
    }

    const query = buildQueryString({
      brand,
      model,
      generation,
    });

    const request = apiRequest(`/listings/options${query}`)
      .then((res) => {
        resolvedCache.set(key, res);
        return res;
      })
      .catch((err) => {
        optionsCache.delete(key);
        resolvedCache.delete(key);
        throw err;
      });

    optionsCache.set(key, request);
    return request;
}

export function prefetchListingOptions() {
    return getListingOptions().catch(() => {});
}
