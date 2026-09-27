export const FIELD_LABELS = {
  brand: "Marcă", model: "Model", generation: "Generație", price: "Preț cerut",
  year: "An", mileage: "Kilometraj", engine: "Motor", fuel_type: "Combustibil",
  gearbox: "Cutie de viteze", drivetrain: "Tracțiune", body_type: "Caroserie",
};

const NUMBER_FIELDS = new Set(["price", "year", "mileage", "engine"]);

function normalizeVehicleName(value) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ro");
}

export function resolveVehicleOption(options, query) {
  const search = normalizeVehicleName(query);
  if (!search) return null;
  const exact = options.find((option) => normalizeVehicleName(option) === search);
  if (exact) return exact;
  if (search.length < 2) return null;
  const prefixes = options.filter((option) => normalizeVehicleName(option).startsWith(search));
  return prefixes.length === 1 ? prefixes[0] : null;
}

export function filterVehicleOptions(options, query) {
  const normalize = normalizeVehicleName;
  const search = normalize(query);
  if (!search) return options;
  const matches = options.filter((option) => normalize(option).includes(search));
  if (matches.length || search.length < 4) return matches;
  const maxDistance = search.length > 6 ? 2 : 1;
  const distance = (left, right) => {
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      const next = [i];
      for (let j = 1; j <= right.length; j += 1) {
        next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
      }
      previous = next;
    }
    return previous[right.length];
  };
  return options.filter((option) => distance(normalize(option), search) <= maxDistance);
}

// Only fields accepted by AnomalyRiskRequest leave the form. Blank is not zero.
export function buildRiskPayload(form) {
  return Object.fromEntries(Object.keys(FIELD_LABELS).map((key) => {
    const value = String(form[key] ?? "").trim();
    return [key, value === "" ? null : NUMBER_FIELDS.has(key) ? Number(value) : value];
  }));
}

export function hasOverallScore(result) {
  return result.assessment_status !== "very_rare" && result.anomaly_score != null;
}

export function riskExplanationLines(result, vehicle) {
  const price = result.components.price_anomaly;
  const mileage = result.components.mileage_anomaly;
  const specs = result.components.specification_anomaly;
  const format = (value, digits = 0) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: digits }).format(value);
  const lines = [
    `${format(result.confidence.model_observations)} anunțuri pentru model și ${format(result.market_support.model_generation_observations)} pentru ${vehicle.generation ? "această generație" : "grupul de comparație al modelului"} sunt în baza de date curentă.`,
  ];
  if (price.score != null) {
    lines.push(`Intervalul observat P10–P90 are o lățime de ${format(result.confidence.p10_p90_width)} € (${format(result.confidence.relative_interval_width * 100, 1)}% din mediană), pe baza a ${format(price.count)} anunțuri cu aceeași marcă și același model${vehicle.generation ? " și aceeași generație" : " din toate generațiile"}. Anul, kilometrajul și configurația nu filtrează acest grup.`);
  } else {
    lines.push(`Prețul nu a fost evaluat: ${format(price.count ?? 0)} anunțuri comparabile, față de minimum 10 necesare. ${vehicle.generation ? "Nu se folosesc alte generații sau modele." : "Comparația include toate generațiile aceluiași model."}`);
  }
  if (result.assessment_status === "very_rare") {
    lines.push("Există prea puține anunțuri în grupul selectat pentru un scor general.");
  } else if (result.assessment_status === "limited_support") {
    lines.push("Exemplele disponibile sunt limitate, deci încrederea în evaluare este redusă.");
  }
  const priceExplanation = {
    unusually_cheap: "Prețul cerut este sub percentila 10 a prețurilor observate (P10).",
    unusually_expensive: "Prețul cerut depășește percentila 90 a prețurilor observate (P90).",
    normal: price.actual_price >= price.p25 && price.actual_price <= price.p75
      ? "Prețul cerut este aproape de zona centrală observată a pieței."
      : "Prețul cerut este în intervalul P10–P90, dar în afara zonei centrale P25–P75.",
  };
  if (price.score != null) lines.push(priceExplanation[price.direction]);
  if (mileage.score == null) {
    lines.push(vehicle.mileage == null ? "Kilometrajul nu a fost introdus, deci nu a fost evaluat." : "Nu sunt suficiente exemple pentru compararea kilometrajului.");
  } else {
    const mileageText = { unusually_low: "Kilometrajul este neobișnuit de mic", unusually_high: "Kilometrajul este neobișnuit de mare", normal: "Kilometrajul se află în intervalul observat" };
    lines.push(`${mileageText[mileage.direction]} față de ${format(mileage.sample_size)} anunțuri comparabile.${["model", "model_generation"].includes(mileage.comparison_level) ? " Grupul comparat include ani de fabricație diferiți." : ""}`);
  }
  const missing = Object.entries(FIELD_LABELS).filter(([key]) => key !== "price" && vehicle[key] == null).map(([, label]) => label);
  if (missing.length) lines.push(`Câmpuri necompletate: ${missing.join(", ")}. Acestea pot reduce încrederea în rezultat.`);
  const severityExplanations = {
    unobserved: `nu apare în exemplele observate pentru ${vehicle.generation ? "acest model și această generație" : "acest model"}`,
    outside_observed_range: `este în afara intervalului observat pentru ${vehicle.generation ? "această generație" : "acest model"}`,
    uncommon: "este rar întâlnit în exemplele disponibile",
    very_rare: "este foarte rar întâlnit în exemplele disponibile",
  };
  for (const signal of specs.signals) {
    if (signal.value != null && severityExplanations[signal.severity]) {
      lines.push(`${FIELD_LABELS[signal.field] ?? signal.field} (${signal.value}) ${severityExplanations[signal.severity]}.`);
    }
  }
  if (result.market_support.rarity_penalty) {
    lines.push(`Scorul general include o ajustare de ${format(result.market_support.rarity_penalty, 1)} puncte pentru raritatea modelului.`);
  }
  return lines;
}

export function riskErrorMessage(error) {
  if (error.name === "TimeoutError") return "Analiza durează prea mult. Încearcă din nou în câteva momente.";
  if (error.status === 503) return "Analiza este momentan indisponibilă. Încearcă din nou mai târziu.";
  if (error.status === 422) {
    const fields = [...new Set((Array.isArray(error.detail) ? error.detail : [])
      .map((item) => FIELD_LABELS[item.loc?.[1]]).filter(Boolean))];
    return fields.length ? `Verifică aceste câmpuri: ${fields.join(", ")}.` : "Verifică datele introduse și încearcă din nou.";
  }
  if (error instanceof TypeError) return "Nu putem contacta serverul. Verifică conexiunea și încearcă din nou.";
  return "Analiza nu a putut fi finalizată. Încearcă din nou.";
}
