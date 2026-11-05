import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import "./ListingFilters.css";
import VehicleTree from "./VehicleTree";
import useListingYearRange from "../hooks/useListingYearRange";
import { prefetchListingOptions } from "../api/listings";
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
  { key: "fuel_type", titleKey: "fuel", options: FUEL_TYPES, iconType: "fuel" },
  { key: "body_types", titleKey: "body", options: BODY_TYPES, iconType: "body" },
  { key: "gearbox", titleKey: "gearbox", options: GEARBOXES, iconType: "gearbox" }
];

const MORE_DROPS = [
  { key: "drivetrains", titleKey: "drivetrain", options: DRIVETRAINS, iconType: "drivetrain" },
  { key: "state", titleKey: "state", options: STATES, iconType: "state" },
  { key: "seller_type", titleKey: "seller", options: SELLER_TYPES, iconType: "seller" },
  { key: "class", titleKey: "carClass", options: CAR_CLASSES, iconType: "carClass" }
];

function DropIcon({ type }) {
  if (type === "fuel") {
    return (
      <svg className="lf-drop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17"/>
        <path d="M13 10h4a2 2 0 0 1 2 2v4a3 3 0 0 0 3 3v-7l-3-3"/>
        <circle cx="7.5" cy="8.5" r="1.5"/>
      </svg>
    );
  }
  if (type === "body") {
    return (
      <svg className="lf-drop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/>
        <circle cx="17" cy="17" r="2"/>
      </svg>
    );
  }
  if (type === "gearbox") {
    return (
      <svg className="lf-drop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    );
  }
  if (type === "drivetrain") {
    return (
      <svg className="lf-drop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="6" r="2"/>
        <circle cx="17" cy="6" r="2"/>
        <circle cx="7" cy="18" r="2"/>
        <circle cx="17" cy="18" r="2"/>
        <line x1="9" y1="6" x2="15" y2="6"/>
        <line x1="9" y1="18" x2="15" y2="18"/>
        <line x1="12" y1="6" x2="12" y2="18"/>
      </svg>
    );
  }
  if (type === "state") {
    return (
      <svg className="lf-drop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    );
  }
  if (type === "seller") {
    return (
      <svg className="lf-drop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    );
  }
  if (type === "carClass") {
    return (
      <svg className="lf-drop-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    );
  }
  return null;
}

const fmt = (n) => Number(n).toLocaleString("ro-RO");

/* Dual-thumb slider with quick presets and responsive values */
function RangeSlider({
  min,
  max,
  step,
  minValue,
  maxValue,
  onChange,
  unit = "",
  label,
  present = true,
  presets = []
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

      {presets.length > 0 && (
        <div className="rs-presets">
          {presets.map((p, idx) => {
            const isMatch =
              (p.min === "" ? (minValue === "" || minValue == null) : String(minValue) === String(p.min)) &&
              (p.max === "" ? (maxValue === "" || maxValue == null) : String(maxValue) === String(p.max));
            return (
              <button
                key={idx}
                type="button"
                className={`rs-preset-chip ${isMatch ? "active" : ""}`}
                onClick={() => commit(p.min === "" ? min : Number(p.min), p.max === "" ? max : Number(p.max))}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RangeInput({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  step = "1",
  min = 0,
  max
}) {
  const { t } = useTranslation();

  const set = (fn) => (e) => {
    const raw = e.target.value;
    if (raw === "") {
      fn("");
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    if (num < 0) {
      fn(String(min ?? 0));
      return;
    }
    if (max !== undefined && num > Number(max)) {
      fn(String(max));
      return;
    }
    fn(raw);
  };

  const clampMin = (fn, val) => () => {
    if (val === "" || val == null || min === undefined) return;
    const num = Number(val);
    if (!Number.isNaN(num) && num < Number(min)) {
      fn(String(min));
    }
  };

  return (
    <div className="range-inputs">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={minValue ?? ""}
        onChange={set(onMinChange)}
        onBlur={clampMin(onMinChange, minValue)}
        placeholder={t("listing-Filters.min")}
      />

      <span>–</span>

      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={maxValue ?? ""}
        onChange={set(onMaxChange)}
        onBlur={clampMin(onMaxChange, maxValue)}
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

function Group({ title, children, hint, badge, headerRight }) {
  return (
    <div className="filter-group">
      <div className="filter-group-header">
        <div className="filter-group-title-wrap">
          <label>{title}</label>
          {badge && <span className="filter-group-badge">{badge}</span>}
        </div>
        {headerRight && <div className="filter-group-right">{headerRight}</div>}
      </div>
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
  title = null,
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
  sortingActive = false,
  floating = false,
  floatingCompare = null
}) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(initiallyOpen);
  const [more, setMore] = useState(false);
  const [drop, setDrop] = useState(null);
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const inlineRef = useRef(null);
  const exitTimerRef = useRef(null);
  const yearRange = useListingYearRange(filters);

  useEffect(() => {
    prefetchListingOptions();
  }, []);

  useEffect(() => {
    if (!drop) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest(".lf-drop-wrapper")) {
        setDrop(null);
      }
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [drop]);

  useEffect(() => {
    if (!floating) return;

    const el = inlineRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsPoppedOut((currentPopped) => {
            if (currentPopped) {
              setIsExiting(true);
              clearTimeout(exitTimerRef.current);
              exitTimerRef.current = setTimeout(() => {
                setIsPoppedOut(false);
                setIsExiting(false);
              }, 220);
              return true;
            }
            return false;
          });
        } else {
          if (entry.boundingClientRect.top < 0) {
            clearTimeout(exitTimerRef.current);
            setIsExiting(false);
            setIsPoppedOut(true);
          } else {
            clearTimeout(exitTimerRef.current);
            setIsExiting(false);
            setIsPoppedOut(false);
          }
        }
      },
      {
        threshold: 0,
        rootMargin: "0px"
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      clearTimeout(exitTimerRef.current);
    };
  }, [floating]);

  // Local draft: rapid input (sliders, typing) only re-renders this panel.
  // The parent (page + results grid) syncs on a debounce, and searches commit.
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => setFilters(draft), 350);
    return () => clearTimeout(timer);
  }, [draft, setFilters]);

  const update = (field, value) =>
    setDraft((c) => updateListingFilter(c, field, value));

  const filterError = listingFilterError(draft, t);

  const hasClasses = Boolean(draft.class?.length);

  const classDisabled =
    Boolean(draft.modelText?.trim()) && !hasClasses;

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
    const next = { ...draft, ...changes };
    setDraft(next);
    onSearch?.(next);
  }

  const pills = [];

  const vehicle = [
    draft.brandText,
    draft.modelText,
    draft.generationText
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
    (draft[f] ?? []).forEach((val) =>
      pills.push({
        label: val,
        onRemove: () =>
          clearFields({
            [f]: draft[f].filter((x) => x !== val)
          })
      })
    )
  );

  RANGES.forEach((r) => {
    if (draft[r.min] || draft[r.max]) {
      const maxLabel =
        draft[r.max] ||
        (r.labelKey === "year"
          ? t("listing-Filters.present")
          : t("listing-Filters.noLimit"));

      pills.push({
        label: `${t(`listing-Filters.${r.labelKey}`)}: ${
          draft[r.min] || 0
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
    present = true,
    presets = []
  ) => {
    const lo = draft[r.min] ? Number(draft[r.min]) : min;
    const hi = draft[r.max] ? Number(draft[r.max]) : max;
    const isCustom = Boolean(draft[r.min] || draft[r.max]);
    const isYear = r.min === "year_min";
    const formatValue = isYear ? String : fmt;

    const loText = `${formatValue(lo)}${unit ? " " + unit : ""}`;
    const hiText =
      hi >= max && isYear && present
        ? t("listing-Filters.present")
        : `${formatValue(hi)}${hi >= max && !isYear ? "+" : ""}${unit ? " " + unit : ""}`;

    const rangeDisplay = (
      <span className={`rs-header-val ${isCustom ? "is-filtered" : ""}`}>
        {loText} – {hiText}
      </span>
    );

    return (
      <Group title={title} headerRight={rangeDisplay}>
        <RangeSlider
          label={title}
          min={min}
          max={max}
          step={step}
          unit={unit}
          minValue={draft[r.min]}
          maxValue={draft[r.max]}
          presets={presets}
          onChange={(a, b) => {
            update(r.min, a);
            update(r.max, b);
          }}
        />
      </Group>
    );
  };

  const range = (title, r, step = "1", min = 0, max = undefined) => (
    <Group title={title}>
      <RangeInput
        step={step}
        min={min}
        max={max}
        minValue={draft[r.min]}
        maxValue={draft[r.max]}
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
    onSearch?.(draft);
    setOpen(false);
  }

  return (
    <section className={`listing-filters ${floating ? "is-floating" : ""}`}>
      {floating ? (
        <>
          <div className="lf-actions-wrapper" ref={inlineRef}>
            <div
              className={`lf-actions-container ${
                isPoppedOut ? "is-floating" : "is-inline"
              } ${isPoppedOut ? (isExiting ? "is-exiting" : "is-entering") : ""}`}
            >
              <button
                type="button"
                className={`lf-toggle lf-filter-toggle lf-floating-btn ${open ? "open" : ""}`}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                title={t("listing-Filters.advanced")}
              >
                <img
                  src="/filter_button.png"
                  alt=""
                  className="lf-button-icon"
                />
                <span className="lf-btn-text">{t("listing-Filters.advanced")}</span>

                {pills.length > 0 && (
                  <span className="lf-badge">
                    {pills.length}
                  </span>
                )}
              </button>

              {barExtras}

              {floatingCompare}
            </div>
          </div>

          {pills.length > 0 && (
            <div className="lf-active-pills-bar">
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
          )}
        </>
      ) : title ? (
        <div className="marketplace-head">
          <div className="marketplace-head-left">
            <h1 className="marketplace-head-title">{title}</h1>
          </div>

          <div className="marketplace-head-right">
            {barExtras}

            <button
              type="button"
              className={`lf-toggle lf-filter-toggle ${open ? "open" : ""}`}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              title={t("listing-Filters.advanced")}
            >
              <img
                src="/filter_button.png"
                alt=""
                className="lf-button-icon"
              />
              <span className="lf-btn-text">{t("listing-Filters.advanced")}</span>

              {pills.length > 0 && (
                <span className="lf-badge">
                  {pills.length}
                </span>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="lf-bar">
          <button
            type="button"
            className={`lf-toggle lf-filter-toggle ${open ? "open" : ""}`}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            title={t("listing-Filters.advanced")}
          >
            <img
              src="/filter_button.png"
              alt=""
              className="lf-button-icon"
            />
            <span className="lf-btn-text">{t("listing-Filters.advanced")}</span>

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
      )}

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
              <header className="lf-header">
                <div className="lf-header-left">
                  <div className="lf-header-icon-wrap">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                  </div>
                  <div className="lf-header-text">
                    <h2>{t("listing-Filters.dialogLabel") || t("listing-Filters.advanced")}</h2>
                  </div>
                  {pills.length > 0 && (
                    <span className="lf-header-badge">
                      {pills.length} {pills.length === 1 ? "filtru activ" : "filtre active"}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className="lf-close-btn"
                  onClick={() => setOpen(false)}
                  aria-label={t("common.close") || "Închide"}
                  title={t("common.close") || "Închide"}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </header>

              <div className="lf-body">
                <aside className="lf-tree">
                  <div className="lf-tree-header">
                    <div className="lf-tree-title">
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="9"/>
                        <circle cx="12" cy="12" r="3"/>
                        <line x1="12" y1="3" x2="12" y2="9"/>
                        <line x1="12" y1="15" x2="12" y2="21"/>
                        <line x1="3" y1="12" x2="9" y2="12"/>
                        <line x1="15" y1="12" x2="21" y2="12"/>
                      </svg>
                      <span>{t("listing-Filters.brand")}</span>
                    </div>
                    {vehicle.length > 0 && (
                      <span className="lf-tree-count-badge">
                        {vehicle.length}
                      </span>
                    )}
                  </div>

                  <VehicleTree
                    filters={draft}
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
                      "€",
                      true,
                      [
                        { label: "< 10.000 €", min: "", max: "10000" },
                        { label: "10k – 25k €", min: "10000", max: "25000" },
                        { label: "25k – 50k €", min: "25000", max: "50000" },
                        { label: "50.000+ €", min: "50000", max: "" }
                      ]
                    )}

                    {slider(
                      t("listing-Filters.year"),
                      R.year,
                      Math.min(yearRange.year_min, Number(filters.year_min) || yearRange.year_min),
                      Math.max(yearRange.year_max, Number(filters.year_max) || yearRange.year_max),
                      1,
                      "",
                      yearRange.present,
                      [
                        { label: "2015+", min: "2015", max: "" },
                        { label: "2018+", min: "2018", max: "" },
                        { label: "2020+", min: "2020", max: "" },
                        { label: "2022+", min: "2022", max: "" }
                      ]
                    )}

                    {slider(
                      t("listing-Filters.mileage"),
                      R.mileage,
                      0,
                      500000,
                      5000,
                      "km",
                      true,
                      [
                        { label: "< 50.000 km", min: "", max: "50000" },
                        { label: "< 100.000 km", min: "", max: "100000" },
                        { label: "< 150.000 km", min: "", max: "150000" },
                        { label: "< 200.000 km", min: "", max: "200000" }
                      ]
                    )}
                  </div>

                  <div className="lf-drops">
                    {DROPS.map((d) => {
                      const selected =
                        draft[d.key] ?? [];

                      const isOpen =
                        drop === d.key;

                      return (
                        <div
                          key={d.key}
                          className={`lf-drop-wrapper ${isOpen ? "is-open" : ""}`}
                        >
                          <button
                            type="button"
                            className={`lf-drop ${
                              isOpen ? "open" : ""
                            } ${selected.length ? "has-value" : ""}`}
                            aria-expanded={isOpen}
                            onClick={() =>
                              setDrop(
                                isOpen
                                  ? null
                                  : d.key
                              )
                            }
                          >
                            <div className="lf-drop-label-wrap">
                              <DropIcon type={d.iconType} />
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
                            </div>

                            <div className="lf-drop-end">
                              {selected.length > 1 && (
                                <span className="lf-drop-badge">+{selected.length - 1}</span>
                              )}
                              <span
                                className={`lf-arrow ${
                                  isOpen ? "up" : ""
                                }`}
                              >
                                ▾
                              </span>
                            </div>
                          </button>

                          {isOpen && (
                            <div className="lf-drop-panel">
                              {d.options.map(
                                (option) => {
                                  const isSelected = selected.includes(option);
                                  return (
                                    <button
                                      key={option}
                                      type="button"
                                      className={`lf-option ${
                                        isSelected ? "selected" : ""
                                      }`}
                                      onClick={() => {
                                        update(
                                          d.key,
                                          isSelected ? [] : [option]
                                        );
                                        setDrop(null);
                                      }}
                                    >
                                      <span>{option}</span>
                                      {isSelected && (
                                        <svg className="lf-option-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="20 6 9 17 4 12"/>
                                        </svg>
                                      )}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="lf-more-wrapper">
                    <button
                      type="button"
                      className={`lf-more-btn ${more ? "is-active" : ""}`}
                      aria-expanded={more}
                      onClick={() =>
                        setMore((v) => !v)
                      }
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <line x1="4" y1="21" x2="4" y2="14"/>
                        <line x1="4" y1="10" x2="4" y2="3"/>
                        <line x1="12" y1="21" x2="12" y2="12"/>
                        <line x1="12" y1="8" x2="12" y2="3"/>
                        <line x1="20" y1="21" x2="20" y2="16"/>
                        <line x1="20" y1="12" x2="20" y2="3"/>
                        <line x1="1" y1="14" x2="7" y2="14"/>
                        <line x1="9" y1="8" x2="15" y2="8"/>
                        <line x1="17" y1="16" x2="23" y2="16"/>
                      </svg>
                      <span>
                        {more
                          ? t("listing-Filters.fewerFilters")
                          : t("listing-Filters.moreFilters")}
                      </span>
                      <span
                        className={`lf-arrow ${
                          more ? "up" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>
                  </div>

                  {more && (
                    <>
                      <div className="lf-drops lf-drops-more">
                        {MORE_DROPS.map((d) => {
                          const selected = draft[d.key] ?? [];
                          const isOpen = drop === d.key;
                          const isDisabled = d.key === "class" && classDisabled;

                          return (
                            <div
                              key={d.key}
                              className={`lf-drop-wrapper ${isOpen ? "is-open" : ""}`}
                            >
                              <button
                                type="button"
                                disabled={isDisabled}
                                title={
                                  isDisabled
                                    ? t("listing-Filters.classDisabledHint")
                                    : undefined
                                }
                                className={`lf-drop ${
                                  isOpen ? "open" : ""
                                } ${selected.length ? "has-value" : ""}`}
                                aria-expanded={isOpen}
                                onClick={() =>
                                  !isDisabled &&
                                  setDrop(isOpen ? null : d.key)
                                }
                              >
                                <div className="lf-drop-label-wrap">
                                  <DropIcon type={d.iconType} />
                                  <span
                                    className={
                                      selected.length ? "selected-value" : ""
                                    }
                                  >
                                    {selected.length === 0
                                      ? t(`listing-Filters.${d.titleKey}`)
                                      : selected[0]}
                                  </span>
                                </div>

                                <div className="lf-drop-end">
                                  {selected.length > 1 && (
                                    <span className="lf-drop-badge">
                                      +{selected.length - 1}
                                    </span>
                                  )}
                                  <span
                                    className={`lf-arrow ${
                                      isOpen ? "up" : ""
                                    }`}
                                  >
                                    ▾
                                  </span>
                                </div>
                              </button>

                              {isOpen && !isDisabled && (
                                <div className="lf-drop-panel lf-drop-down">
                                  {d.options.map((option) => {
                                    const isSelected =
                                      selected.includes(option);
                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        className={`lf-option ${
                                          isSelected ? "selected" : ""
                                        }`}
                                        onClick={() => {
                                          update(
                                            d.key,
                                            isSelected ? [] : [option]
                                          );
                                          setDrop(null);
                                        }}
                                      >
                                        <span>{option}</span>
                                        {isSelected && (
                                          <svg
                                            className="lf-option-check"
                                            viewBox="0 0 24 24"
                                            width="16"
                                            height="16"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                          >
                                            <polyline points="20 6 9 17 4 12" />
                                          </svg>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="filter-grid">
                        {range(
                          t("listing-Filters.engine"),
                          R.engine,
                          "0.1",
                          0,
                          10
                        )}

                        {range(
                          t("listing-Filters.horsepower"),
                          R.horsepower,
                          "1",
                          1,
                          1500
                        )}

                        {range(
                          t("listing-Filters.doors"),
                          R.doors,
                          "1",
                          2,
                          6
                        )}

                        {range(
                          t("listing-Filters.seats"),
                          R.seats,
                          "1",
                          1,
                          9
                        )}

                        {range(
                          t("listing-Filters.score"),
                          R.score,
                          "0.1",
                          0,
                          80
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="lf-footer">
                <div className="lf-footer-left">
                  <button
                    type="button"
                    className="lf-reset"
                    onClick={onReset}
                    title={t("listing-Filters.reset")}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                    </svg>
                    <span>{t("listing-Filters.reset")}</span>
                  </button>

                  {pills.length > 0 && (
                    <div className="lf-footer-pills">
                      {pills.map((p, i) => (
                        <span
                          key={i}
                          className="lf-footer-pill"
                        >
                          <span className="lf-footer-pill-text">
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
                    {countLoading ? (
                      <span className="lf-btn-spinner" />
                    ) : (
                      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    <span>{countText}</span>
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
