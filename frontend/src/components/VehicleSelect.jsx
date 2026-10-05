import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  filterVehicleOptions,
  resolveVehicleOption
} from "../utils/anomalyRisk";

export default function VehicleSelect({
  field,
  label,
  value,
  options,
  onChange,
  onCommit,
  disabled = false,
  loading = false,
  error = false,
  required = false
}) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  const [visibleQuery, setVisibleQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(-1);

  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const matches = filterVehicleOptions(options, visibleQuery);
  const listId = `risk-${field}-matches`;

  function change(text) {
    onChange(field, text);
    setOpen(true);
    setActive(-1);

    clearTimeout(timer.current);

    if (!text) {
      setVisibleQuery("");
      setSearching(false);
    } else {
      setSearching(true);

      timer.current = setTimeout(() => {
        setVisibleQuery(text);
        setSearching(false);
      }, 400);
    }
  }

  function choose(option) {
    clearTimeout(timer.current);

    onChange(field, option);
    setVisibleQuery(option);
    setSearching(false);
    setOpen(false);
    setActive(-1);
  }

  function keyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      setOpen(true);

      if (searching || !matches.length) return;

      setActive((current) =>
        event.key === "ArrowDown"
          ? Math.min(current + 1, matches.length - 1)
          : Math.max(current - 1, 0)
      );
    }

    if (event.key === "Enter" && open) {
      event.preventDefault();

      const option =
        matches[active] ??
        resolveVehicleOption(options, value) ??
        (!searching ? matches[0] : null);

      if (option) choose(option);
    }
  }

  return (
    <div className="risk-field risk-vehicle-select">
      <label htmlFor={`risk-${field}`}>
        {label}
        {required ? " *" : ""}
      </label>

      <input
        id={`risk-${field}`}
        name={field}
        value={value}
        maxLength={200}
        required={required}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && !disabled}
        aria-controls={listId}
        aria-activedescendant={
          active >= 0 && !searching
            ? `${listId}-${active}`
            : undefined
        }
        aria-describedby={`risk-${field}-hint`}
        placeholder={
          disabled
            ? t("vehicleSelect.choosePrevious")
            : t("vehicleSelect.choose", {
                label: label.toLowerCase()
              })
        }
        onFocus={() => {
          setOpen(true);
          setVisibleQuery(
            resolveVehicleOption(options, value) === value
              ? ""
              : value
          );
          setSearching(false);
          setActive(-1);
        }}
        onBlur={() => {
          setOpen(false);

          const option = resolveVehicleOption(
            options,
            value
          );

          if (option && option !== value) {
            onCommit(field, option);
          }
        }}
        onChange={(event) =>
          change(event.target.value)
        }
        onKeyDown={keyDown}
      />

      {open && !disabled && (
        <div
          className="risk-suggestion-menu"
          id={listId}
          role="listbox"
        >
          {error ? (
            <p>{t("vehicleSelect.loadError")}</p>
          ) : loading ? (
            <p>{t("vehicleSelect.loading")}</p>
          ) : searching ? (
            <p>{t("vehicleSelect.searching")}</p>
          ) : matches.length ? (
            matches.map((option, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={
                  index === active ? "active" : ""
                }
                id={`${listId}-${index}`}
                key={option}
                onMouseDown={(event) =>
                  event.preventDefault()
                }
                onClick={() => choose(option)}
              >
                {option}
              </button>
            ))
          ) : (
            <p>{t("vehicleSelect.noResults")}</p>
          )}
        </div>
      )}

      <small id={`risk-${field}-hint`}>
        {disabled
          ? t("vehicleSelect.disabledHint")
          : t("vehicleSelect.hint")}
      </small>
    </div>
  );
}