import { apiRequest } from "./api";

export async function getAnalyses(token) {
    return apiRequest("/analysis", {
        token,
    });
}

export async function getAnalysis(analysisId, token) {
    return apiRequest(`/analysis/${analysisId}`, {
        token,
    });
}

export async function createAnalysis(payload, token) {
    return apiRequest("/analysis", {
        method: "POST",
        body: payload,
        token
    });
}

export async function updateAnalysis(analysisId, payload, token) {
    return apiRequest(`/analysis/${analysisId}`, {
        method: "PATCH",
        body: payload,
        token,
    });
}

export async function deleteAnalysis(analysisId, token) {
    return apiRequest(`/analysis/${analysisId}`, {
        method: "DELETE",
        token,
    });
}