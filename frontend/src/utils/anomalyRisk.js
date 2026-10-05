import { assessmentValidationMessage } from "./assessmentErrors.js";
import { assessmentNumber, translateAssessment } from "./assessmentI18n.js";

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
  return !["very_rare", "partial"].includes(result.assessment_status) && result.anomaly_score != null;
}

export function usesCurrentRiskPolicy(result) {
  return ["anomaly-risk-v2.6-selected-group", "anomaly-risk-v2.7-extreme-signals", "anomaly-risk-v2.8-extreme-override", "anomaly-risk-v2.9-median-override", "anomaly-risk-v2.10-gradual-override", "anomaly-risk-v2.12-unified-scores", "anomaly-risk-v2.13-adaptive-context", "anomaly-risk-v2.14-mileage-price-reduction", "anomaly-risk-v2.15-risk-bands", "anomaly-risk-v2.16-joint-contributions", "anomaly-risk-v2.17-smooth-extremes", "anomaly-risk-v2.18-young-mileage"].includes(result.scoring_policy_version)
    && result.components.price_anomaly.source === "database";
}


export function getFieldLabel(t, field) {
  const key = { fuel_type: "fuel", body_type: "body" }[field] ?? field;
  return FIELD_LABELS[field]
    ? translateAssessment(t, `anomalyRiskResults.fields.${key}`)
    : field;
}

export function extremeAnomalyMessage(flag, t) {
  const key = {
    extreme_price_low: "priceLow", extreme_price_high: "priceHigh",
    extreme_mileage_low: "mileageLow", extreme_mileage_high: "mileageHigh",
  }[flag];
  return key ? translateAssessment(t, `anomalyRiskResults.extremeSignals.${key}`) : null;
}

