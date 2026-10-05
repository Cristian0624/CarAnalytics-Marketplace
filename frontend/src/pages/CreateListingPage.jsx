import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { getListingOptions } from "../api/listings";
import { estimatePrice } from "../api/price_estimate";
import { createAnalysis } from "../api/analysis";

import Autocomplete from "../components/Autocomplete";
import BackgroundTriangles from "../components/BackgroundTriangles";
import {
    getPredictionBrands,
    getPredictionModels,
    getPredictionGenerations,
} from "../api/predictions";

import "./CreateListingPage.css";
import { useTranslation } from "react-i18next";


const INITIAL_FORM = {
    brand: "",
    model: "",
    generation: "",

    year: "",
    mileage: "",

    engine: "",
    horsepower: "",

    fuel_type: "",
    gearbox: "",
    body_type: "",
    state: "Used",
    drivetrain: "",

    doors: "",
    seats: "",

    seller_type: "",
    registration_country: "",

    class_: "",

    price_eur: "",
};


const EMPTY_OPTIONS = {
    brand: [],
    model: [],
    generation: [],
    fuel_type: [],
    engine: [],
    gearbox: [],
    drivetrain: [],
    body_type: [],
    class: [],
};


function formatPrice(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return "—";
    }

    return new Intl.NumberFormat("de-DE", {
        maximumFractionDigits: 0,
    }).format(Number(value));
}


function formatNumber(value) {
    if (value === null || value === undefined || value === "") {
        return "";
    }

    return new Intl.NumberFormat("de-DE").format(Number(value));
}


function parseNumber(value) {
    if (value === "" || value === null || value === undefined) {
        return null;
    }

    const normalized = String(value).replace(/\s/g, "").replace(",", ".");

    const number = Number(normalized);

    return Number.isFinite(number) ? number : null;
}


function getEstimatePayload(form) {
    const year = parseNumber(form.year);
    const mileage = parseNumber(form.mileage);

    if (
        !form.brand ||
        !form.model ||
        !form.generation ||
        !form.fuel_type ||
        !form.gearbox ||
        !form.drivetrain ||
        !form.body_type ||
        year === null ||
        mileage === null
    ) {
        return null;
    }

    const engine =
        form.engine === ""
            ? null
            : parseNumber(form.engine);

    return {
        brand: form.brand,
        model: form.model,
        generation: form.generation,

        year,
        mileage,

        fuel_type: form.fuel_type,

        engine,

        gearbox: form.gearbox,
        drivetrain: form.drivetrain,
        body_type: form.body_type,

        year_min: Math.max(1886, year - 2),
        year_max: year + 2,

        mileage_min: Math.max(0, mileage - 30000),
        mileage_max: mileage + 30000,
    };
}


