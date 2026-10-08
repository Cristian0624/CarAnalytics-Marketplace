import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import "./ListingFilters.css";
import VehicleTree from "./VehicleTree";
import useListingYearRange from "../hooks/useListingYearRange";
import {
  listingFilterError,
  updateListingFilter
} from "../utils/listingFilters";

const FUEL_TYPES = [
  "Benzină",
  "Diesel",
  "Hybrid",
  "Electricitate",
  "Gaz / Benzină (propan)",
  "Gaz / Benzină (metan)",
  "Gaz",
  "Plug-in Hybrid (benzină)",
  "Plug-in Hybrid (diesel)",
  "Mild Hybrid (benzină)",
  "Mild Hybrid (diesel)"
];

const GEARBOXES = [
  "Mecanică",
  "Automată",
  "Robotizată",
  "Variator",
  "Automat-Tiptronic"
];

const BODY_TYPES = [
  "Sedan",
  "Hatchback",
  "Universal",
  "Combi",
  "SUV",
  "Crossover",
  "Coupe",
  "Cabriolet",
  "Roadster",
  "Minivan",
  "Microvan",
  "Microautobus",
  "Furgon",
  "Pickup",
  "Camionetă",
  "Platformă deschisă"
];

const STATES = ["Cu rulaj", "Uzat", "Necesită reparații"];

const DRIVETRAINS = ["4x2", "Din față", "Din spate", "4x4"];

const SELLER_TYPES = ["Persoană fizică", "Dealer auto"];

const REGISTRATION_COUNTRIES = ["Republica Moldova"];

const CAR_CLASSES = [
  "A-segment (Mini)",
  "B-segment (Supermini)",
  "C-segment (Compact)",
  "D-segment (Mid-size)",
  "E (Groot Midden)",
  "F (Groot)",
  "G (Sportief)",
  "H (Sport)",
  "I (Luxe)",
  "J (Lower-Mpv)",
  "K (Upper-Mpv)",
  "L (Lower-Suv)",
  "M (Upper-Suv)",
  "N (Bestelauto)"
];

const DROPS = [
  { key: "fuel_type", titleKey: "fuel", options: FUEL_TYPES },
  { key: "body_types", titleKey: "body", options: BODY_TYPES },
  { key: "gearbox", titleKey: "gearbox", options: GEARBOXES }
];

const fmt = (n) => Number(n).toLocaleString("ro-RO");

/* Dual-thumb slider. Values are stored as strings; "" means "no limit". */
function RangeSlider({
  min,
  max,
  step,
  minValue,
  maxValue,
  onChange,
  unit = "",
  label,
  present = true
}) {
  const { t } = useTranslation();

  const isYear = label === t("listing-Filters.year");
  const formatValue = isYear ? String : fmt;

  const lo =
    minValue === "" || minValue == null
      ? min
      : Math.max(min, Number(minValue));

  const hi =
    maxValue === "" || maxValue == null
      ? max
      : Math.min(max, Number(maxValue));

  const pct = (v) => max === min ? 0 : ((v - min) / (max - min)) * 100;

  const commit = (a, b) =>
    onChange(
      a <= min ? "" : String(a),
      b >= max ? "" : String(b)
    );

  return (
    <div className="rs">
      <div className="rs-values">
        <span>
          {formatValue(lo)} {unit}
        </span>

        <span>
          {hi >= max && isYear && present
            ? t("listing-Filters.present")
            : `${formatValue(hi)}${hi >= max && !isYear ? "+" : ""}`}
          {unit && ` ${unit}`}
        </span>
      </div>

      <div className="rs-track">
        <div
          className="rs-fill"
          style={{
            left: `${pct(lo)}%`,
            right: `${max === min ? 0 : 100 - pct(hi)}%`
          }}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={lo}
          disabled={max <= min}
          aria-label={t("listing-Filters.minimum", { label })}
          onChange={(e) =>
            commit(
              Math.min(Number(e.target.value), hi - step),
              hi
            )
          }
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={hi}
          disabled={max <= min}
          aria-label={t("listing-Filters.maximum", { label })}
          onChange={(e) =>
            commit(
              lo,
              Math.max(Number(e.target.value), lo + step)
            )
          }
        />
      </div>
    </div>
  );
}

