const FIELD_LABELS = {
  brand: "Marcă", model: "Model", generation: "Generație", year: "An fabricație",
  year_min: "An minim", year_max: "An maxim", mileage: "Kilometraj",
  mileage_min: "Kilometraj minim", mileage_max: "Kilometraj maxim",
  price: "Preț cerut", engine: "Capacitate motor", fuel_type: "Combustibil",
  gearbox: "Cutie de viteze", drivetrain: "Tracțiune", body_type: "Caroserie",
};

// Only recognized Romanian server messages reach the UI. Generic framework
// validation text and unexpected server errors use Romanian fallbacks.
function romanianServerMessage(message) {
  if (typeof message !== "string") return null;
  const text = message.replace(/^Value error,\s*/, "");
  return /^(Anul |Kilometrajul |Generația |Selectează |Capacitatea |Tipul |Datele |Analiza )/.test(text) ? text : null;
}

export function assessmentValidationMessage(detail) {
  const message = romanianServerMessage(detail);
  if (message) return message;
  if (!Array.isArray(detail)) return null;
  const messages = detail.map((issue) => {
    const custom = romanianServerMessage(issue.msg);
    if (custom) return custom;
    const field = FIELD_LABELS[issue.loc?.[1]] ?? "Câmpul indicat";
    switch (issue.type) {
      case "missing": return `${field}: completează acest câmp.`;
      case "greater_than": return `${field}: valoarea trebuie să fie mai mare decât ${issue.ctx?.gt}.`;
      case "greater_than_equal": return `${field}: valoarea trebuie să fie cel puțin ${issue.ctx?.ge}.`;
      case "less_than": return `${field}: valoarea trebuie să fie mai mică decât ${issue.ctx?.lt}.`;
      case "less_than_equal": return `${field}: valoarea nu poate depăși ${issue.ctx?.le}.`;
      case "int_parsing":
      case "int_from_float":
      case "int_type": return `${field}: introdu un număr întreg valid.`;
      case "float_parsing":
      case "decimal_parsing":
      case "finite_number": return `${field}: introdu un număr valid.`;
      case "string_too_short": return `${field}: completează acest câmp.`;
      case "string_too_long": return `${field}: folosește maximum ${issue.ctx?.max_length} caractere.`;
      default: return null;
    }
  }).filter(Boolean);
  return messages.length ? [...new Set(messages)].join(" ") : null;
}

export function localizeInputValidity(event) {
  const input = event.target;
  if (!input.setCustomValidity) return;
  input.setCustomValidity("");
  const validity = input.validity;
  const message = validity.valueMissing ? "Completează acest câmp."
    : validity.rangeUnderflow ? `Valoarea trebuie să fie cel puțin ${input.min}.`
    : validity.rangeOverflow ? `Valoarea nu poate depăși ${input.max}.`
    : validity.stepMismatch ? "Introdu o valoare cu precizia permisă pentru acest câmp."
    : "Introdu o valoare validă pentru acest câmp.";
  input.setCustomValidity(message);
}

export function clearInputValidity(event) {
  event.target.setCustomValidity?.("");
}