export function riskExplanationItems(result, vehicle, t) {
  const price = result.components.price_anomaly;
  const mileage = result.components.mileage_anomaly;
  const specs = result.components.specification_anomaly;
  const format = (value, digits = 0) => assessmentNumber(t, value, digits);
  const tr = (key, values) => translateAssessment(t, `anomalyRiskResults.explanations.${key}`, values);
  const lines = [];
  const add = (text, effect = null) => lines.push({ text, effect });
  add(tr("analyzedGroup", {
    count: format(result.market_support.model_generation_observations),
    group: tr(vehicle.generation ? "selectedGeneration" : "unspecifiedGeneration"),
  }), { metric: "Încredere", direction: result.market_support.model_generation_observations >= 16 ? "up" : "down" });
  const context = result.scoring_context;
  if (["anomaly-risk-v2.12-unified-scores", "anomaly-risk-v2.13-adaptive-context", "anomaly-risk-v2.14-mileage-price-reduction", "anomaly-risk-v2.15-risk-bands", "anomaly-risk-v2.16-joint-contributions", "anomaly-risk-v2.17-smooth-extremes", "anomaly-risk-v2.18-young-mileage"].includes(result.scoring_policy_version)) {
    if (context?.relation === "consistent_opposite" && (context.coherence_strength ?? 1) > 0) {
      const pairing = tr(context.price_ratio < 1 ? "cheaperHigher" : "dearerLower");
      const reduction = context.joint_reduction ?? 0;
      const netReduction = reduction - context.joint_penalty;
      add(tr(context.mode === "blended" ? "blendedPair" : reduction > 0 ? "reducedPair" : "balancedPair", {
        pairing, reduction: format(reduction, 1), penalty: format(context.joint_penalty, 1),
      }), { metric: "Anomalie", direction: context.mode === "blended" ? "down" : netReduction > 0 ? "down" : netReduction < 0 ? "up" : "neutral" });
    } else if (context?.relation === "inconsistent") {
      const pairing = context.price_ratio > 1 && context.mileage_ratio > 1
        ? "bothHigh"
        : context.price_ratio < 1 && context.mileage_ratio < 1 ? "bothLow" : "unbalanced";
      add(tr(pairing), { metric: "Anomalie", direction: "up" });
    }
    if (context?.mode === "blended") {
      add(tr("blended"), { metric: "Anomalie", direction: "up" });
    } else if (context?.mode === "extreme") {
      const names = Object.keys(context.override_scores);
      const includesSecondary = ["anomaly-risk-v2.16-joint-contributions", "anomaly-risk-v2.17-smooth-extremes", "anomaly-risk-v2.18-young-mileage"].includes(result.scoring_policy_version)
        && result.effective_weights?.price > 0 && result.effective_weights?.mileage > 0;
      add(includesSecondary && names.length === 1
        ? tr("secondary", { primary: tr(names[0] === "price" ? "price" : "mileage"), secondary: tr(names[0] === "price" ? "mileage" : "price") })
        : names.length === 2 ? tr("bothExtreme")
        : tr("oneExtreme", { trigger: tr(names[0] === "price" ? "price" : "mileage") }),
      { metric: "Anomalie", direction: "up" });
    }
  }
  if (result.scoring_policy_version === "anomaly-risk-v2.8-extreme-override" && (price.flag || mileage.flag)) {
    add(tr("extremeOverride"));
  }
  if (result.scoring_policy_version === "anomaly-risk-v2.9-median-override" && (price.flag || mileage.flag)) {
    add(tr("medianOverride", { trigger: tr(result.effective_weights?.mileage === 1 ? "mileage" : "price") }));
  }
  if (result.scoring_policy_version === "anomaly-risk-v2.10-gradual-override" && (price.flag || mileage.flag)) {
    add(tr("gradualOverride", { trigger: tr(result.effective_weights?.mileage === 1 ? "mileage" : "price") }));
  }
  if (price.score != null) {
    add(tr("priceRange", {
      width: format(result.confidence.p10_p90_width),
      percentage: format(result.confidence.relative_interval_width * 100, 1),
      count: format(price.count),
      group: translateAssessment(t, vehicle.generation ? "assessment.sameGeneration" : "assessment.allGenerations"),
    }));
  } else {
    add(tr("priceNotEvaluated", {
      count: format(price.count ?? 0),
      group: tr(vehicle.generation ? "noOtherGenerations" : "includeGenerations"),
    }));
  }
  if (result.assessment_status === "very_rare") {
    add(tr("veryRare"));
  } else if (result.assessment_status === "limited_support") {
    add(tr("limitedSupport"));
  }
  const centralPrice = price.direction === "normal" && price.actual_price >= price.p25 && price.actual_price <= price.p75;
  const smoothPolicy = ["anomaly-risk-v2.17-smooth-extremes", "anomaly-risk-v2.18-young-mileage"].includes(result.scoring_policy_version);
  const priceEscalating = smoothPolicy && context?.override_scores?.price != null;
  const mileageEscalating = smoothPolicy && context?.override_scores?.mileage != null;
  const priceExplanation = {
    unusually_cheap: tr("priceCheap"), unusually_expensive: tr("priceExpensive"),
    normal: tr(centralPrice ? "priceCentral" : "priceOutsideCentral"),
  };
  if (price.score != null) {
    const text = price.flag ? extremeAnomalyMessage(price.flag, t)
      : priceEscalating ? tr("priceEscalating") : priceExplanation[price.direction];
    add(text, { metric: "Anomalie", direction: !price.flag && !priceEscalating && centralPrice ? "down" : price.score > 0 ? "up" : "neutral" });
  }
  if (mileage.score == null) {
    if (vehicle.mileage == null) {
      add(tr("mileageMissing"));
    } else {
      add(tr("mileageNotScored", {
        count: format(mileage.sample_size ?? 0),
        medianAvailable: mileage.expected_median_mileage != null ? tr("medianAvailable") : "",
      }));
    }
  } else {
    const mileageText = { unusually_low: tr("mileageLow"), unusually_high: tr("mileageHigh"), normal: tr("mileageNormal") };
    const youngMileage = (mileage.age_adjustment_factor ?? 1) < 1;
    const text = youngMileage
      ? tr("youngMileage", { age: format(mileage.vehicle_age_years), years: tr(mileage.vehicle_age_years === 1 ? "year" : "years") })
      : mileage.flag ? tr("flaggedMileage", { message: extremeAnomalyMessage(mileage.flag, t) })
      : mileageEscalating ? tr("mileageEscalating")
      : tr("mileageCompared", { description: mileageText[mileage.direction] });
    add(tr("mileageResult", {
      description: text, count: format(mileage.sample_size),
      yearNotRestricting: ["model", "model_generation"].includes(mileage.comparison_level) ? tr("yearNotRestricting") : "",
    }), { metric: "Anomalie", direction: !mileage.flag && !mileageEscalating && mileage.direction === "normal" ? "down" : mileage.score > 0 ? "up" : "neutral" });
  }
  add(tr("configuration"));
  const missing = Object.keys(FIELD_LABELS).filter((key) => key !== "price" && vehicle[key] == null).map((key) => getFieldLabel(t, key));
  if (missing.length) add(tr("missingFields", { fields: missing.join(", ") }), { metric: "Încredere", direction: "down" });
  const severityExplanations = {
    unobserved: tr("severity.unobserved", { group: tr(vehicle.generation ? "thisModelGeneration" : "thisModel") }),
    outside_observed_range: tr("severity.outsideRange", { group: tr(vehicle.generation ? "thisGeneration" : "thisModel") }),
    uncommon: tr("severity.uncommon"), very_rare: tr("severity.veryRare"),
  };
  for (const signal of specs.signals) {
    if (signal.value != null && severityExplanations[signal.severity]) {
      add(tr("signal", {
        field: getFieldLabel(t, signal.field),
        value: translateVehicleValue(t, signal.field, signal.value),
        explanation: severityExplanations[signal.severity],
      }), { metric: "Anomalie", direction: "up" });
    }
  }
  if (hasOverallScore(result) && result.market_support.rarity_penalty) {
    add(tr("rarityAdjustment", { points: format(result.market_support.rarity_penalty, 1) }), { metric: "Anomalie", direction: "up" });
  }
  return lines;
}

export function translateVehicleValue(t, field, value) {
  if (!t || !["fuel_type", "gearbox", "drivetrain", "body_type"].includes(field)) return String(value);
  return t(`risk.options.${field}.${value}`, { defaultValue: String(value) });
}

export function riskExplanationLines(result, vehicle, t) {
  return riskExplanationItems(result, vehicle, t).map((item) => item.text);
}

export function riskErrorMessage(error, t) {
  const tr = (key, values) => translateAssessment(t, `anomalyRiskResults.errors.${key}`, values);
  if (error.name === "TimeoutError") return tr("timeout");
  if (error.status === 503) return tr("unavailable");
  if (error.status === 422) {
    const validationMessage = assessmentValidationMessage(error.detail, t);
    if (validationMessage) return validationMessage;
    const fields = [...new Set((Array.isArray(error.detail) ? error.detail : [])
      .map((item) => item.loc?.[1]).filter((field) => FIELD_LABELS[field]).map((field) => getFieldLabel(t, field)))];
    return fields.length ? tr("fields", { fields: fields.join(", ") }) : tr("invalidData");
  }
  if (error instanceof TypeError) return tr("connection");
  return tr("generic");
}
