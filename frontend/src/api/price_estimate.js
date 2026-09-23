import { apiRequest } from "./api";

export async function estimatePrice(payload) {
    return apiRequest("/price-estimate", {
        method: "POST",
        body: payload,
    });
}