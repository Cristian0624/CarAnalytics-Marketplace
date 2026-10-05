import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import { getListingOptions } from "../api/listings";
import { estimatePrice } from "../api/price_estimate";
import { priceEstimateErrorMessage, priceEstimateMileageBounds, priceEstimateYearBounds } from "../utils/priceEstimate";
import { assessmentValidationMessage, clearInputValidity, localizeInputValidity } from "../utils/assessmentErrors";
import { createAnalysis } from "../api/analysis";

import Autocomplete from "../components/Autocomplete";
import BackgroundTriangles from "../components/BackgroundTriangles";
import {
    getPredictionBrands,
    getPredictionModels,
    getPredictionGenerations,
} from "../api/predictions";

import "./CreateListingPage.css";


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

        ...priceEstimateYearBounds(year),

        ...priceEstimateMileageBounds(),
    };
}


export default function CreateListingPage() {
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();

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
                    setSubmitError("Opțiunile pentru mașină nu au putut fi încărcate. Încearcă din nou.");
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

                    setEstimateError(priceEstimateErrorMessage(error));
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

        if (!form.brand) errors.push("Selectează marca.");
        if (!form.model) errors.push("Selectează modelul.");
        if (!form.generation) errors.push("Selectează generația.");

        if (!form.year) errors.push("Completează anul de fabricație.");
        if (!form.mileage) errors.push("Completează kilometrajul.");

        if (!form.fuel_type) errors.push("Selectează combustibilul.");
        if (!form.gearbox) errors.push("Selectează cutia de viteze.");
        if (!form.body_type) errors.push("Selectează caroseria.");
        if (!form.drivetrain) errors.push("Selectează tracțiunea.");

        if (!form.price_eur) {
            errors.push("Completează prețul cerut.");
        }

        if (parseNumber(form.year) === null) {
            errors.push("Introdu un an de fabricație valid.");
        }

        if (parseNumber(form.mileage) === null) {
            errors.push("Introdu un kilometraj valid.");
        }

        if (form.price_eur && parseNumber(form.price_eur) === null) {
            errors.push("Introdu un preț valid.");
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
                assessmentValidationMessage(error?.detail) ||
                "Anunțul nu a putut fi creat. Încearcă din nou."
            );
        } finally {
            setSubmitLoading(false);
        }
    }


    if (authLoading) {
        return (
            <div className="create-listing-loading-page">
                <div className="create-listing-spinner" />
                <p>Loading...</p>
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
                        ← Înapoi la anunțuri
                    </button>

                    <h1>Creează un anunț</h1>

                    <p>
                        
Introdu detaliile vehiculului și vezi prețul estimat de piață înainte de a salva anunțul.
                    </p>

                </div>


                {submitError && (
                    <div className="create-listing-alert create-listing-alert-error">
                        {submitError}
                    </div>
                )}


                {submitSuccess && (
                    <div className="create-listing-alert create-listing-alert-success">
                        Anunțul a fost creat cu succes.
                    </div>
                )}


                <form
                    className="create-listing-form"
                    onSubmit={handleSubmit}
                    onInvalid={localizeInputValidity}
                    onInput={clearInputValidity}
                >

                    {/* VEHICLE */}

                        <section className="create-listing-section">

                            <div className="create-listing-section-header">
                                <h2>Vehicul</h2>
                                <p>
                                    Selectează marca, modelul și generația vehiculului.
                                </p>
                            </div>


                            <div className="create-listing-grid">

                                {/* MARCĂ */}

                                <div className="create-listing-field">
                                    <label>
                                        Marcă <span>*</span>
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
                                        placeholder="ex. BMW"
                                        disabled={optionsLoading}
                                    />
                                </div>


                                {/* MODEL */}

                                <div className="create-listing-field">
                                    <label>
                                        Model <span>*</span>
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
                                        placeholder="ex. Seria 3"
                                        disabled={!form.brand}
                                    />
                                </div>


                                {/* GENERAȚIE */}

                                <div className="create-listing-field">
                                    <label>
                                        Generație <span>*</span>
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
                                        placeholder="ex. G20"
                                        disabled={!form.model}
                                    />
                                </div>


                                {/* AN */}

                                <div className="create-listing-field">
                                    <label htmlFor="year">
                                        An <span>*</span>
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
                                        placeholder="ex. 2020"
                                    />
                                </div>


                                {/* KILOMETRAJ */}

                                <div className="create-listing-field">
                                    <label htmlFor="mileage">
                                        Kilometraj (km) <span>*</span>
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
                                        placeholder="ex. 85000"
                                    />
                                </div>

                            </div>

                            </section>


                    {/* TECHNICAL INFORMATION */}

                    <section className="create-listing-section">

                        <div className="create-listing-section-header">
                            <h2>Informații tehnice</h2>
                            <p>
                            Adaugă principalele caracteristici tehnice ale vehiculului.
                            </p>
                        </div>


                        <div className="create-listing-grid">

                            <div className="create-listing-field">
                                <label htmlFor="fuel_type">
                                Tip combustibil<span>*</span>
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
                                    Selectează tipul de combustibil
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
                                Motor
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
                                    Selectează motorul
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
                                Cutie de viteze <span>*</span>
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
                                    Selectează cutia de viteze
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
                                Tracțiune <span>*</span>
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
                                    Selectează tracțiunea
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
                                Caroserie <span>*</span>
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
                                    Selectează caroseria
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
                                Cai putere
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
                                    placeholder="e.g. 150"
                                />
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="doors">
                                Număr de uși
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
                                    placeholder="e.g. 4"
                                />
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="seats">
                                Număr de locuri
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
                                    placeholder="e.g. 5"
                                />
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="state">
                                Stare
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
                                    Uzat
                                    </option>
                                    <option value="New">
                                    Nou
                                    </option>
                                    <option value="Damaged">
                                    Necesită reparații
                                    </option>
                                </select>
                            </div>

                        </div>

                    </section>


                    {/* SELLER */}

                    <section className="create-listing-section">

                        <div className="create-listing-section-header">
                            <h2>Informații despre vânzător</h2>
                            <p>
                            Informații despre vânzător și înmatricularea vehiculului.
                            </p>
                        </div>


                        <div className="create-listing-grid">

                            <div className="create-listing-field">
                                <label htmlFor="seller_type">
                                Tip vânzător
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
                                    Selectează tipul vânzătorului
                                    </option>

                                    <option value="private">
                                        Persoană fizică
                                    </option>

                                    <option value="dealer">
                                        Dealer auto
                                    </option>
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="registration_country">
                                Țara de înmatriculare
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
                                    Selectează țara
                                    </option>

                                    <option value="Moldova">
                                        Moldova
                                    </option>

                                    <option value="Germany">
                                        Germania
                                    </option>

                                    <option value="Romania">
                                        România
                                    </option>

                                    <option value="France">
                                        Franța
                                    </option>

                                    <option value="Italy">
                                        Italia
                                    </option>

                                    <option value="Other">
                                        Alta
                                    </option>
                                </select>
                            </div>


                            <div className="create-listing-field">
                                <label htmlFor="class">
                                Clasa vehiculului
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
                                    Selectează clasa
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
                            <h2>Preț</h2>
                            <p>
                            Introdu prețul solicitat pentru vehicul.
                            </p>
                        </div>


                        <div className="create-listing-price-layout">

                            <div className="create-listing-price-input-area">

                                <label htmlFor="price_eur">
                                Prețul solicitat (€) <span>*</span>
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
                                        placeholder="Introdu prețul"
                                    />
                                </div>

                            </div>


                            <div className="create-listing-estimate-card">

                                <div className="create-listing-estimate-title">
                                Preț recomandat de piață
                                </div>


                                {estimateLoading ? (
                                    <div className="create-listing-estimate-loading">
                                        <div className="create-listing-small-spinner" />
                                        <span>
                                        Se calculează recomandarea...
                                        </span>
                                    </div>
                                ) : estimate ? (

                                    <>
                                        <div className="create-listing-market-price">
                                            €{formatPrice(marketPrice)}
                                        </div>

                                        <div className="create-listing-normal-range">
                                            <span>
                                            Interval normal de preț
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

                                ) : priceEstimate && !priceEstimate.estimate_available ? (

                                    <div className="create-listing-estimate-placeholder">
                                        {priceEstimate.comparison.message}
                                    </div>

                                ) : (

                                    <div className="create-listing-estimate-placeholder">
                                        Completează informațiile obligatorii
                                        despre vehicul pentru a vedea prețul
                                        recomandat de piață.
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
                            Cancel
                        </button>


                        <button
                            type="submit"
                            className="create-listing-submit-button"
                            disabled={submitLoading}
                        >
                            {submitLoading ? (
                                <>
                                    <span className="create-listing-button-spinner" />
                                    Se creează...
                                </>
                            ) : (
                                <>
                                    Creează un anunț
                                </>
                            )}
                        </button>

                    </div>

                </form>

            </div>

        </main>
    );
}
