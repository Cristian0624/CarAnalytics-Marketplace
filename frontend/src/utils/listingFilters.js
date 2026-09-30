const ranges = ["price", "mileage", "year", "engine", "horsepower", "doors", "seats", "score"];
const selections = ["fuel_type", "gearbox", "body_types", "state", "drivetrains", "seller_type", "registration_country", "class"];
const identities = ["brand", "model", "generation"];

export function emptyListingFilters() {
  return {
    search: "", brandText: "", modelText: "", generationText: "", same_model: null, sort_by: "", sort_order: "",
    ...Object.fromEntries(ranges.flatMap((name) => [[`${name}_min`, ""], [`${name}_max`, ""]])),
    ...Object.fromEntries(selections.map((name) => [name, []])),
  };
}

export function listingFiltersToApi(form) {
  const result = {};
  for (const key of identities) {
    const values = (form[`${key}Text`] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    if (values.length) result[key] = values;
  }
  for (const name of ranges) {
    for (const suffix of ["min", "max"]) {
      const key = `${name}_${suffix}`;
      if (form[key] !== "" && form[key] != null) result[key] = Number(form[key]);
    }
  }
  for (const key of selections) {
    if (form[key]?.length) result[key] = [...form[key]];
  }
  if (form.same_model != null) result.same_model = form.same_model;
  if (form.sort_by) result.sort_by = form.sort_by;
  if (form.sort_order) result.sort_order = form.sort_order;
  // The free-text search box is not an accepted /listings API filter.
  return result;
}

export function listingFiltersToForm(filters = {}) {
  const form = emptyListingFilters();
  for (const key of identities) form[`${key}Text`] = (filters[key] ?? []).join(", ");
  for (const key of Object.keys(form)) {
    if (key in filters && filters[key] != null) form[key] = Array.isArray(filters[key]) ? [...filters[key]] : filters[key];
  }
  return form;
}

const labels = { brand: "Marcă", model: "Model", generation: "Generație", price: "Preț (€)", mileage: "Kilometraj",
  year: "An", engine: "Motor", horsepower: "Cai putere", doors: "Uși", seats: "Locuri", score: "Scor",
  fuel_type: "Combustibil", gearbox: "Cutie", body_types: "Caroserie", state: "Stare", drivetrains: "Tracțiune",
  seller_type: "Vânzător", registration_country: "Înmatriculare", class: "Clasă" };

export function describeFilters(filters) {
  const parts = [];
  for (const key of [...identities, ...selections]) {
    if (filters[key]?.length) parts.push(`${labels[key]}: ${filters[key].join(", ")}`);
  }
  for (const key of ranges) {
    const min = filters[`${key}_min`], max = filters[`${key}_max`];
    if (min != null || max != null) parts.push(`${labels[key]}: ${min ?? "oricât"} – ${max ?? "oricât"}`);
  }
  if (filters.same_model != null) parts.push(`Același model: ${filters.same_model ? "da" : "nu"}`);
  if (filters.sort_by) parts.push(`Sortare: ${{ price_eur: "preț", score: "scor", year: "an", mileage: "kilometraj" }[filters.sort_by]}, ${filters.sort_order === "desc" ? "descrescător" : "crescător"}`);
  return parts.length ? parts : ["Toate anunțurile"];
}
