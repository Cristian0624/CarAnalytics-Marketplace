import { useEffect, useRef, useState } from "react";
import "./ListingFilters.css";
import Autocomplete from "./Autocomplete";
import { getPredictionBrands, getPredictionModels, getPredictionGenerations } from "../api/predictions";

const API_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const FUEL_TYPES = [
  "Gaz / Benzină (propan)",
  "Hybrid",
  "Gaz / Benzină (metan)",
  "Plug-in Hybrid (diesel)",
  "Diesel",
  "Benzină",
  "Mild Hybrid (diesel)",
  "Gaz",
  "Electricitate",
  "Plug-in Hybrid (benzină)",
  "Mild Hybrid (benzină)"
];

const GEARBOXES = [
  "Mecanică",
  "Variator",
  "Robotizată",
  "Automată",
  "Automat-Tiptronic"
];

const BODY_TYPES = [
  "Hatchback",
  "Microvan",
  "SUV",
  "Pickup",
  "Cabriolet",
  "Roadster",
  "Coupe",
  "Crossover",
  "Camionetă",
  "Sedan",
  "Combi",
  "Universal",
  "Minivan",
  "Furgon",
  "Microautobus",
  "Platformă deschisă"
];

const STATES = [
  "Cu rulaj",
  "Uzat",
  "Necesită reparații"
];

const DRIVETRAINS = [
  "4x2",
  "Din față",
  "Din spate",
  "4x4"
];

const SELLER_TYPES = [
  "Persoană fizică",
  "Dealer auto"
];

const REGISTRATION_COUNTRIES = [
  "Republica Moldova"
];

const CAR_CLASSES = [
  "C-segment (Compact)",
  "F (Groot)",
  "L (Lower-Suv)",
  "K (Upper-Mpv)",
  "J (Lower-Mpv)",
  "I (Luxe)",
  "E (Groot Midden)",
  "D-segment (Mid-size)",
  "A-segment (Mini)",
  "G (Sportief)",
  "N (Bestelauto)",
  "B-segment (Supermini)",
  "H (Sport)",
  "M (Upper-Suv)"
];

function RangeInput({
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  placeholderMin = "Min",
  placeholderMax = "Max",
  step = "1",
}) {
  return (
    <div className="range-inputs">
      <input
        type="number"
        min="0"
        step={step}
        value={minValue ?? ""}
        onChange={(e) =>
          onMinChange(
            e.target.value === ""
              ? null
              : e.target.value
          )
        }
        placeholder={placeholderMin}
      />

      <span>–</span>

      <input
        type="number"
        min="0"
        step={step}
        value={maxValue ?? ""}
        onChange={(e) =>
          onMaxChange(
            e.target.value === ""
              ? null
              : e.target.value
          )
        }
        placeholder={placeholderMax}
      />
    </div>
  );
}

