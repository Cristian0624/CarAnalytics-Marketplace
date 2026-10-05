import { translateAssessment } from "./assessmentI18n.js";

const defaultTranslate = (key, values) => translateAssessment(undefined, key, values);

const ranges = [
  "price",
  "mileage",
  "year",
  "engine",
  "horsepower",
  "doors",
  "seats",
  "score",
];

const selections = [
  "fuel_type",
  "gearbox",
  "body_types",
  "state",
  "drivetrains",
  "seller_type",
  "registration_country",
  "class",
];

const identities = [
  "brand",
  "model",
  "generation",
];

const FILTER_LABEL_KEYS = {
  brand: "listingFilters.labels.brand",
  model: "listingFilters.labels.model",
  generation: "listingFilters.labels.generation",
  price: "listingFilters.labels.price",
  mileage: "listingFilters.labels.mileage",
  year: "listingFilters.labels.year",
  engine: "listingFilters.labels.engine",
  horsepower: "listingFilters.labels.horsepower",
  doors: "listingFilters.labels.doors",
  seats: "listingFilters.labels.seats",
  score: "listingFilters.labels.score",
  fuel_type: "listingFilters.labels.fuel",
  gearbox: "listingFilters.labels.gearbox",
  body_types: "listingFilters.labels.body",
  state: "listingFilters.labels.state",
  drivetrains: "listingFilters.labels.drivetrain",
  seller_type: "listingFilters.labels.seller",
  registration_country: "listingFilters.labels.registration",
  class: "listingFilters.labels.class",
};

export function emptyListingFilters() {
  return {
    search: "",
    brandText: "",
    modelText: "",
    generationText: "",
    sort_by: "",
    sort_order: "",

    ...Object.fromEntries(
      ranges.flatMap((name) => [
        [`${name}_min`, ""],
        [`${name}_max`, ""],
      ])
    ),

    ...Object.fromEntries(
      selections.map((name) => [name, []])
    ),
  };
}

export function listingFiltersToApi(form) {
  const result = {};

  for (const key of identities) {
    const values = (form[`${key}Text`] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length) {
      result[key] = values;
    }
  }

  for (const name of ranges) {
    for (const suffix of ["min", "max"]) {
      const key = `${name}_${suffix}`;

      if (form[key] !== "" && form[key] != null) {
        result[key] = Number(form[key]);
      }
    }
  }

  for (const key of selections) {
    if (form[key]?.length) {
      result[key] = [...form[key]];
    }
  }

  if (form.sort_by) {
    result.sort_by = form.sort_by;
  }

  if (form.sort_order) {
    result.sort_order = form.sort_order;
  }

  return result;
}

export function listingFiltersToForm(filters = {}) {
  const form = emptyListingFilters();

  for (const key of identities) {
    form[`${key}Text`] = (filters[key] ?? []).join(", ");
  }

  for (const key of Object.keys(form)) {
    if (key in filters && filters[key] != null) {
      form[key] = Array.isArray(filters[key])
        ? [...filters[key]]
        : filters[key];
    }
  }

  return form;
}

export function describeFilters(filters, t = defaultTranslate) {
  const parts = [];

  for (const key of [...identities, ...selections]) {
    if (filters[key]?.length) {
      parts.push(
        `${t(FILTER_LABEL_KEYS[key])}: ${filters[key].join(", ")}`
      );
    }
  }

  for (const key of ranges) {
    const min = filters[`${key}_min`];
    const max = filters[`${key}_max`];

    if (min != null || max != null) {
      parts.push(
        `${t(FILTER_LABEL_KEYS[key])}: ${
          min ?? t("listingFilters.any")
        } – ${max ?? t("listingFilters.any")}`
      );
    }
  }

  if (filters.sort_by) {
    const sortLabels = {
      price_eur: t("listingFilters.sort.price"),
      score: t("listingFilters.sort.score"),
      year: t("listingFilters.sort.year"),
      mileage: t("listingFilters.sort.mileage"),
    };

    const order =
      filters.sort_order === "desc"
        ? t("listingFilters.sort.descending")
        : t("listingFilters.sort.ascending");

    parts.push(
      `${t("listingFilters.sort.label")}: ${
        sortLabels[filters.sort_by] ?? filters.sort_by
      }, ${order}`
    );
  }

  return parts.length
    ? parts
    : [t("listingFilters.allListings")];
}

export function listingFilterError(form, t = defaultTranslate) {
  const hasBrand = Boolean(form.brandText?.trim());
  const hasModel = Boolean(form.modelText?.trim());

  if (hasModel && form.class?.length) {
    return t("listingFilters.errors.modelOrClass");
  }

  if (hasModel && !hasBrand) {
    return t("listingFilters.errors.brandBeforeModel");
  }

  if (
    form.generationText?.trim() &&
    (!hasBrand || !hasModel)
  ) {
    return t("listingFilters.errors.modelBeforeGeneration");
  }

  return "";
}

export function updateListingFilter(current, field, value) {
  return {
    ...current,
    [field]: value,
  };
}
