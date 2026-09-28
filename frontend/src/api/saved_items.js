import { apiRequest } from "./api";

export const savedPaths = {
  searches: "/saved-searches",
  risks: "/saved-risk-assessments",
  favourites: "/favourites",
};

export const listSaved = (kind, page = 1, signal, limit = 12) =>
  apiRequest(`${savedPaths[kind]}?page=${page}&limit=${limit}`, { signal });
export const getSaved = (kind, id, signal) => apiRequest(`${savedPaths[kind]}/${id}`, { signal });
export const createSaved = (kind, body) => apiRequest(savedPaths[kind], { method: "POST", body });
export const updateSaved = (kind, id, body) => apiRequest(`${savedPaths[kind]}/${id}`, { method: "PATCH", body });
export const deleteSaved = (kind, id) => apiRequest(`${savedPaths[kind]}/${id}`, { method: "DELETE" });
export const reanalyseSaved = (id) => apiRequest(`${savedPaths.risks}/${id}/reanalyse`, { method: "POST" });

export async function allFavourites(signal) {
  const items = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await listSaved("favourites", page, signal, 100);
    items.push(...result.items);
    pages = result.pages;
    page += 1;
  } while (page <= pages);
  return items;
}