function RangeInput({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  step = "1"
}) {
  const { t } = useTranslation();

  const set = (fn) => (e) =>
    fn(e.target.value === "" ? null : e.target.value);

  return (
    <div className="range-inputs">
      <input
        type="number"
        min="0"
        step={step}
        value={minValue ?? ""}
        onChange={set(onMinChange)}
        placeholder={t("listing-Filters.min")}
      />

      <span>–</span>

      <input
        type="number"
        min="0"
        step={step}
        value={maxValue ?? ""}
        onChange={set(onMaxChange)}
        placeholder={t("listing-Filters.max")}
      />
    </div>
  );
}

function Chips({ options, selected = [], onChange, disabled }) {
  const toggle = (o) =>
    onChange(
      selected.includes(o)
        ? selected.filter((x) => x !== o)
        : [...selected, o]
    );

  return (
    <div className="chips">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          disabled={disabled}
          aria-pressed={selected.includes(o)}
          className={`chip ${selected.includes(o) ? "on" : ""}`}
          onClick={() => toggle(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Group({ title, children, hint }) {
  return (
    <div className="filter-group">
      <label>{title}</label>
      {children}
      {hint && (
        <small className="filter-disabled-hint">
          {hint}
        </small>
      )}
    </div>
  );
}

const ARRAY_FIELDS = [
  "fuel_type",
  "gearbox",
  "body_types",
  "state",
  "drivetrains",
  "seller_type",
  "registration_country",
  "class"
];

const RANGES = [
  { min: "price_min", max: "price_max", labelKey: "price", unit: "€" },
  { min: "mileage_min", max: "mileage_max", labelKey: "mileage", unit: "km" },
  { min: "year_min", max: "year_max", labelKey: "year", unit: "" },
  { min: "engine_min", max: "engine_max", labelKey: "engine", unit: "L" },
  {
    min: "horsepower_min",
    max: "horsepower_max",
    labelKey: "horsepower",
    unit: "CP"
  },
  { min: "doors_min", max: "doors_max", labelKey: "doors", unit: "" },
  { min: "seats_min", max: "seats_max", labelKey: "seats", unit: "" },
  { min: "score_min", max: "score_max", labelKey: "score", unit: "" }
];

export default function ListingFilters({
  filters,
  setFilters,
  onSearch,
  onReset,
  loading,
  actions,
  initiallyOpen = false,
  barExtras = null,
  resultCount = null,
  countLoading = false,
  sortingActive = false
}) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(initiallyOpen);
  const [more, setMore] = useState(false);
  const [drop, setDrop] = useState(null);
  const yearRange = useListingYearRange(filters);

  const update = (field, value) =>
    setFilters((current) => updateListingFilter(current, field, value));

  const filterError = listingFilterError(filters, t);

  const hasClasses = Boolean(filters.class?.length);

  const classDisabled =
    Boolean(filters.modelText?.trim()) && !hasClasses;

  useEffect(() => {
    if (!open) return;

    const onKey = (e) =>
      e.key === "Escape" && setOpen(false);

    const prev = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function clearFields(changes) {
    const next = Object.entries(changes).reduce(
      (current, [field, value]) => updateListingFilter(current, field, value), filters
    );
    setFilters(next);
    onSearch?.(next);
  }

  const pills = [];

  const vehicle = [
    filters.brandText,
    filters.modelText,
    filters.generationText
  ].filter(Boolean);

  if (vehicle.length) {
    pills.push({
      label: vehicle.join(" › "),
      onRemove: () =>
        clearFields({
          brandText: "",
          modelText: "",
          generationText: ""
        })
    });
  }

  ARRAY_FIELDS.forEach((f) =>
    (filters[f] ?? []).forEach((val) =>
      pills.push({
        label: val,
        onRemove: () =>
          clearFields({
            [f]: filters[f].filter((x) => x !== val)
          })
      })
    )
  );

  RANGES.forEach((r) => {
    if (filters[r.min] || filters[r.max]) {
      const maxLabel =
        filters[r.max] ||
        (r.labelKey === "year"
          ? t("listing-Filters.present")
          : t("listing-Filters.noLimit"));

      pills.push({
        label: `${t(`listing-Filters.${r.labelKey}`)}: ${
          filters[r.min] || 0
        }–${maxLabel}${r.unit ? ` ${r.unit}` : ""}`,
        onRemove: () =>
          clearFields({
            [r.min]: "",
            [r.max]: ""
          })
      });
    }
  });

  const hasActiveFilters =
    pills.length > 0 || sortingActive;

  const slider = (
    title,
    r,
    min,
    max,
    step,
    unit,
    present = true
  ) => (
    <Group title={title}>
      <RangeSlider
        label={title}
        min={min}
        max={max}
        step={step}
        unit={unit}
        present={present}
        minValue={filters[r.min]}
        maxValue={filters[r.max]}
        onChange={(a, b) => {
          update(r.min, a);
          update(r.max, b);
        }}
      />
    </Group>
  );

  const range = (title, r, step) => (
    <Group title={title}>
      <RangeInput
        step={step}
        minValue={filters[r.min]}
        maxValue={filters[r.max]}
        onMinChange={(v) => update(r.min, v)}
        onMaxChange={(v) => update(r.max, v)}
      />
    </Group>
  );

  const R = Object.fromEntries(
    RANGES.map((r) => [
      r.min.replace("_min", ""),
      r
    ])
  );

  const countText = countLoading
    ? t("listing-Filters.counting")
    : t("listing-Filters.listingsCount", {
        count: fmt(resultCount ?? 0)
      });

  function apply() {
    onSearch?.();
    setOpen(false);
  }

  return (
    <section className="listing-filters">
      <div className="lf-bar">
        <button
          type="button"
          className={`lf-toggle ${open ? "open" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {t("listing-Filters.advanced")}

          {pills.length > 0 && (
            <span className="lf-badge">
              {pills.length}
            </span>
          )}

          <span
            className="lf-arrow"
            aria-hidden="true"
          >
            ▾
          </span>
        </button>

        {barExtras}

        <div className="lf-pills">
          {pills.map((p, i) => (
            <span
              key={i}
              className="filter-pill"
            >
              {p.label}

              <button
                type="button"
                aria-label={t("listing-Filters.remove", {
                  value: p.label
                })}
                onClick={p.onRemove}
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            className="lf-link"
            onClick={onReset}
          >
            {t("listing-Filters.clearAll")}
          </button>
        )}
      </div>

      {open &&
        createPortal(
          <div
            className="lf-overlay"
            onClick={() => setOpen(false)}
          >
            <div
              className="lf-panel"
              role="dialog"
              aria-label={t("listing-Filters.dialogLabel")}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="lf-body">
                <aside className="lf-tree">
                  <h3>
                    {t("listing-Filters.brand")}
                  </h3>

                  <VehicleTree
                    filters={filters}
                    update={update}
                    lockModels={hasClasses}
                  />
                </aside>

                <div className="lf-main">
                  <div className="filter-grid lf-single">
                    {slider(
                      t("listing-Filters.price"),
                      R.price,
                      0,
                      100000,
                      500,
                      "€"
                    )}

                    {slider(
                      t("listing-Filters.year"),
                      R.year,
                      Math.min(yearRange.year_min, Number(filters.year_min) || yearRange.year_min),
                      Math.max(yearRange.year_max, Number(filters.year_max) || yearRange.year_max),
                      1,
                      "",
                      yearRange.present
                    )}

                    {slider(
                      t("listing-Filters.mileage"),
                      R.mileage,
                      0,
                      500000,
                      5000,
                      "km"
                    )}
                  </div>

                  <div className="lf-drops">
                    {DROPS.map((d) => {
                      const selected =
                        filters[d.key] ?? [];

                      const isOpen =
                        drop === d.key;

                      return (
                        <div
                          key={d.key}
                          className="lf-drop-wrapper"
                        >
                          <button
                            type="button"
                            className={`lf-drop ${
                              isOpen ? "open" : ""
                            }`}
                            aria-expanded={isOpen}
                            onClick={() =>
                              setDrop(
                                isOpen
                                  ? null
                                  : d.key
                              )
                            }
                          >
                            <span
                              className={
                                selected.length
                                  ? "selected-value"
                                  : ""
                              }
                            >
                              {selected.length === 0
                                ? t(
                                    `listing-Filters.${d.titleKey}`
                                  )
                                : selected[0]}
                            </span>

                            <span
                              className={`lf-arrow ${
                                isOpen ? "up" : ""
                              }`}
                            >
                              ▾
                            </span>
                          </button>

                          {isOpen && (
                            <div className="lf-drop-panel">
                              {d.options.map(
                                (option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    className={`lf-option ${
                                      selected.includes(
                                        option
                                      )
                                        ? "selected"
                                        : ""
                                    }`}
                                    onClick={() => {
                                      update(
                                        d.key,
                                        selected.includes(
                                          option
                                        )
                                          ? []
                                          : [option]
                                      );

                                      setDrop(null);
                                    }}
                                  >
                                    {option}
                                  </button>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="lf-more"
                    aria-expanded={more}
                    onClick={() =>
                      setMore((v) => !v)
                    }
                  >
                    {more
                      ? t("listing-Filters.fewerFilters")
                      : t("listing-Filters.moreFilters")}

                    <span
                      className={`lf-arrow ${
                        more ? "up" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>

                  {more && (
                    <div className="filter-grid">
                      <Group
                        title={t(
                          "listing-Filters.drivetrain"
                        )}
                      >
                        <Chips
                          options={DRIVETRAINS}
                          selected={
                            filters.drivetrains
                          }
                          onChange={(v) =>
                            update(
                              "drivetrains",
                              v
                            )
                          }
                        />
                      </Group>

                      <Group
                        title={t(
                          "listing-Filters.state"
                        )}
                      >
                        <Chips
                          options={STATES}
                          selected={filters.state}
                          onChange={(v) =>
                            update("state", v)
                          }
                        />
                      </Group>

                      <Group
                        title={t(
                          "listing-Filters.seller"
                        )}
                      >
                        <Chips
                          options={SELLER_TYPES}
                          selected={
                            filters.seller_type
                          }
                          onChange={(v) =>
                            update(
                              "seller_type",
                              v
                            )
                          }
                        />
                      </Group>

                      <Group
                        title={t(
                          "listing-Filters.registrationCountry"
                        )}
                      >
                        <Chips
                          options={
                            REGISTRATION_COUNTRIES
                          }
                          selected={
                            filters.registration_country
                          }
                          onChange={(v) =>
                            update(
                              "registration_country",
                              v
                            )
                          }
                        />
                      </Group>

                      <Group
                        title={t(
                          "listing-Filters.carClass"
                        )}
                        hint={
                          classDisabled
                            ? t(
                                "listing-Filters.classDisabledHint"
                              )
                            : null
                        }
                      >
                        <Chips
                          options={CAR_CLASSES}
                          disabled={classDisabled}
                          selected={
                            filters.class
                          }
                          onChange={(v) =>
                            update("class", v)
                          }
                        />
                      </Group>

                      {range(
                        t("listing-Filters.engine"),
                        R.engine,
                        "0.1"
                      )}

                      {range(
                        t("listing-Filters.horsepower"),
                        R.horsepower
                      )}

                      {range(
                        t("listing-Filters.doors"),
                        R.doors
                      )}

                      {range(
                        t("listing-Filters.seats"),
                        R.seats
                      )}

                      {range(
                        t("listing-Filters.score"),
                        R.score,
                        "0.1"
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="lf-footer">
                <div className="lf-footer-left">
                  <button
                    type="button"
                    className="lf-reset"
                    onClick={onReset}
                  >
                    <span aria-hidden="true">
                      ↺
                    </span>

                    {t("listing-Filters.reset")}
                  </button>

                  {pills.length > 0 && (
                    <div className="lf-footer-pills">
                      {pills.map((p, i) => (
                        <span
                          key={i}
                          className="lf-footer-pill"
                        >
                          <span>
                            {p.label}
                          </span>

                          <button
                            type="button"
                            aria-label={t(
                              "listing-Filters.remove",
                              {
                                value: p.label
                              }
                            )}
                            onClick={p.onRemove}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {filterError && (
                  <p
                    className="filter-validation-error"
                    role="alert"
                  >
                    {filterError}
                  </p>
                )}

                <div className="lf-footer-actions">
                  <div
                    className={`lf-actions-extra ${
                      hasActiveFilters
                        ? "visible"
                        : ""
                    }`}
                  >
                    {actions}
                  </div>

                  <button
                    type="button"
                    className="apply-filters-button"
                    onClick={apply}
                    disabled={
                      loading ||
                      Boolean(filterError)
                    }
                  >
                    {countText}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </section>
  );
}
