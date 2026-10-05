import romanian from "../languages/locales/ro.json" with { type: "json" };

// Keep utility callers and saved-analysis tests usable without a browser i18n instance.
export function translateAssessment(t, key, values = {}) {
  if (t) return t(key, values);
  const template = key.split(".").reduce((value, part) => value?.[part], romanian);
  if (typeof template !== "string") return key;
  return template.replace(/{{(\w+)}}/g, (_, name) => String(values[name] ?? ""));
}

export function assessmentNumber(t, value, digits = 0) {
  return new Intl.NumberFormat(translateAssessment(t, "assessment.locale"), {
    maximumFractionDigits: digits,
  }).format(value);
}
