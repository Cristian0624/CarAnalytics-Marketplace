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

export async function getListingOptions({
    brand,
    model,
    generation,
  } = {}) {
    const query = buildQueryString({
      brand,
      model,
      generation,
    });
  
    return apiRequest(`/listings/options${query}`);
  }