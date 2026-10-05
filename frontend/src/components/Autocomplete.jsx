import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./Autocomplete.css";
import { highlightParts } from "../utils/autocomplete";
import { filterVehicleOptions, resolveVehicleOption } from "../utils/anomalyRisk";

function HighlightMatch({ text, query }) {
  if (!query) return <span>{text}</span>;

  const parts = highlightParts(text, query);

  return (
    <span>
      {parts.map((part, i) =>
        part.match ? (
          <span key={i} className="highlight-match">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

export default function Autocomplete({
  value,
  onChange,
  inputRef,
  onSelect,
  fetchSuggestions,
  placeholder,
  disabled = false,
  options,
  loading = false,
  error = false,
  label,
}) {
  const { t } = useTranslation();

  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSuggestions() {
      if (!isOpen || disabled) return;

      try {
        const results = options
          ? filterVehicleOptions(
              options,
              options.includes(value) ? "" : value || ""
            )
          : await fetchSuggestions(value || "");

        if (active) {
          setSuggestions(results);
          setSearching(false);
        }
      } catch (e) {
        if (active) {
          setSuggestions([]);
          setSearching(false);
        }
      }
    }

    const timer = setTimeout(() => {
      loadSuggestions();
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value, isOpen, fetchSuggestions, options, disabled]);

  function choose(option) {
    onSelect(option);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div className="autocomplete-wrapper" ref={wrapperRef}>
      <input
        ref={inputRef}
        type="text"
        aria-label={label ?? placeholder}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
          setSearching(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          setActiveIndex(-1);
          setSearching(true);
        }}
        onBlur={() => {
          setIsOpen(false);

          const selected = options && resolveVehicleOption(options, value);

          if (selected && selected !== value) {
            onSelect(selected);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);

            setActiveIndex((index) =>
              Math.max(
                0,
                Math.min(
                  suggestions.length - 1,
                  index + (event.key === "ArrowDown" ? 1 : -1)
                )
              )
            );
          }

          if (event.key === "Enter" && isOpen) {
            event.preventDefault();

            if (
              suggestions.length &&
              !loading &&
              !error &&
              !searching
            ) {
              choose(suggestions[activeIndex] ?? suggestions[0]);
            }
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />

      {isOpen && !disabled && (options || suggestions.length > 0) && (
        <ul className="autocomplete-list">
          {error ? (
            <li role="status">
              {t("autocomplete.loadError")}
            </li>
          ) : loading ? (
            <li role="status">
              {t("autocomplete.loading")}
            </li>
          ) : searching ? (
            <li role="status">
              {t("autocomplete.searching")}
            </li>
          ) : !suggestions.length ? (
            <li role="status">
              {t("autocomplete.noResults")}
            </li>
          ) : (
            suggestions.map((s, idx) => (
              <li
                key={idx}
                className={activeIndex === idx ? "active" : ""}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(s);
                }}
              >
                <HighlightMatch text={s} query={value} />
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}