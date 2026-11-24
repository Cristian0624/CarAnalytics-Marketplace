const FIELD_ALIASES = {
  body_types: "body_type",
  drivetrains: "drivetrain",
};

const RISK_OPTION_FIELDS = new Set([
  "fuel_type",
  "gearbox",
  "drivetrain",
  "body_type",
]);

const COMPARATOR_VALUE_FIELDS = new Set([
  "class",
  "registration_country",
  "state",
  "seller_type",
]);

/**
 * Translate a database vehicle characteristic value into the active UI language (ro/en/ru),
 * while preserving the raw string fallback for unknown/custom values.
 */
export function translateCarValue(t, field, value) {
  if (value === null || value === undefined || value === "") return "";
  const text = String(value).trim();
  if (!text) return "";
  if (!t) return text;

  const normalizedField = FIELD_ALIASES[field] ?? field;

  if (normalizedField === "generation") {
    const presentWord = t("comparatorPage.present", { defaultValue: "prezent" });
    return text.replace(/\bprezent\b/gi, presentWord);
  }

  if (RISK_OPTION_FIELDS.has(normalizedField)) {
    return t(`risk.options.${normalizedField}.${text}`, { defaultValue: text });
  }

  if (COMPARATOR_VALUE_FIELDS.has(normalizedField)) {
    return t(`comparatorPage.values.${normalizedField}.${text}`, { defaultValue: text });
  }

  return text;
}