export default function CreateListingPage() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [form, setForm] = useState(() => ({
        ...INITIAL_FORM,
        seller_type: user?.seller_type || "",
    }));

    const [options, setOptions] = useState(EMPTY_OPTIONS);

    const [optionsLoading, setOptionsLoading] = useState(false);

    const [priceEstimate, setPriceEstimate] = useState(null);
    const [estimateLoading, setEstimateLoading] = useState(false);
    const [estimateError, setEstimateError] = useState("");

    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [submitSuccess, setSubmitSuccess] = useState(false);


    useEffect(() => {
        if (user?.seller_type) {
            setForm((current) => ({
                ...current,
                seller_type: current.seller_type || user.seller_type,
            }));
        }
    }, [user]);


    /*
     * Load all initial options.
     *
     * The backend returns:
     * brand
     * fuel_type
     * engine
     * gearbox
     * drivetrain
     * body_type
     *
     * Model and generation are loaded after their parent
     * selection is made.
     */
    useEffect(() => {
        let cancelled = false;

        async function loadInitialOptions() {
            setOptionsLoading(true);

            try {
                const result = await getListingOptions();

                if (!cancelled) {
                    setOptions((current) => ({
                        ...current,
                        ...result,
                        model: [],
                        generation: [],
                        class: [],
                    }));
                }
            } catch (error) {
                if (!cancelled) {
                    setSubmitError(
                        error?.message ||
                        t("createListing.errors.loadOptions")
                    );
                }
            } finally {
                if (!cancelled) {
                    setOptionsLoading(false);
                }
            }
        }

        loadInitialOptions();

        return () => {
            cancelled = true;
        };
    }, []);


    /*
     * Brand -> Model -> Generation -> Class
     */
    useEffect(() => {
        if (!form.brand) {
            setOptions((current) => ({
                ...current,
                model: [],
                generation: [],
                class: [],
            }));

            return;
        }

        let cancelled = false;

        async function loadModels() {
            try {
                const result = await getListingOptions({
                    brand: form.brand,
                });

                if (!cancelled) {
                    setOptions((current) => ({
                        ...current,
                        model: result.model || [],
                        generation: [],
                        class: [],
                    }));
                }
            } catch {
                if (!cancelled) {
                    setOptions((current) => ({
                        ...current,
                        model: [],
                        generation: [],
                        class: [],
                    }));
                }
            }
        }

        loadModels();

        return () => {
            cancelled = true;
        };
    }, [form.brand]);


    useEffect(() => {
        if (!form.brand || !form.model) {
            setOptions((current) => ({
                ...current,
                generation: [],
                class: [],
            }));

            return;
        }

        let cancelled = false;

        async function loadGenerations() {
            try {
                const result = await getListingOptions({
                    brand: form.brand,
                    model: form.model,
                });

                if (!cancelled) {
                    setOptions((current) => ({
                        ...current,
                        generation: result.generation || [],
                        class: result.class || [],
                    }));
                }
            } catch {
                if (!cancelled) {
                    setOptions((current) => ({
                        ...current,
                        generation: [],
                        class: [],
                    }));
                }
            }
        }

        loadGenerations();

        return () => {
            cancelled = true;
        };
    }, [form.brand, form.model]);


    /*
     * If there is exactly one database class for the selected
     * brand/model, automatically use it.
     */
    useEffect(() => {
        if (options.class?.length === 1) {
            setForm((current) => ({
                ...current,
                class_: options.class[0],
            }));
        }
    }, [options.class]);


    /*
     * Price estimation.
     *
     * We only call the backend once all fields required by
     * PriceEstimateRequest are available.
     */
    const estimatePayload = useMemo(
        () => getEstimatePayload(form),
        [form]
    );


    useEffect(() => {
        if (!estimatePayload) {
            setPriceEstimate(null);
            setEstimateError("");
            return;
        }

        let cancelled = false;

        const timer = setTimeout(async () => {
            setEstimateLoading(true);
            setEstimateError("");

            try {
                const result = await estimatePrice(estimatePayload);

                if (!cancelled) {
                    setPriceEstimate(result);
                }
            } catch (error) {
                if (!cancelled) {
                    setPriceEstimate(null);

                    setEstimateError(
                        error?.message ||
                        t("createListing.errors.priceEstimate")
                    );
                }
            } finally {
                if (!cancelled) {
                    setEstimateLoading(false);
                }
            }
        }, 500);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [estimatePayload]);


    function updateField(name, value) {
        setForm((current) => ({
            ...current,
            [name]: value,
        }));

        setSubmitError("");
        setSubmitSuccess(false);
    }


    function handleNumberChange(name, value) {
        const cleaned = value.replace(/[^\d.,]/g, "");

        updateField(name, cleaned);
    }


    function validateForm() {
        const errors = [];
    
        if (!form.brand) errors.push(t("createListing.validation.brand"));
        if (!form.model) errors.push(t("createListing.validation.model"));
        if (!form.generation) errors.push(t("createListing.validation.generation"));
    
        if (!form.year) errors.push(t("createListing.validation.year"));
        if (!form.mileage) errors.push(t("createListing.validation.mileage"));
    
        if (!form.fuel_type) errors.push(t("createListing.validation.fuel"));
        if (!form.gearbox) errors.push(t("createListing.validation.gearbox"));
        if (!form.body_type) errors.push(t("createListing.validation.bodyType"));
        if (!form.drivetrain) errors.push(t("createListing.validation.drivetrain"));
    
        if (!form.price_eur) {
            errors.push(t("createListing.validation.price"));
        }
    
        if (parseNumber(form.year) === null) {
            errors.push(t("createListing.validation.yearNumber"));
        }
    
        if (parseNumber(form.mileage) === null) {
            errors.push(t("createListing.validation.mileageNumber"));
        }
    
        if (form.price_eur && parseNumber(form.price_eur) === null) {
            errors.push(t("createListing.validation.priceNumber"));
        }
    
        return errors;
    }


    async function handleSubmit(event) {
        event.preventDefault();

        setSubmitError("");
        setSubmitSuccess(false);

        const validationErrors = validateForm();

        if (validationErrors.length > 0) {
            setSubmitError(validationErrors[0]);
            return;
        }

        if (!user) {
            navigate("/login");
            return;
        }

        setSubmitLoading(true);

        try {
            const payload = {
                brand: form.brand || null,
                model: form.model || null,
                generation: form.generation || null,

                price_eur:
                    parseNumber(form.price_eur),

                mileage:
                    parseNumber(form.mileage),

                year:
                    parseNumber(form.year),

                engine:
                    form.engine === ""
                        ? null
                        : parseNumber(form.engine),

                horsepower:
                    form.horsepower === ""
                        ? null
                        : Number(form.horsepower),

                fuel_type: form.fuel_type || null,
                gearbox: form.gearbox || null,
                body_type: form.body_type || null,
                state: form.state || null,
                drivetrain: form.drivetrain || null,

                doors:
                    form.doors === ""
                        ? null
                        : Number(form.doors),

                seats:
                    form.seats === ""
                        ? null
                        : Number(form.seats),

                seller_type:
                    form.seller_type || user?.seller_type || null,

                registration_country:
                    form.registration_country || null,

                same_model: true,

                class:
                    form.class_ || null,
            };

            await createAnalysis(payload);

            setSubmitSuccess(true);

            setTimeout(() => {
                navigate("/my-listings");
            }, 700);
        } catch (error) {
            if (error?.status === 401) {
                navigate("/login");
                return;
            }

            setSubmitError(
                error?.message ||
                t("createListing.errors.createListing")
            );
        } finally {
            setSubmitLoading(false);
        }
    }


    if (authLoading) {
        return (
            <div className="create-listing-loading-page">
                <div className="create-listing-spinner" />
                <p>{t("createListing.loading")}</p>
            </div>
        );
    }


    if (!user) {
        return (
            <Navigate
                to="/login"
                replace
            />
        );
    }


    const estimate =
        priceEstimate?.estimate || null;

    const marketPrice =
        estimate?.market_price;

    const normalMin =
        estimate?.normal?.min;

    const normalMax =
        estimate?.normal?.max;


    return (
        <main className="create-listing-page">

            <BackgroundTriangles />
            <div className="create-listing-container">

                <div className="create-listing-header">

                <button
                    type="button"
                    className="create-listing-back"
                    onClick={() => navigate("/listings")}
                >
                    ← {t("createListing.backToListings")}
                </button>

                <h1>{t("createListing.title")}</h1>

                <p>
                    {t("createListing.description")}
                </p>

                </div>


                {submitError && (
                    <div className="create-listing-alert create-listing-alert-error">
                        {submitError}
                    </div>
                )}


                {submitSuccess && (
                    <div className="create-listing-alert create-listing-alert-success">
                        {t("createListing.success")}
                    </div>
                )}


                <form
                    className="create-listing-form"
                    onSubmit={handleSubmit}
                >

                    {/* VEHICLE */}

                        <section className="create-listing-section">

                            <div className="create-listing-section-header">
                                <h2>{t("createListing.vehicle.title")}</h2>
                                    <p>
                                        {t("createListing.vehicle.description")}
                                    </p>
                            </div>


                            <div className="create-listing-grid">

                                {/* MARCĂ */}

                                <div className="create-listing-field">
                                <label>
                                    {t("createListing.fields.brand")} <span>*</span>
                                </label>

                                    <Autocomplete
                                        value={form.brand}
                                        onChange={(value) => {
                                            setForm((current) => ({
                                                ...current,
                                                brand: value,
                                                model: "",
                                                generation: "",
                                                class_: "",
                                            }));

                                            setSubmitError("");
                                            setSubmitSuccess(false);
                                        }}
                                        onSelect={(value) => {
                                            setForm((current) => ({
                                                ...current,
                                                brand: value,
                                                model: "",
                                                generation: "",
                                                class_: "",
                                            }));

                                            setSubmitError("");
                                            setSubmitSuccess(false);
                                        }}
                                        fetchSuggestions={async (query) => {
                                            try {
                                                const data =
                                                    await getPredictionBrands(query);

                                                return data.brands || [];
                                            } catch (error) {
                                                return [];
                                            }
                                        }}
                                        placeholder={t("createListing.placeholders.brand")}
                                        disabled={optionsLoading}
                                    />
                                </div>


                                {/* MODEL */}

                                <div className="create-listing-field">
                                    <label>
                                        {t("createListing.fields.model")} <span>*</span>
                                    </label>

                                    <Autocomplete
                                        value={form.model}
                                        onChange={(value) => {
                                            setForm((current) => ({
                                                ...current,
                                                model: value,
                                                generation: "",
                                                class_: "",
                                            }));

                                            setSubmitError("");
                                            setSubmitSuccess(false);
                                        }}
                                        onSelect={(value) => {
                                            setForm((current) => ({
                                                ...current,
                                                model: value,
                                                generation: "",
                                                class_: "",
                                            }));

                                            setSubmitError("");
                                            setSubmitSuccess(false);
                                        }}
                                        fetchSuggestions={async (query) => {
                                            if (!form.brand) {
                                                return [];
                                            }

                                            try {
                                                const data =
                                                    await getPredictionModels(
                                                        form.brand,
                                                        query
                                                    );

                                                return data.models || [];
                                            } catch (error) {
                                                return [];
                                            }
                                        }}
                                        placeholder={t("createListing.placeholders.model")}
                                        disabled={!form.brand}
                                    />
                                </div>


                                {/* GENERAȚIE */}

                                <div className="create-listing-field">
                                    <label>
                                        {t("createListing.fields.generation")} <span>*</span>
                                    </label>

                                    <Autocomplete
                                        value={form.generation}
                                        onChange={(value) => {
                                            setForm((current) => ({
                                                ...current,
                                                generation: value,
                                            }));

                                            setSubmitError("");
                                            setSubmitSuccess(false);
                                        }}
                                        onSelect={(value) => {
                                            setForm((current) => ({
                                                ...current,
                                                generation: value,
                                            }));

                                            setSubmitError("");
                                            setSubmitSuccess(false);
                                        }}
                                        fetchSuggestions={async (query) => {
                                            if (!form.brand || !form.model) {
                                                return [];
                                            }

                                            try {
                                                const data =
                                                    await getPredictionGenerations(
                                                        form.brand,
                                                        form.model,
                                                        query
                                                    );

                                                return data.generations || [];
                                            } catch (error) {
                                                return [];
                                            }
                                        }}
                                        placeholder={t("createListing.placeholders.generation")}
                                        disabled={!form.model}
                                    />
                                </div>


                                {/* AN */}

                                <div className="create-listing-field">
                                    <label htmlFor="year">
                                        {t("createListing.fields.year")} <span>*</span>
                                    </label>

                                    <input
                                        id="year"
                                        type="number"
                                        min="1886"
                                        value={form.year}
                                        onChange={(event) =>
                                            handleNumberChange(
                                                "year",
                                                event.target.value
                                            )
                                        }
                                        placeholder={t("createListing.placeholders.year")}
                                    />
                                </div>


                                {/* KILOMETRAJ */}

                                <div className="create-listing-field">
                                    <label htmlFor="mileage">
                                        {t("createListing.fields.mileage")} <span>*</span>
                                    </label>

                                    <input
                                        id="mileage"
                                        type="number"
                                        min="0"
                                        value={form.mileage}
                                        onChange={(event) =>
                                            handleNumberChange(
                                                "mileage",
                                                event.target.value
                                            )
                                        }
                                        placeholder={t("createListing.placeholders.mileage")}
                                    />
                                </div>

                            </div>

                            </section>


                    {/* TECHNICAL INFORMATION */}

                    <section className="create-listing-section">

                        <div className="create-listing-section-header">
                            <h2>{t("createListing.technical.title")}</h2>
                                <p>
                                    {t("createListing.technical.description")}
                                </p>
                        </div>


                        <div className="create-listing-grid">

                            <div className="create-listing-field">
                                <label htmlFor="fuel_type">
                                    {t("createListing.fields.fuelType")} <span>*</span>
                                </label>

                                <select
                                    id="fuel_type"
                                    value={form.fuel_type}
                                    onChange={(event) =>
                                        updateField(
                                            "fuel_type",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectFuel")}
                                    </option>

                                    {options.fuel_type.map((value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </div>


                            <div className="create-listing-field">
                            <label htmlFor="engine">
                                {t("createListing.fields.engine")}
                            </label>

                                <select
                                    id="engine"
                                    value={form.engine}
                                    onChange={(event) =>
                                        updateField(
                                            "engine",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectEngine")}
                                    </option>

                                    {options.engine.map((value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="gearbox">
                                    {t("createListing.fields.gearbox")} <span>*</span>
                                </label>

                                <select
                                    id="gearbox"
                                    value={form.gearbox}
                                    onChange={(event) =>
                                        updateField(
                                            "gearbox",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectGearbox")}
                                    </option>

                                    {options.gearbox.map((value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="drivetrain">
                                    {t("createListing.fields.drivetrain")} <span>*</span>
                                </label>

                                <select
                                    id="drivetrain"
                                    value={form.drivetrain}
                                    onChange={(event) =>
                                        updateField(
                                            "drivetrain",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectDrivetrain")}
                                    </option>

                                    {options.drivetrain.map((value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="body_type">
                                    {t("createListing.fields.bodyType")} <span>*</span>
                                </label>

                                <select
                                    id="body_type"
                                    value={form.body_type}
                                    onChange={(event) =>
                                        updateField(
                                            "body_type",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectBodyType")}
                                    </option>

                                    {options.body_type.map((value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="horsepower">
                                    {t("createListing.fields.horsepower")}
                                </label>

                                <input
                                    id="horsepower"
                                    type="number"
                                    min="0"
                                    value={form.horsepower}
                                    onChange={(event) =>
                                        handleNumberChange(
                                            "horsepower",
                                            event.target.value
                                        )
                                    }
                                    placeholder={t("createListing.placeholders.horsepower")}
                                />
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="doors">
                                    {t("createListing.fields.doors")}
                                </label>

                                <input
                                    id="doors"
                                    type="number"
                                    min="0"
                                    value={form.doors}
                                    onChange={(event) =>
                                        handleNumberChange(
                                            "doors",
                                            event.target.value
                                        )
                                    }
                                    placeholder={t("createListing.placeholders.doors")}
                                />
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="seats">
                                    {t("createListing.fields.seats")}
                                </label>

                                <input
                                    id="seats"
                                    type="number"
                                    min="0"
                                    value={form.seats}
                                    onChange={(event) =>
                                        handleNumberChange(
                                            "seats",
                                            event.target.value
                                        )
                                    }
                                    placeholder={t("createListing.placeholders.seats")}
                                />
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="state">
                                    {t("createListing.fields.state")}
                                </label>

                                <select
                                    id="state"
                                    value={form.state}
                                    onChange={(event) =>
                                        updateField(
                                            "state",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="Used">
                                        {t("createListing.state.used")}
                                    </option>

                                    <option value="New">
                                        {t("createListing.state.new")}
                                    </option>

                                    <option value="Damaged">
                                        {t("createListing.state.damaged")}
                                    </option>
                                </select>
                            </div>

                        </div>

                    </section>


                    {/* SELLER */}

                    <section className="create-listing-section">

                        <div className="create-listing-section-header">
                            <h2>{t("createListing.seller.title")}</h2>
                                <p>
                                    {t("createListing.seller.description")}
                                </p>
                        </div>


                        <div className="create-listing-grid">

                            <div className="create-listing-field">
                                <label htmlFor="seller_type">
                                    {t("createListing.fields.sellerType")}
                                </label>

                                <select
                                    id="seller_type"
                                    value={form.seller_type}
                                    onChange={(event) =>
                                        updateField(
                                            "seller_type",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectSeller")}
                                    </option>

                                    <option value="private">
                                        {t("createListing.seller.private")}
                                    </option>

                                    <option value="dealer">
                                        {t("createListing.seller.dealer")}
                                    </option>
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="registration_country">
                                    {t("createListing.fields.registrationCountry")}
                                </label>

                                <select
                                    id="registration_country"
                                    value={form.registration_country}
                                    onChange={(event) =>
                                        updateField(
                                            "registration_country",
                                            event.target.value
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectCountry")}
                                    </option>

                                    <option value="Moldova">
                                        {t("createListing.countries.moldova")}
                                    </option>

                                    <option value="Germany">
                                        {t("createListing.countries.germany")}
                                    </option>

                                    <option value="Romania">
                                        {t("createListing.countries.romania")}
                                    </option>

                                    <option value="France">
                                        {t("createListing.countries.france")}
                                    </option>

                                    <option value="Italy">
                                        {t("createListing.countries.italy")}
                                    </option>

                                    <option value="Other">
                                        {t("createListing.countries.other")}
                                    </option>
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="class">
                                    {t("createListing.fields.vehicleClass")}
                                </label>

                                <select
                                    id="class"
                                    value={form.class_}
                                    onChange={(event) =>
                                        updateField(
                                            "class_",
                                            event.target.value
                                        )
                                    }
                                    disabled={
                                        !form.model ||
                                        options.class.length === 0
                                    }
                                >
                                    <option value="">
                                        {t("createListing.placeholders.selectClass")}
                                    </option>

                                    {options.class.map((value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {value}
                                        </option>
                                    ))}
                                </select>
                            </div>

                        </div>

                    </section>


                    {/* PRICE */}

                    <section className="create-listing-section create-listing-price-section">

                        <div className="create-listing-section-header">
                            <h2>{t("createListing.price.title")}</h2>
                                <p>
                                    {t("createListing.price.description")}
                                </p>
                        </div>


                        <div className="create-listing-price-layout">

                            <div className="create-listing-price-input-area">

                                <label htmlFor="price_eur">
                                    {t("createListing.fields.askingPrice")} <span>*</span>
                                </label>

                                <div className="create-listing-price-input-wrapper">
                                    <span>€</span>

                                    <input
                                        id="price_eur"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={form.price_eur}
                                        onChange={(event) =>
                                            handleNumberChange(
                                                "price_eur",
                                                event.target.value
                                            )
                                        }
                                        placeholder={t("createListing.placeholders.price")}
                                    />
                                </div>

                            </div>


                            <div className="create-listing-estimate-card">

                                <div className="create-listing-estimate-title">
                                {t("createListing.price.marketRecommended")}
                                </div>


                                {estimateLoading ? (
                                    <div className="create-listing-estimate-loading">
                                        <div className="create-listing-small-spinner" />
                                        <span>
                                        {t("createListing.price.calculating")}
                                        </span>
                                    </div>
                                ) : estimate ? (

                                    <>
                                        <div className="create-listing-market-price">
                                            €{formatPrice(marketPrice)}
                                        </div>

                                        <div className="create-listing-normal-range">
                                            <span>
                                            {t("createListing.price.normalRange")}
                                            </span>

                                            <strong>
                                                €{formatPrice(normalMin)}
                                                {" – "}
                                                €{formatPrice(normalMax)}
                                            </strong>
                                        </div>

                                        {priceEstimate?.comparison?.message && (
                                            <p className="create-listing-estimate-message">
                                                {priceEstimate.comparison.message}
                                            </p>
                                        )}
                                    </>

                                ) : estimateError ? (

                                    <div className="create-listing-estimate-error">
                                        {estimateError}
                                    </div>

                                ) : (

                                    <div className="create-listing-estimate-placeholder">
                                        {t("createListing.price.completeRequired")}
                                    </div>

                                )}

                            </div>

                        </div>

                    </section>


                    {/* SUBMIT */}

                    <div className="create-listing-submit-area">

                        <button
                            type="button"
                            className="create-listing-cancel-button"
                            onClick={() => navigate("/listings")}
                            disabled={submitLoading}
                        >
                            {t("createListing.cancel")}
                        </button>


                        <button
                            type="submit"
                            className="create-listing-submit-button"
                            disabled={submitLoading}
                        >
                            {submitLoading ? (
                                    <>
                                        <span className="create-listing-button-spinner" />
                                        {t("createListing.creating")}
                                    </>
                                ) : (
                                    <>
                                        {t("createListing.createButton")}
                                    </>
                                )}
                        </button>

                    </div>

                </form>

            </div>

        </main>
    );
}
