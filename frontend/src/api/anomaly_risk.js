import { apiRequest } from "./api";

export function assessAnomalyRisk(body, signal) {
  return apiRequest("/anomaly-risk", { method: "POST", body, signal });
}
