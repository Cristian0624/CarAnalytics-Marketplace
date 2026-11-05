import { apiRequest } from "./api";

export async function estimatePrice(payload, signal) {
    return apiRequest("/price-estimate", {
        method: "POST",
        body: payload,
        signal,
    });
}

export async function estimatePriceFromUrl(url, signal) {
    return apiRequest("/price-estimate/from-url", {
        method: "POST",
        body: { url },
        signal,
    });
}
