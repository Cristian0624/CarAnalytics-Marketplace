import React from "react";
import "./ListingFilters.css";

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
    label,
    minValue,
    maxValue,
    minPlaceholder,
    maxPlaceholder,
    onMinChange,
    onMaxChange,
}) {
    return (
        <div className="filter-group">
            <label>{label}</label>

            <div className="range-inputs">
                <input
                    type="number"
                    min="0"
                    value={minValue ?? ""}
                    placeholder={minPlaceholder}
                    onChange={(e) => onMinChange(e.target.value)}
                />

                <span>–</span>

                <input
                    type="number"
                    min="0"
                    value={maxValue ?? ""}
                    placeholder={maxPlaceholder}
                    onChange={(e) => onMaxChange(e.target.value)}
                />
            </div>
        </div>
    );
}

function MultiSelect({
    label,
    values,
    options,
    onChange,
}) {
    const toggleValue = (value) => {
        if (values.includes(value)) {
            onChange(values.filter((item) => item !== value));
        } else {
            onChange([...values, value]);
        }
    };

    return (
        <div className="filter-group">
            <label>{label}</label>

            <div className="multi-select">
                {options.map((option) => (
                    <button
                        type="button"
                        key={option}
                        className={
                            values.includes(option)
                                ? "multi-option selected"
                                : "multi-option"
                        }
                        onClick={() => toggleValue(option)}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default function ListingFilters({
    filters,
    setFilters,
    onSearch,
    onReset,
    loading,
}) {
    const update = (field, value) => {
        setFilters((previous) => ({
            ...previous,
            [field]: value,
        }));
    };

    return (
        <section className="listing-filters">

            <div className="filters-header">
                <div>
                    <h2>Find your car</h2>
                    <p>
                        Search and filter listings by their features.
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

            <div className="listing-search-wrapper">
                <span className="search-icon">⌕</span>

                <input
                    type="text"
                    value={filters.search}
                    placeholder="Search by brand, model, generation or listing..."
                    onChange={(e) => update("search", e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            onSearch();
                        }
                    }}
                />

                {filters.search && (
                    <button
                        type="button"
                        className="clear-search"
                        onClick={() => update("search", "")}
                    >
                        ×
                    </button>
                )}

                <button
                    type="button"
                    className="search-button"
                    onClick={onSearch}
                    disabled={loading}
                >
                    {loading ? "Searching..." : "Search"}
                </button>
            </div>

        <div className="filter-grid">

            <div className="filter-group">
                    <label>Brand</label>

                    <input
                        type="text"
                        placeholder="e.g. BMW"
                        value={filters.brandText}
                        onChange={(e) =>
                            update("brandText", e.target.value)
                        }
                    />
            </div>

                <div className="filter-group">
                    <label>Model</label>

                    <input
                        type="text"
                        placeholder="e.g. 3 Series"
                        value={filters.modelText}
                        onChange={(e) =>
                            update("modelText", e.target.value)
                        }
                    />
                </div>

                <div className="filter-group">
                    <label>Generation</label>

                    <input
                        type="text"
                        placeholder="e.g. G20"
                        value={filters.generationText}
                        onChange={(e) =>
                            update("generationText", e.target.value)
                        }
                    />
                </div>

                <RangeInput
                    label="Price (€)"
                    minValue={filters.price_min}
                    maxValue={filters.price_max}
                    minPlaceholder="Min €"
                    maxPlaceholder="Max €"
                    onMinChange={(value) =>
                        update("price_min", value)
                    }
                    onMaxChange={(value) =>
                        update("price_max", value)
                    }
                />

                <RangeInput
                    label="Mileage (km)"
                    minValue={filters.mileage_min}
                    maxValue={filters.mileage_max}
                    minPlaceholder="Min km"
                    maxPlaceholder="Max km"
                    onMinChange={(value) =>
                        update("mileage_min", value)
                    }
                    onMaxChange={(value) =>
                        update("mileage_max", value)
                    }
                />

                <RangeInput
                    label="Year"
                    minValue={filters.year_min}
                    maxValue={filters.year_max}
                    minPlaceholder="From"
                    maxPlaceholder="To"
                    onMinChange={(value) =>
                        update("year_min", value)
                    }
                    onMaxChange={(value) =>
                        update("year_max", value)
                    }
                />

                <RangeInput
                    label="Engine (L)"
                    minValue={filters.engine_min}
                    maxValue={filters.engine_max}
                    minPlaceholder="Min L"
                    maxPlaceholder="Max L"
                    onMinChange={(value) =>
                        update("engine_min", value)
                    }
                    onMaxChange={(value) =>
                        update("engine_max", value)
                    }
                />

                <RangeInput
                    label="Horsepower"
                    minValue={filters.horsepower_min}
                    maxValue={filters.horsepower_max}
                    minPlaceholder="Min HP"
                    maxPlaceholder="Max HP"
                    onMinChange={(value) =>
                        update("horsepower_min", value)
                    }
                    onMaxChange={(value) =>
                        update("horsepower_max", value)
                    }
                />

                <MultiSelect
                    label="Fuel"
                    values={filters.fuel_type}
                    options={FUEL_TYPES}
                    onChange={(value) =>
                        update("fuel_type", value)
                    }
                />

                <MultiSelect
                    label="Gearbox"
                    values={filters.gearbox}
                    options={GEARBOXES}
                    onChange={(value) =>
                        update("gearbox", value)
                    }
                />

                <MultiSelect
                    label="Body type"
                    values={filters.body_types}
                    options={BODY_TYPES}
                    onChange={(value) =>
                        update("body_types", value)
                    }
                />

                <MultiSelect
                    label="State"
                    values={filters.state}
                    options={STATES}
                    onChange={(value) =>
                        update("state", value)
                    }
                />

                <MultiSelect
                    label="Drivetrain"
                    values={filters.drivetrains}
                    options={DRIVETRAINS}
                    onChange={(value) =>
                        update("drivetrains", value)
                    }
                />

                <RangeInput
                    label="Doors"
                    minValue={filters.doors_min}
                    maxValue={filters.doors_max}
                    minPlaceholder="Min"
                    maxPlaceholder="Max"
                    onMinChange={(value) =>
                        update("doors_min", value)
                    }
                    onMaxChange={(value) =>
                        update("doors_max", value)
                    }
                />

                <RangeInput
                    label="Seats"
                    minValue={filters.seats_min}
                    maxValue={filters.seats_max}
                    minPlaceholder="Min"
                    maxPlaceholder="Max"
                    onMinChange={(value) =>
                        update("seats_min", value)
                    }
                    onMaxChange={(value) =>
                        update("seats_max", value)
                    }
                />

                <MultiSelect
                    label="Seller"
                    values={filters.seller_type}
                    options={SELLER_TYPES}
                    onChange={(value) =>
                        update("seller_type", value)
                    }
                />

                <MultiSelect
                    label="Registration country"
                    values={filters.registration_country}
                    options={REGISTRATION_COUNTRIES}
                    onChange={(value) =>
                        update("registration_country", value)
                    }
                />

                <MultiSelect
                    label="Class"
                    values={filters.class}
                    options={CAR_CLASSES}
                    onChange={(value) =>
                        update("class", value)
                    }
                />

                <RangeInput
                    label="Score"
                    minValue={filters.score_min}
                    maxValue={filters.score_max}
                    minPlaceholder="Min"
                    maxPlaceholder="Max"
                    onMinChange={(value) =>
                        update("score_min", value)
                    }
                    onMaxChange={(value) =>
                        update("score_max", value)
                    }
                />

                <div className="filter-group">
                    <label>Same model</label>

                    <select
                        value={
                            filters.same_model === null
                                ? ""
                                : String(filters.same_model)
                        }
                        onChange={(e) => {
                            const value = e.target.value;

                            update(
                                "same_model",
                                value === ""
                                    ? null
                                    : value === "true"
                            );
                        }}
                    >
                        <option value="">Any</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Sort by</label>

                    <select
                        value={filters.sort_by}
                        onChange={(e) =>
                            update("sort_by", e.target.value)
                        }
                    >
                        <option value="">Default</option>
                        <option value="score">Score</option>
                        <option value="price_eur">Price</option>
                        <option value="year">Year</option>
                        <option value="mileage">Mileage</option>
                    </select>
                </div>

                <div className="filter-group">
                    <label>Order</label>

                    <select
                        value={filters.sort_order}
                        onChange={(e) =>
                            update("sort_order", e.target.value)
                        }
                    >
                        <option value="">Default</option>
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
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
                    {loading ? "Loading listings..." : "Apply filters"}
                </button>
            </div>

        </section>
    );
}