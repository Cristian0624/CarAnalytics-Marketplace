export function comparisonKey(car) {
  return car?.id == null ? null : String(car.id);
}

export function uniqueComparisonCars(cars) {
  if (!Array.isArray(cars)) return [];
  const seen = new Set();
  return cars.filter(car => {
    const key = comparisonKey(car);
    if (key === null || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function addComparisonCar(cars, car) {
  return uniqueComparisonCars([...cars, car]);
}

export function comparisonColumnWidths(availableWidth, carCount) {
  const labelWidth = availableWidth <= 480 ? 140 : 200;
  const minimumCarWidth = availableWidth <= 480 ? 180 : 220;
  // Reserve the wrapper borders so a full row does not overflow by a pixel.
  const remainingWidth = Math.max(1, availableWidth - labelWidth - 2);
  const capacity = Math.max(1, Math.floor(remainingWidth / minimumCarWidth));
  const visibleCount = Math.max(1, Math.min(carCount, capacity));
  const carWidth = Math.min(280, Math.floor(remainingWidth / visibleCount));
  return { labelWidth, carWidth };
}

export function translateComparisonValue(t, field, value) {
  if (value === null || value === undefined || value === "") return "—";
  const text = String(value).trim();
  if (field === "generation") {
    return text.replace(/\bprezent\b/gi, t("comparatorPage.present"));
  }
  const sharedFields = ["fuel_type", "gearbox", "drivetrain", "body_type"];
  const prefix = sharedFields.includes(field) ? "risk.options" : "comparatorPage.values";
  return t(`${prefix}.${field}.${text}`, { defaultValue: text });
}
