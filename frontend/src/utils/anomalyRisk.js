const FIELD_LABEL_KEYS = {
  brand: "anomalyRiskResults.fields.brand",
  model: "anomalyRiskResults.fields.model",
  generation: "anomalyRiskResults.fields.generation",
  price: "anomalyRiskResults.fields.price",
  year: "anomalyRiskResults.fields.year",
  mileage: "anomalyRiskResults.fields.mileage",
  engine: "anomalyRiskResults.fields.engine",
  fuel_type: "anomalyRiskResults.fields.fuel",
  gearbox: "anomalyRiskResults.fields.gearbox",
  drivetrain: "anomalyRiskResults.fields.drivetrain",
  body_type: "anomalyRiskResults.fields.body",
};

export const FIELD_LABELS = FIELD_LABEL_KEYS;

export function getFieldLabel(t, field) {
  const key = FIELD_LABEL_KEYS[field];

  return key ? t(key) : field;
}

const NUMBER_FIELDS = new Set([
  "price",
  "year",
  "mileage",
  "engine",
]);

function normalizeVehicleName(value) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("ro");
}

export function resolveVehicleOption(options, query) {
  const search = normalizeVehicleName(query);

  if (!search) return null;

  const exact = options.find(
    (option) => normalizeVehicleName(option) === search
  );

  if (exact) return exact;

  if (search.length < 2) return null;

  const prefixes = options.filter((option) =>
    normalizeVehicleName(option).startsWith(search)
  );

  return prefixes.length === 1 ? prefixes[0] : null;
}

