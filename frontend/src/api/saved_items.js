import { apiRequest } from "./api";

export const savedPaths = {
  favourites: "/favourites",
  risks: "/saved-risk-assessments",
  searches: "/saved-searches",
  comparisons: "/saved-searches",
  myListings: "/my-listings",
};

export const listSaved = (kind, page = 1, signal, limit = 12) => {
  let url = `${savedPaths[kind]}?page=${page}&limit=${limit}`;
  if (kind === "comparisons") url += "&is_comparison=true";
  else if (kind === "searches") url += "&is_comparison=false";
  return apiRequest(url, { signal });
};
export const getSaved = (kind, id, signal) => apiRequest(`${savedPaths[kind]}/${id}`, { signal });
export const createSaved = (kind, body) => apiRequest(savedPaths[kind], { method: "POST", body });
export const updateSaved = (kind, id, body) => apiRequest(`${savedPaths[kind]}/${id}`, { method: "PATCH", body });
export const deleteSaved = (kind, id) => apiRequest(`${savedPaths[kind]}/${id}`, { method: "DELETE" });
export const reanalyseSaved = (id) => apiRequest(`${savedPaths.risks}/${id}/reanalyse`, { method: "POST" });

export async function allFavourites(signal) {
  return allSaved("favourites", signal);
}

export async function allSaved(kind, signal) {
  const items = [];
  let page = 1;
  let pages = 1;
  do {
    const result = await listSaved(kind, page, signal, 100);
    items.push(...result.items);
    pages = result.pages;
    page += 1;
  } while (page <= pages);
  return items;
}
