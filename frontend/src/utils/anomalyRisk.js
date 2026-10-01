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

export function usesCurrentRiskPolicy(result) {
  return ["anomaly-risk-v2.6-selected-group", "anomaly-risk-v2.7-extreme-signals", "anomaly-risk-v2.8-extreme-override", "anomaly-risk-v2.9-median-override", "anomaly-risk-v2.10-gradual-override"].includes(result.scoring_policy_version)
    && result.components.price_anomaly.source === "database";
}

export function extremeAnomalyMessage(flag) {
  const messages = {
    extreme_price_low: "Alertă: preț mult sub mediana grupului.",
    extreme_price_high: "Alertă: preț mult peste mediana grupului.",
    extreme_mileage_low: "Alertă: kilometraj mult sub mediana grupului.",
    extreme_mileage_high: "Alertă: kilometraj mult peste mediana grupului.",
  };
  return messages[flag] ?? null;
}

export function riskExplanationLines(result, vehicle) {
  const price = result.components.price_anomaly;
  const mileage = result.components.mileage_anomaly;
  const specs = result.components.specification_anomaly;
  const format = (value, digits = 0) => new Intl.NumberFormat("ro-RO", { maximumFractionDigits: digits }).format(value);
  const lines = [
    `Grupul analizat: ${format(result.market_support.model_generation_observations)} anunțuri cu aceeași marcă și același model${vehicle.generation ? " și aceeași generație. Nu sunt incluse alte generații." : ", din toate generațiile, deoarece generația nu a fost specificată."}`,
  ];
  if (result.scoring_policy_version === "anomaly-risk-v2.8-extreme-override" && (price.flag || mileage.flag)) {
    lines.push("Scorul general este dat direct de cea mai puternică anomalie extremă de preț sau kilometraj, fără media ponderată sau ajustarea pentru raritate. Semnalul necesită minimum 25 de valori comparabile, un scor de minimum 80 și o abatere de peste 45% față de mediană.");
  }
  if (result.scoring_policy_version === "anomaly-risk-v2.9-median-override" && (price.flag || mileage.flag)) {
    const trigger = result.effective_weights?.mileage === 1 ? "kilometraj" : "preț";
    lines.push(`Abaterea de ${trigger} de peste 45% față de mediană, susținută de minimum 25 de valori comparabile, impune un scor general de cel puțin 80/100, fără media ponderată sau ajustarea pentru raritate. Scorul componentei nu trebuie să atingă 80 pentru activarea acestei reguli.`);
  }
  if (result.scoring_policy_version === "anomaly-risk-v2.10-gradual-override" && (price.flag || mileage.flag)) {
    const trigger = result.effective_weights?.mileage === 1 ? "kilometraj" : "preț";
    lines.push(`Abaterea de ${trigger} de peste 45% față de mediană, susținută de minimum 25 de valori comparabile, determină direct scorul general, fără media ponderată sau ajustarea pentru raritate. Scorul crește gradual de la 80 la pragul de 45% până la 100 pentru o abatere de 100% sau mai mare. Dacă ambele semnale se califică, se folosește scorul mai mare. Scorurile componentelor rămân calculate separat din percentile.`);
  }
  if (price.score != null) {
    lines.push(`Intervalul observat P10–P90 are o lățime de ${format(result.confidence.p10_p90_width)} € (${format(result.confidence.relative_interval_width * 100, 1)}% din mediană), pe baza a ${format(price.count)} anunțuri cu aceeași marcă și același model${vehicle.generation ? " și aceeași generație" : " din toate generațiile"}. Anul, kilometrajul și configurația nu filtrează acest grup.`);
  } else {
    lines.push(`Prețul nu a fost evaluat: ${format(price.count ?? 0)} anunțuri comparabile, față de minimum 10 necesare. ${vehicle.generation ? "Nu se folosesc alte generații sau modele." : "Comparația include toate generațiile aceluiași model."}`);
  }
  if (result.assessment_status === "very_rare") {
    lines.push("Există prea puține anunțuri în grupul selectat pentru un scor general.");
  } else if (result.assessment_status === "limited_support") {
    lines.push("Exemplele disponibile sunt limitate. Interpretează scorul în contextul încrederii afișate.");
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
    if (vehicle.mileage == null) {
      lines.push("Kilometrajul nu a fost introdus, deci nu a fost evaluat.");
    } else {
      lines.push(`Kilometraj: ${format(mileage.sample_size ?? 0)} anunțuri cu kilometraj disponibil în grupul selectat. Mediana necesită minimum 10, iar scorul minimum 20.${mileage.expected_median_mileage != null ? " Mediana este disponibilă, dar scorul nu." : ""}`);
    }
  } else {
    const mileageText = { unusually_low: "Kilometrajul este neobișnuit de mic", unusually_high: "Kilometrajul este neobișnuit de mare", normal: "Kilometrajul se află în intervalul observat" };
    lines.push(`${mileageText[mileage.direction]} față de ${format(mileage.sample_size)} anunțuri cu kilometraj disponibil în grupul selectat.${["model", "model_generation"].includes(mileage.comparison_level) ? " Anul de fabricație nu restrânge grupul." : ""}`);
  }
  lines.push("Configurație: fiecare câmp introdus necesită minimum 25 de valori disponibile în același grup. Valorile lipsă nu participă la calculul acelui câmp.");
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
  if (hasOverallScore(result) && result.market_support.rarity_penalty) {
    lines.push(`Scorul general include o ajustare de ${format(result.market_support.rarity_penalty, 1)} puncte pentru numărul redus de anunțuri din grupul selectat.`);
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