export function filterVehicleOptions(options, query) {
  const normalize = normalizeVehicleName;
  const search = normalize(query);

  if (!search) return options;

  const matches = options.filter((option) =>
    normalize(option).includes(search)
  );

  if (matches.length || search.length < 4) return matches;

  const maxDistance = search.length > 6 ? 2 : 1;

  const distance = (left, right) => {
    let previous = Array.from(
      { length: right.length + 1 },
      (_, index) => index
    );

    for (let i = 1; i <= left.length; i += 1) {
      const next = [i];

      for (let j = 1; j <= right.length; j += 1) {
        next[j] = Math.min(
          next[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] +
            (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }

      previous = next;
    }

    return previous[right.length];
  };

  return options.filter(
    (option) =>
      distance(normalize(option), search) <= maxDistance
  );
}

// Only fields accepted by AnomalyRiskRequest leave the form.
// Blank is not zero.
export function buildRiskPayload(form) {
  return Object.fromEntries(
    Object.keys(FIELD_LABEL_KEYS).map((key) => {
      const value = String(form[key] ?? "").trim();

      return [
        key,
        value === ""
          ? null
          : NUMBER_FIELDS.has(key)
            ? Number(value)
            : value,
      ];
    })
  );
}

export function hasOverallScore(result) {
  return (
    result.assessment_status !== "very_rare" &&
    result.anomaly_score != null
  );
}

export function usesCurrentRiskPolicy(result) {
  return [
    "anomaly-risk-v2.6-selected-group",
    "anomaly-risk-v2.7-extreme-signals",
    "anomaly-risk-v2.8-extreme-override",
    "anomaly-risk-v2.9-median-override",
    "anomaly-risk-v2.10-gradual-override",
  ].includes(result.scoring_policy_version) &&
    result.components.price_anomaly.source === "database";
}

export function extremeAnomalyMessage(flag, t) {
  const keys = {
    extreme_price_low:
      "anomalyRiskResults.extremeSignals.priceLow",

    extreme_price_high:
      "anomalyRiskResults.extremeSignals.priceHigh",

    extreme_mileage_low:
      "anomalyRiskResults.extremeSignals.mileageLow",

    extreme_mileage_high:
      "anomalyRiskResults.extremeSignals.mileageHigh",
  };

  const key = keys[flag];

  return key ? t(key) : null;
}

export function riskExplanationLines(result, vehicle, t) {
  const price = result.components.price_anomaly;
  const mileage = result.components.mileage_anomaly;
  const specs = result.components.specification_anomaly;

  const format = (value, digits = 0) =>
    new Intl.NumberFormat(undefined, {
      maximumFractionDigits: digits,
    }).format(value);

  const sameGroup = vehicle.generation
    ? t("anomalyRiskResults.explanations.sameModelGeneration")
    : t("anomalyRiskResults.explanations.allGenerations");

  const lines = [
    t("anomalyRiskResults.explanations.analyzedGroup", {
      count: format(
        result.market_support.model_generation_observations
      ),
      group: sameGroup,
    }),
  ];

  if (
    result.scoring_policy_version ===
      "anomaly-risk-v2.8-extreme-override" &&
    (price.flag || mileage.flag)
  ) {
    lines.push(
      t("anomalyRiskResults.explanations.extremeOverride")
    );
  }

  if (
    result.scoring_policy_version ===
      "anomaly-risk-v2.9-median-override" &&
    (price.flag || mileage.flag)
  ) {
    const trigger =
      result.effective_weights?.mileage === 1
        ? t("anomalyRiskResults.explanations.mileage")
        : t("anomalyRiskResults.explanations.price");

    lines.push(
      t("anomalyRiskResults.explanations.medianOverride", {
        trigger,
      })
    );
  }

  if (
    result.scoring_policy_version ===
      "anomaly-risk-v2.10-gradual-override" &&
    (price.flag || mileage.flag)
  ) {
    const trigger =
      result.effective_weights?.mileage === 1
        ? t("anomalyRiskResults.explanations.mileage")
        : t("anomalyRiskResults.explanations.price");

    lines.push(
      t("anomalyRiskResults.explanations.gradualOverride", {
        trigger,
      })
    );
  }

  if (price.score != null) {
    lines.push(
      t("anomalyRiskResults.explanations.priceRange", {
        width: format(result.confidence.p10_p90_width),
        percentage: format(
          result.confidence.relative_interval_width * 100,
          1
        ),
        count: format(price.count),
        group: sameGroup,
      })
    );
  } else {
    lines.push(
      t("anomalyRiskResults.explanations.priceNotEvaluated", {
        count: format(price.count ?? 0),
        group: vehicle.generation
          ? t("anomalyRiskResults.explanations.noOtherGenerations")
          : t("anomalyRiskResults.explanations.allGenerations"),
      })
    );
  }

  if (result.assessment_status === "very_rare") {
    lines.push(
      t("anomalyRiskResults.explanations.veryRare")
    );
  } else if (result.assessment_status === "limited_support") {
    lines.push(
      t("anomalyRiskResults.explanations.limitedSupport")
    );
  }

  const priceExplanation = {
    unusually_cheap: t(
      "anomalyRiskResults.explanations.priceCheap"
    ),

    unusually_expensive: t(
      "anomalyRiskResults.explanations.priceExpensive"
    ),

    normal:
      price.actual_price >= price.p25 &&
      price.actual_price <= price.p75
        ? t("anomalyRiskResults.explanations.priceCentral")
        : t("anomalyRiskResults.explanations.priceOutsideCentral"),
  };

  if (price.score != null) {
    lines.push(priceExplanation[price.direction]);
  }

  if (mileage.score == null) {
    if (vehicle.mileage == null) {
      lines.push(
        t("anomalyRiskResults.explanations.mileageMissing")
      );
    } else {
      lines.push(
        t("anomalyRiskResults.explanations.mileageNotScored", {
          count: format(mileage.sample_size ?? 0),
          medianAvailable:
            mileage.expected_median_mileage != null,
        })
      );
    }
  } else {
    const mileageText = {
      unusually_low: t(
        "anomalyRiskResults.explanations.mileageLow"
      ),

      unusually_high: t(
        "anomalyRiskResults.explanations.mileageHigh"
      ),

      normal: t(
        "anomalyRiskResults.explanations.mileageNormal"
      ),
    };

    lines.push(
      t("anomalyRiskResults.explanations.mileageResult", {
        description: mileageText[mileage.direction],
        count: format(mileage.sample_size),
        yearNotRestricting: [
          "model",
          "model_generation",
        ].includes(mileage.comparison_level),
      })
    );
  }

  lines.push(
    t("anomalyRiskResults.explanations.configuration")
  );

  const missing = Object.entries(FIELD_LABEL_KEYS)
    .filter(
      ([key]) =>
        key !== "price" &&
        vehicle[key] == null
    )
    .map(([key]) => getFieldLabel(t, key));

  if (missing.length) {
    lines.push(
      t("anomalyRiskResults.explanations.missingFields", {
        fields: missing.join(", "),
      })
    );
  }

  const severityExplanations = {
    unobserved: t(
      "anomalyRiskResults.explanations.severity.unobserved",
      {
        group: vehicle.generation
          ? t(
              "anomalyRiskResults.explanations.thisModelGeneration"
            )
          : t(
              "anomalyRiskResults.explanations.thisModel"
            ),
      }
    ),

    outside_observed_range: t(
      "anomalyRiskResults.explanations.severity.outsideRange",
      {
        group: vehicle.generation
          ? t(
              "anomalyRiskResults.explanations.thisGeneration"
            )
          : t(
              "anomalyRiskResults.explanations.thisModel"
            ),
      }
    ),

    uncommon: t(
      "anomalyRiskResults.explanations.severity.uncommon"
    ),

    very_rare: t(
      "anomalyRiskResults.explanations.severity.veryRare"
    ),
  };

  for (const signal of specs.signals) {
    if (
      signal.value != null &&
      severityExplanations[signal.severity]
    ) {
      lines.push(
        t("anomalyRiskResults.explanations.signal", {
          field: getFieldLabel(t, signal.field),
          value: signal.value,
          explanation:
            severityExplanations[signal.severity],
        })
      );
    }
  }

  if (
    hasOverallScore(result) &&
    result.market_support.rarity_penalty
  ) {
    lines.push(
      t("anomalyRiskResults.explanations.rarityAdjustment", {
        points: format(
          result.market_support.rarity_penalty,
          1
        ),
      })
    );
  }

  return lines;
}

export function riskErrorMessage(error, t) {
  if (error.name === "TimeoutError") {
    return t("anomalyRiskResults.errors.timeout");
  }

  if (error.status === 503) {
    return t("anomalyRiskResults.errors.unavailable");
  }

  if (error.status === 422) {
    const fields = [
      ...new Set(
        (Array.isArray(error.detail) ? error.detail : [])
          .map((item) => item.loc?.[1])
          .map((field) => getFieldLabel(t, field))
          .filter(Boolean)
      ),
    ];

    return fields.length
      ? t("anomalyRiskResults.errors.fields", {
          fields: fields.join(", "),
        })
      : t("anomalyRiskResults.errors.invalidData");
  }

  if (error instanceof TypeError) {
    return t("anomalyRiskResults.errors.connection");
  }

  return t("anomalyRiskResults.errors.generic");
}