import { useEffect, useRef, useState } from "react";
import "./ListingFilters.css";

const API_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const FUEL_TYPES = [
  "Petrol",
  "Diesel",
  "Hybrid",
  "Electric",
  "LPG",
];

const GEARBOXES = [
  "Manual",
  "Automatic",
  "Semi-automatic",
];

const BODY_TYPES = [
  "Sedan",
  "Hatchback",
  "SUV",
  "Coupe",
  "Convertible",
  "Wagon",
  "Minivan",
  "Pickup",
];

const STATES = [
  "New",
  "Used",
  "Damaged",
];

const DRIVETRAINS = [
  "FWD",
  "RWD",
  "AWD",
  "4WD",
];

const SELLER_TYPES = [
  "Private",
  "Dealer",
];

const REGISTRATION_COUNTRIES = [
  "Moldova",
  "Germany",
  "Romania",
  "France",
  "Italy",
  "Other",
];

const CAR_CLASSES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "S",
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
}) {
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
    <div className="multi-select">
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={`multi-option ${
            selected.includes(option)
              ? "selected"
              : ""
          }`}
          onClick={() =>
            toggleOption(option)
          }
        >
          {option}
        </button>
      ))}
    </div>
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
   * Searches the backend as the user types.
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

  function handleSearchKeyDown(event) {
    if (event.key === "Enter") {
      setShowSuggestions(false);
      onSearch();
    }
  }

  return (
    <section className="listing-filters">

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
              handleSearchKeyDown
            }
            placeholder="Search by brand, model, generation..."
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
            Search
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
              <h2>Advanced filters</h2>

              <p>
                Narrow down the listings
                using specific criteria.
              </p>
            </div>

            <button
              type="button"
              className="reset-filters-button"
              onClick={onReset}
            >
              Reset filters
            </button>
          </div>

          <div className="filter-grid">

            {/* BRAND */}
            <div className="filter-group">
              <label>
                Brand
              </label>

              <input
                type="text"
                value={
                  filters.brandText ?? ""
                }
                onChange={(e) =>
                  update(
                    "brandText",
                    e.target.value
                  )
                }
                placeholder="e.g. BMW"
              />
            </div>

            {/* MODEL */}
            <div className="filter-group">
              <label>
                Model
              </label>

              <input
                type="text"
                value={
                  filters.modelText ?? ""
                }
                onChange={(e) =>
                  update(
                    "modelText",
                    e.target.value
                  )
                }
                placeholder="e.g. 3 Series"
              />
            </div>

            {/* GENERATION */}
            <div className="filter-group">
              <label>
                Generation
              </label>

              <input
                type="text"
                value={
                  filters.generationText ??
                  ""
                }
                onChange={(e) =>
                  update(
                    "generationText",
                    e.target.value
                  )
                }
                placeholder="e.g. G20"
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
                Mileage (km)
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
              <label>
                Year
              </label>

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
                Engine (L)
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
              <label>
                Horsepower
              </label>

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
                Fuel
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
              <label>
                Gearbox
              </label>

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
              <label>
                Body type
              </label>

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
              <label>
                State
              </label>

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
              <label>
                Drivetrain
              </label>

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
              <label>
                Doors
              </label>

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
              <label>
                Seats
              </label>

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
              <label>
                Seller
              </label>

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
              <label>
                Registration country
              </label>

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
              <label>
                Car class
              </label>

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
              <label>
                Score
              </label>

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
              <label>
                Same model
              </label>

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
                <option value="">
                  Any
                </option>

                <option value="true">
                  Yes
                </option>

                <option value="false">
                  No
                </option>
              </select>
            </div>

            {/* SORT */}
            <div className="filter-group">
              <label>
                Sort by
              </label>

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
                <option value="">
                  Default
                </option>

                <option value="score">
                  Score
                </option>

                <option value="price_eur">
                  Price
                </option>

                <option value="year">
                  Year
                </option>

                <option value="mileage">
                  Mileage
                </option>
              </select>
            </div>

            {/* SORT ORDER */}
            <div className="filter-group">
              <label>
                Sort order
              </label>

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
                <option value="">
                  Default
                </option>

                <option value="asc">
                  Ascending
                </option>

                <option value="desc">
                  Descending
                </option>
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
              Apply filters
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default ListingFilters;