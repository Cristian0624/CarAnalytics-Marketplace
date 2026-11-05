import { apiRequest } from "./api";

export function assessAnomalyRisk(body, signal) {
  return apiRequest("/anomaly-risk", { method: "POST", body, signal });
}

export function assessAnomalyRiskFromUrl(url, signal) {
  return apiRequest("/anomaly-risk/from-url", {
    method: "POST",
    body: { url },
    signal,
  });
}

