import { useEffect, useRef, useState } from "react";
import "./ListingFilters.css";
import MarketplaceVehicleFields, { FilterHint } from "./MarketplaceVehicleFields";
import { listingFilterError, updateListingFilter } from "../utils/listingFilters";

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
  title = "Alege opțiunile",
  disabled = false,
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
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      >
        {selected.length > 0 ? `${label} (${selected.length})` : label}
        <span className="chevron">▼</span>
      </button>

      {isOpen && !disabled && (
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
  actions,
  searchLabel = "Aplică filtrele",
  initiallyOpen = false,
}) {
  const [advancedOpen, setAdvancedOpen] =
    useState(initiallyOpen);

  const [suggestions, setSuggestions] =
    useState([]);

  const [showSuggestions, setShowSuggestions] =
    useState(false);

  const searchContainerRef =
    useRef(null);

  function update(field, value) {
    setFilters((current) => updateListingFilter(current, field, value));
  }

  const filterError = listingFilterError(filters);
  const classDisabled = Boolean(filters.modelText?.trim()) && !filters.class?.length;

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
    if (field === 'brandText') {
      newFilters.modelText = "";
      newFilters.generationText = "";
    } else if (field === 'modelText') {
      newFilters.generationText = "";
    }
    setFilters(newFilters);
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
  if (filters.generationText) activePills.push({ label: `Generație: ${filters.generationText}`, onRemove: () => removeStringFilter('generationText') });


  return (
    <section className="listing-filters">

      {/* ADVANCED FILTERS */}
      <div className="advanced-filters">

          <div className="filters-header">
            <div>
              <h2>Filtre avansate</h2>

              <p>
                  Mărcile și modelele disponibile provin din anunțurile auto din Republica Moldova.
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

            <MarketplaceVehicleFields filters={filters} update={update} />

            {/* PRICE */}
            <div className="filter-group">
              <label>
                Preț (€)
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
                disabled={classDisabled}
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
              {classDisabled && <FilterHint>Eliminați modelul pentru a alege clasele mașinii.</FilterHint>}
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
            {filterError && <p className="filter-validation-error" role="alert">{filterError}</p>}
            {actions}
            <button
              type="button"
              className="apply-filters-button"
              onClick={onSearch}
              disabled={loading || Boolean(filterError)}
            >
              {searchLabel}
            </button>
          </div>
        </div>
{actions && <div className="saved-actions">{actions}</div>}
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