function MultiSelect({
  options,
  selected = [],
  onChange,
  label = "Selectează",
  title = "Alege opțiunile"
}) {
  const [isOpen, setIsOpen] = useState(false);

  function toggleOption(option) {
    if (selected.includes(option)) {
      onChange(
        selected.filter(
          (item) => item !== option
        )
      );
    } else {
      onChange([...selected, option]);
    }
  }

  return (
    <>
      <button
        type="button"
        className="multi-select-toggle"
        onClick={() => setIsOpen(true)}
      >
        {selected.length > 0 ? `${label} (${selected.length})` : label}
        <span className="chevron">▼</span>
      </button>

      {isOpen && (
        <div className="filter-modal-overlay" onClick={() => setIsOpen(false)}>
          <div className="filter-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="filter-modal-header">
              <h3>{title}</h3>
              <button className="filter-modal-close" onClick={() => setIsOpen(false)}>×</button>
            </div>
                        <div className="filter-modal-body grid-boxes">
              {options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`filter-box-btn ${selected.includes(option) ? "selected" : ""}`}
                  onClick={() => toggleOption(option)}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="filter-modal-footer">
              <button className="btn-primary" onClick={() => setIsOpen(false)}>Gata</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ListingFilters({
  filters,
  setFilters,
  onSearch,
  onReset,
  loading,
}) {
  const [advancedOpen, setAdvancedOpen] =
    useState(false);

  const [suggestions, setSuggestions] =
    useState([]);

  const [showSuggestions, setShowSuggestions] =
    useState(false);

  const searchContainerRef =
    useRef(null);

  function update(field, value) {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  /*
   * WORD COMPLETION
   *
   * Cautăes the backend as the user types.
   *
   * IMPORTANT:
   * This expects your backend to have:
   *
   * GET /search/suggestions?q=...
   *
   * returning:
   *
   * {
   *   "suggestions": ["BMW", "BMW 3 Series", ...]
   * }
   */
  useEffect(() => {
    const query = filters.search?.trim();

    if (!query || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timeout = setTimeout(
      async () => {
        try {
          const response = await fetch(
            `${API_URL}/search/suggestions?q=${encodeURIComponent(
              query
            )}`
          );

          if (!response.ok) {
            setSuggestions([]);
            return;
          }

          const data =
            await response.json();

          setSuggestions(
            data.suggestions ?? []
          );

          setShowSuggestions(true);
        } catch (error) {
          console.error(
            "Failed to load search suggestions:",
            error
          );

          setSuggestions([]);
        }
      },
      250
    );

    return () => clearTimeout(timeout);
  }, [filters.search]);

  /*
   * Close suggestions when clicking outside
   */
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(
          event.target
        )
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleClickOutside
      );
    };
  }, []);

  function selectSuggestion(suggestion) {
    update("search", suggestion);
    setShowSuggestions(false);
  }

  function handleCautăKeyDown(event) {
    if (event.key === "Enter") {
      setShowSuggestions(false);
      onSearch();
    }
  }
  // Function to remove a specific array filter
  function removeArrayFilter(field, value) {
    const newArray = filters[field].filter((item) => item !== value);
    const newFilters = { ...filters, [field]: newArray };
    update(field, newArray);
    if (onSearch) onSearch(newFilters);
  }

  function removeRangeFilter(minField, maxField) {
    const newFilters = { ...filters, [minField]: "", [maxField]: "" };
    setFilters(current => ({ ...current, [minField]: "", [maxField]: "" }));
    if (onSearch) onSearch(newFilters);
  }

  function removeStringFilter(field) {
    const newFilters = { ...filters, [field]: "" };
    setFilters(current => ({ ...current, [field]: "" }));
    if (onSearch) onSearch(newFilters);
  }

  function removeBooleanFilter(field) {
    setFilters((current) => ({
      ...current,
      [field]: null,
    }));
  }

  // Generate pills
  const activePills = [];
  
  const arrayFields = ['fuel_type', 'gearbox', 'body_types', 'state', 'drivetrains', 'seller_type', 'registration_country', 'class'];
  arrayFields.forEach(field => {
    if (filters[field] && filters[field].length > 0) {
      filters[field].forEach(val => {
        activePills.push({
          label: val,
          onRemove: () => removeArrayFilter(field, val)
        });
      });
    }
  });

  const rangeFields = [
    { min: 'price_min', max: 'price_max', label: 'Preț', unit: '€' },
    { min: 'mileage_min', max: 'mileage_max', label: 'Rulaj', unit: 'km' },
    { min: 'year_min', max: 'year_max', label: 'An', unit: '' },
    { min: 'engine_min', max: 'engine_max', label: 'Motor', unit: 'cm3' },
    { min: 'horsepower_min', max: 'horsepower_max', label: 'CP', unit: 'CP' },
    { min: 'score_min', max: 'score_max', label: 'Scor', unit: '' },
  ];

  rangeFields.forEach(rf => {
    if (filters[rf.min] || filters[rf.max]) {
      const minText = filters[rf.min] ? filters[rf.min] : "0";
      const maxText = filters[rf.max] ? filters[rf.max] : "Max";
      activePills.push({
        label: `${rf.label}: ${minText}-${maxText} ${rf.unit}`,
        onRemove: () => removeRangeFilter(rf.min, rf.max)
      });
    }
  });

  if (filters.brandText) activePills.push({ label: `Marcă: ${filters.brandText}`, onRemove: () => removeStringFilter('brandText') });
  if (filters.modelText) activePills.push({ label: `Model: ${filters.modelText}`, onRemove: () => removeStringFilter('modelText') });


  return (
    <section className="listing-filters">

        <button
            type="button"
            className="recommendations-button"
            onClick={() => {
                window.location.href =
                    "/recommendations";
            }}
        >
            <span className="recommendations-button-icon">
                ✨
            </span>

            <span>
                Find recommended cars
            </span>

            <span className="recommendations-button-new">
                New
            </span>
        </button>

        {/* MAIN SEARCH */}
      <div
        className="listing-search-container"
        ref={searchContainerRef}
      >
        <div className="listing-search-wrapper">
          <span className="search-icon">
            🔍
          </span>

          <input
            type="text"
            value={filters.search ?? ""}
            onChange={(e) =>
              update(
                "search",
                e.target.value
              )
            }
            onFocus={() => {
              if (
                suggestions.length > 0
              ) {
                setShowSuggestions(true);
              }
            }}
            onKeyDown={
              handleCautăKeyDown
            }
            placeholder="Caută by brand, model, generation..."
            autoComplete="off"
          />

          {filters.search && (
            <button
              type="button"
              className="clear-search"
              onClick={() => {
                update("search", "");
                setSuggestions([]);
                setShowSuggestions(false);
              }}
            >
              ×
            </button>
          )}

          <button
            type="button"
            className="search-button"
            onClick={() => {
              setShowSuggestions(false);
              onSearch();
            }}
            disabled={loading}
          >
            Caută
          </button>
        </div>

        {/* AUTOCOMPLETE */}
        {showSuggestions &&
          suggestions.length > 0 && (
            <div className="search-suggestions">
              {suggestions.map(
                (suggestion, index) => (
                  <button
                    type="button"
                    key={`${suggestion}-${index}`}
                    className="search-suggestion"
                    onClick={() =>
                      selectSuggestion(
                        suggestion
                      )
                    }
                  >
                    <span className="suggestion-icon">
                      🔍
                    </span>

                    <span>
                      {suggestion}
                    </span>
                  </button>
                )
              )}
            </div>
          )}
      </div>

      {/* ADVANCED SEARCH BUTTON */}
      <button
        type="button"
        className={`advanced-search-toggle ${
          advancedOpen
            ? "open"
            : ""
        }`}
        onClick={() =>
          setAdvancedOpen(
            (current) => !current
          )
        }
      >
        <span>
          Advanced search
        </span>

        <span className="advanced-search-arrow">
          {advancedOpen ? "▲" : "▼"}
        </span>
      </button>

      {/* ADVANCED FILTERS */}
      {advancedOpen && (
        <div className="advanced-filters">

          <div className="filters-header">
            <div>
              <h2>Filtre avansate</h2>

              <p>
                Reduceți numărul de anunțuri folosind criterii specifice
              </p>
            </div>

            <button
              type="button"
              className="reset-filters-button"
              onClick={onReset}
            >
              Resetează filtrele
            </button>
          </div>

          <div className="filter-grid">

            {/* BRAND */}
            <div className="filter-group">
              <label>Marcă</label>

              <Autocomplete
                value={filters.brandText ?? ""}
                onChange={(v) => update("brandText", v)}
                onSelect={(v) => update("brandText", v)}
                fetchSuggestions={async (query) => {
                  try {
                    const data = await getPredictionBrands(query);
                    return data.brands || [];
                  } catch (e) {
                    return [];
                  }
                }}
                placeholder="e.g. BMW"
              />
            </div>

            {/* MODEL */}
            <div className="filter-group">
              <label>Model</label>

              <Autocomplete
                value={filters.modelText ?? ""}
                onChange={(v) => update("modelText", v)}
                onSelect={(v) => update("modelText", v)}
                fetchSuggestions={async (query) => {
                  if (!filters.brandText) return [];
                  try {
                    const data = await getPredictionModels(filters.brandText, query);
                    return data.models || [];
                  } catch (e) {
                    return [];
                  }
                }}
                placeholder="e.g. 3 Series"
                disabled={!filters.brandText}
              />
            </div>

            {/* GENERATION */}
            <div className="filter-group">
              <label>Generație</label>

              <Autocomplete
                value={filters.generationText ?? ""}
                onChange={(v) => update("generationText", v)}
                onSelect={(v) => update("generationText", v)}
                fetchSuggestions={async (query) => {
                  if (!filters.brandText || !filters.modelText) return [];
                  try {
                    const data = await getPredictionGenerations(filters.brandText, filters.modelText, query);
                    return data.generations || [];
                  } catch (e) {
                    return [];
                  }
                }}
                placeholder="e.g. G20"
                disabled={!filters.modelText}
              />
            </div>

            {/* PRICE */}
            <div className="filter-group">
              <label>
                Price (€)
              </label>

              <RangeInput
                minValue={
                  filters.price_min
                }
                maxValue={
                  filters.price_max
                }
                onMinChange={(value) =>
                  update(
                    "price_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "price_max",
                    value
                  )
                }
              />
            </div>

            {/* MILEAGE */}
            <div className="filter-group">
              <label>
                Kilometraj (km)
              </label>

              <RangeInput
                minValue={
                  filters.mileage_min
                }
                maxValue={
                  filters.mileage_max
                }
                onMinChange={(value) =>
                  update(
                    "mileage_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "mileage_max",
                    value
                  )
                }
              />
            </div>

            {/* YEAR */}
            <div className="filter-group">
              <label>An</label>

              <RangeInput
                minValue={
                  filters.year_min
                }
                maxValue={
                  filters.year_max
                }
                onMinChange={(value) =>
                  update(
                    "year_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "year_max",
                    value
                  )
                }
              />
            </div>

            {/* ENGINE */}
            <div className="filter-group">
              <label>
                Capacitatea Motorului (L)
              </label>

              <RangeInput
                minValue={
                  filters.engine_min
                }
                maxValue={
                  filters.engine_max
                }
                step="0.1"
                onMinChange={(value) =>
                  update(
                    "engine_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "engine_max",
                    value
                  )
                }
              />
            </div>

            {/* HORSEPOWER */}
            <div className="filter-group">
              <label>Cai putere</label>

              <RangeInput
                minValue={
                  filters.horsepower_min
                }
                maxValue={
                  filters.horsepower_max
                }
                onMinChange={(value) =>
                  update(
                    "horsepower_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "horsepower_max",
                    value
                  )
                }
              />
            </div>

            {/* FUEL */}
            <div className="filter-group">
              <label>
                Combustibil
              </label>

              <MultiSelect
                options={FUEL_TYPES}
                selected={
                  filters.fuel_type ?? []
                }
                onChange={(value) =>
                  update(
                    "fuel_type",
                    value
                  )
                }
              />
            </div>

            {/* GEARBOX */}
            <div className="filter-group">
              <label>Cutie de viteze</label>

              <MultiSelect
                options={GEARBOXES}
                selected={
                  filters.gearbox ?? []
                }
                onChange={(value) =>
                  update(
                    "gearbox",
                    value
                  )
                }
              />
            </div>

            {/* BODY TYPE */}
            <div className="filter-group">
              <label>Caroserie</label>

              <MultiSelect
                options={BODY_TYPES}
                selected={
                  filters.body_types ?? []
                }
                onChange={(value) =>
                  update(
                    "body_types",
                    value
                  )
                }
              />
            </div>

            {/* STATE */}
            <div className="filter-group">
              <label>Stare</label>

              <MultiSelect
                options={STATES}
                selected={
                  filters.state ?? []
                }
                onChange={(value) =>
                  update(
                    "state",
                    value
                  )
                }
              />
            </div>

            {/* DRIVETRAIN */}
            <div className="filter-group">
              <label>Tracțiune</label>

              <MultiSelect
                options={DRIVETRAINS}
                selected={
                  filters.drivetrains ?? []
                }
                onChange={(value) =>
                  update(
                    "drivetrains",
                    value
                  )
                }
              />
            </div>

            {/* DOORS */}
            <div className="filter-group">
              <label>Uși</label>

              <RangeInput
                minValue={
                  filters.doors_min
                }
                maxValue={
                  filters.doors_max
                }
                onMinChange={(value) =>
                  update(
                    "doors_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "doors_max",
                    value
                  )
                }
              />
            </div>

            {/* SEATS */}
            <div className="filter-group">
              <label>Locuri</label>

              <RangeInput
                minValue={
                  filters.seats_min
                }
                maxValue={
                  filters.seats_max
                }
                onMinChange={(value) =>
                  update(
                    "seats_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "seats_max",
                    value
                  )
                }
              />
            </div>

            {/* SELLER */}
            <div className="filter-group">
              <label>Vânzător</label>

              <MultiSelect
                options={SELLER_TYPES}
                selected={
                  filters.seller_type ??
                  []
                }
                onChange={(value) =>
                  update(
                    "seller_type",
                    value
                  )
                }
              />
            </div>

            {/* REGISTRATION */}
            <div className="filter-group">
              <label>Țara de înmatriculare</label>

              <MultiSelect
                options={
                  REGISTRATION_COUNTRIES
                }
                selected={
                  filters.registration_country ??
                  []
                }
                onChange={(value) =>
                  update(
                    "registration_country",
                    value
                  )
                }
              />
            </div>

            {/* CLASS */}
            <div className="filter-group">
              <label>Clasa mașinii</label>

              <MultiSelect
                options={CAR_CLASSES}
                selected={
                  filters.class ?? []
                }
                onChange={(value) =>
                  update(
                    "class",
                    value
                  )
                }
              />
            </div>

            {/* SCORE */}
            <div className="filter-group">
              <label>Scor</label>

              <RangeInput
                minValue={
                  filters.score_min
                }
                maxValue={
                  filters.score_max
                }
                step="0.1"
                onMinChange={(value) =>
                  update(
                    "score_min",
                    value
                  )
                }
                onMaxChange={(value) =>
                  update(
                    "score_max",
                    value
                  )
                }
              />
            </div>

            {/* SAME MODEL */}
            <div className="filter-group">
              <label>Același model</label>

              <select
                value={
                  filters.same_model === null
                    ? ""
                    : String(
                        filters.same_model
                      )
                }
                onChange={(e) => {
                  const value =
                    e.target.value;

                  update(
                    "same_model",
                    value === ""
                      ? null
                      : value === "true"
                  );
                }}
              >
                <option value="">Oricare</option>

                <option value="true">Da</option>

                <option value="false">Nu</option>
              </select>
            </div>

            {/* SORT */}
            <div className="filter-group">
              <label>Sortează după</label>

              <select
                value={
                  filters.sort_by ?? ""
                }
                onChange={(e) =>
                  update(
                    "sort_by",
                    e.target.value || null
                  )
                }
              >
                <option value="">Nimic</option>

                <option value="score">Scor</option>

                <option value="price_eur">Preț</option>

                <option value="year">An</option>

                <option value="mileage">Rulaj</option>
              </select>
            </div>

            {/* SORT ORDER */}
            <div className="filter-group">
              <label>Ordine sortare</label>

              <select
                value={
                  filters.sort_order ?? ""
                }
                onChange={(e) =>
                  update(
                    "sort_order",
                    e.target.value || null
                  )
                }
              >
                <option value="">Aleatoriu</option>

                <option value="asc">Crescător</option>

                <option value="desc">Descrescător</option>
              </select>
            </div>
          </div>

          <div className="filters-footer">
            <button
              type="button"
              className="apply-filters-button"
              onClick={onSearch}
              disabled={loading}
            >
              Aplică filtrele
            </button>
          </div>
        </div>
      )}
    
      {activePills.length > 0 && (
        <div className="active-filters-pills">
          <div className="pills-header">
            <span>Filtre active</span>
            <button className="clear-all-btn" onClick={onReset}>Curăță tot</button>
          </div>
          <div className="pills-list">
            {activePills.map((pill, idx) => (
              <div key={idx} className="filter-pill">
                <span>{pill.label}</span>
                <button type="button" className="pill-remove-btn" onClick={pill.onRemove}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

    </section>
  );
}

export default ListingFilters;