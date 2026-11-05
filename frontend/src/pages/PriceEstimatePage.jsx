import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { estimatePrice, estimatePriceFromUrl } from "../api/price_estimate";
import {
  priceEstimateComparisonMessage,
  priceEstimateErrorMessage,
  priceEstimateMileageBounds,
  priceEstimateYearBounds,
} from "../utils/priceEstimate";
import { resolveVehicleOption, translateVehicleValue } from "../utils/anomalyRisk";
import { clearInputValidity, localizeInputValidity } from "../utils/assessmentErrors";
import Autocomplete from "../components/Autocomplete";
import useVehicleOptions from "../hooks/useVehicleOptions";
import "./AnomalyRiskPage.css";
import "./HomePage.css";

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }

  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function parseNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(
    String(value).replace(/\s/g, "").replace(",", ".")
  );

  return Number.isFinite(number) ? number : null;
}

const INITIAL_ESTIMATOR = {
  brand: "",
  model: "",
  generation: "",
  year: "",
  mileage: "",
  engine: "",
  fuel_type: "",
  gearbox: "",
  drivetrain: "",
  body_type: "",
};

const EMPTY_OPTIONS = {
  fuel_type: [],
  engine: [],
  gearbox: [],
  drivetrain: [],
  body_type: [],
};

export default function PriceEstimatePage() {
  const { t } = useTranslation();
  const [inputMode, setInputMode] = useState("url");
  const [urlInput, setUrlInput] = useState("");
  const [extractedVehicle, setExtractedVehicle] = useState(null);
  const [estimator, setEstimator] = useState({ ...INITIAL_ESTIMATOR });
  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);

  const requestRef = useRef(null);
  const resultRef = useRef(null);

  const brandRequest = useVehicleOptions();
  const options = brandRequest.data ?? EMPTY_OPTIONS;
  const brands = options.brand ?? [];
  const selectedBrand = resolveVehicleOption(brands, estimator.brand);
  const modelRequest = useVehicleOptions(selectedBrand, undefined, Boolean(selectedBrand));
  const models = modelRequest.data?.model ?? [];
  const selectedModel = selectedBrand ? resolveVehicleOption(models, estimator.model) : null;
  const generationRequest = useVehicleOptions(
    selectedBrand,
    selectedModel,
    Boolean(selectedBrand && selectedModel)
  );
  const generations = generationRequest.data?.generation ?? [];
  const selectedGeneration = resolveVehicleOption(generations, estimator.generation);

  const fieldRefs = {
    brand: useRef(null),
    model: useRef(null),
    generation: useRef(null),
    year: useRef(null),
    mileage: useRef(null),
    fuel_type: useRef(null),
    engine: useRef(null),
    gearbox: useRef(null),
    drivetrain: useRef(null),
    body_type: useRef(null),
  };

  useEffect(() => {
    window.scrollTo({ top: 0 });
    return () => requestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (estimate) resultRef.current?.focus();
  }, [estimate]);

  useEffect(() => {
    let ticking = false;

    function updateScrollProgress() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const documentHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const progress =
        documentHeight > 0
          ? Math.min(1, Math.max(0, scrollTop / documentHeight))
          : 0;
      const progressCircle = document.querySelector(".scroll-top-ring-progress");
      if (progressCircle) {
        const circumference = 150.8;
        progressCircle.style.strokeDashoffset = circumference * (1 - progress);
      }
      setShowScrollTop(scrollTop > 300);
      ticking = false;
    }

    function handleScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollProgress);
        ticking = true;
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    updateScrollProgress();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function focusNextField(currentField) {
    const order = [
      "brand",
      "model",
      "generation",
      "year",
      "mileage",
      "fuel_type",
      "engine",
      "gearbox",
      "drivetrain",
      "body_type",
    ];
    const currentIndex = order.indexOf(currentField);
    const nextField = order[currentIndex + 1];
    if (!nextField) return;
    requestAnimationFrame(() => {
      const element = fieldRefs[nextField]?.current;
      if (element) {
        element.focus();
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  function updateEstimator(name, value, moveNext = false) {
    const brandChanged =
      name === "brand" && resolveVehicleOption(brands, value) !== selectedBrand;
    const modelChanged =
      name === "model" && resolveVehicleOption(models, value) !== selectedModel;

    setEstimator((current) => ({
      ...current,
      [name]: value,
      ...(brandChanged
        ? { model: "", generation: "" }
        : modelChanged
          ? { generation: "" }
          : {}),
    }));

    setEstimate(null);
    setEstimateError("");

    if (moveNext && value) {
      focusNextField(name);
    }
  }

  async function handleEstimateUrl(event) {
    event.preventDefault();
    if (requestRef.current) return;
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      setEstimateError(t("risk.urlAnalyzer.errors.empty"));
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
      60000
    );

    setEstimateLoading(true);
    setEstimateError("");
    setEstimate(null);
    setExtractedVehicle(null);

    try {
      const response = await estimatePriceFromUrl(trimmedUrl, controller.signal);
      if (!controller.signal.aborted && response) {
        const v = response.vehicle;
        setEstimator({
          brand: v.brand ?? "",
          model: v.model ?? "",
          generation: v.generation ?? "",
          year: v.year != null ? String(v.year) : "",
          mileage: v.mileage != null ? String(v.mileage) : "",
          engine: v.engine != null ? String(v.engine) : "",
          fuel_type: v.fuel_type ?? "",
          gearbox: v.gearbox ?? "",
          drivetrain: v.drivetrain ?? "",
          body_type: v.body_type ?? "",
        });
        setExtractedVehicle(v);
        setEstimate(response.estimate);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        if (typeof err.detail === "string" && [404, 422, 502].includes(err.status)) {
          setEstimateError(err.detail);
        } else {
          setEstimateError(priceEstimateErrorMessage(err, t));
        }
      }
    } finally {
      clearTimeout(timeout);
      requestRef.current = null;
      setEstimateLoading(false);
    }
  }

  async function handleEstimateManual(event) {
    event.preventDefault();
    if (requestRef.current) return;

    const year = parseNumber(estimator.year);
    const mileage = parseNumber(estimator.mileage);

    if (
      !selectedBrand ||
      !selectedModel ||
      !selectedGeneration ||
      year === null ||
      mileage === null ||
      !estimator.fuel_type ||
      !estimator.gearbox ||
      !estimator.drivetrain ||
      !estimator.body_type
    ) {
      setEstimateError(t("home.estimator.errors.required"));
      setEstimate(null);
      return;
    }

    const engine =
      estimator.engine === "" ? null : parseNumber(estimator.engine);

    const payload = {
      brand: selectedBrand,
      model: selectedModel,
      generation: selectedGeneration,
      year,
      mileage,
      fuel_type: estimator.fuel_type,
      engine,
      gearbox: estimator.gearbox,
      drivetrain: estimator.drivetrain,
      body_type: estimator.body_type,
      ...priceEstimateYearBounds(year),
      ...priceEstimateMileageBounds(),
    };

    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(
      () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
      60000
    );

    setEstimateLoading(true);
    setEstimateError("");
    setEstimate(null);

    try {
      const result = await estimatePrice(payload, controller.signal);
      if (!controller.signal.aborted) {
        setEstimate(result);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        setEstimateError(priceEstimateErrorMessage(error, t));
      }
    } finally {
      clearTimeout(timeout);
      requestRef.current = null;
      setEstimateLoading(false);
    }
  }

  function handleReset() {
    setUrlInput("");
    setExtractedVehicle(null);
    setEstimator({ ...INITIAL_ESTIMATOR });
    setEstimate(null);
    setEstimateError("");
  }

  const triangles = [
    { id: 1, side: "left", top: "5%", size: 120, color: "#17202A", delay: "-0s", rot: 15, offset: "-30px" },
    { id: 2, side: "left", top: "25%", size: 80, color: "#14B8A6", delay: "-2s", rot: -45, offset: "10px" },
    { id: 3, side: "left", top: "45%", size: 150, color: "#CBD5E1", delay: "-4s", rot: 30, offset: "-40px" },
    { id: 4, side: "left", top: "65%", size: 90, color: "#17202A", delay: "-1s", rot: 75, offset: "20px" },
    { id: 5, side: "left", top: "85%", size: 110, color: "#14B8A6", delay: "-3s", rot: -15, offset: "-20px" },
    { id: 6, side: "right", top: "10%", size: 100, color: "#CBD5E1", delay: "-1.5s", rot: 60, offset: "-20px" },
    { id: 7, side: "right", top: "30%", size: 130, color: "#17202A", delay: "-3.5s", rot: -30, offset: "10px" },
    { id: 8, side: "right", top: "50%", size: 90, color: "#14B8A6", delay: "-0.5s", rot: 45, offset: "-15px" },
    { id: 9, side: "right", top: "70%", size: 140, color: "#CBD5E1", delay: "-2.5s", rot: -60, offset: "-30px" },
    { id: 10, side: "right", top: "90%", size: 85, color: "#17202A", delay: "-4.5s", rot: 15, offset: "5px" },
  ];

  return (
    <>
      <div className="background-shapes">
        {triangles.map((tri) => (
          <svg
            key={tri.id}
            className="floating-shape"
            style={{
              width: tri.size,
              height: tri.size,
              color: tri.color,
              top: tri.top,
              [tri.side]: tri.offset,
              animationDelay: tri.delay,
              "--rot": `${tri.rot}deg`,
            }}
            viewBox="-20 -20 140 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polygon
              points="50,0 100,100 0,100"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="30"
              strokeLinejoin="round"
            />
          </svg>
        ))}
      </div>

      <main className="risk-page">
        <div className="risk-container">
          <header className="risk-heading">
            <h1>{t("home.estimator.title")}</h1>
            <p>{t("home.estimator.description")}</p>
          </header>

          <ol className="risk-steps">
            {[0, 1, 2].map((index) => (
              <li key={index}>
                <span className="risk-step-number" aria-hidden="true">
                  {index + 1}
                </span>
                {t(
                  inputMode === "url"
                    ? `priceEstimator.urlSteps.${index}`
                    : `priceEstimator.steps.${index}`
                )}
              </li>
            ))}
          </ol>

          <p className="risk-crosslink">
            {t("home.estimator.riskCtaPrefix")}{" "}
            <Link to="/anomaly-risk">{t("home.estimator.riskCtaLink")}</Link>
          </p>

          <div
            className="risk-mode-switcher"
            role="tablist"
            aria-label={t("home.estimator.title")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === "url"}
              className={`risk-mode-tab ${inputMode === "url" ? "active" : ""}`}
              onClick={() => {
                setInputMode("url");
                setEstimateError("");
              }}
            >
              <img src="/999-logo.png" alt="" className="risk-mode-tab-icon" />
              <span>{t("risk.modes.url")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === "manual"}
              className={`risk-mode-tab ${inputMode === "manual" ? "active" : ""}`}
              onClick={() => {
                setInputMode("manual");
                setEstimateError("");
              }}
            >
              <span>{t("risk.modes.manual")}</span>
            </button>
          </div>

          {inputMode === "url" ? (
            <form
              className="risk-form risk-url-form"
              onSubmit={handleEstimateUrl}
              onInvalid={(event) => localizeInputValidity(event, t)}
              onInput={clearInputValidity}
              aria-busy={estimateLoading}
            >
              <div className="risk-form-heading">
                <div>
                  <h2>{t("priceEstimator.urlAnalyzer.title")}</h2>
                  <p>{t("priceEstimator.urlAnalyzer.description")}</p>
                </div>
                <span>* {t("risk.required")}</span>
              </div>

              <fieldset disabled={estimateLoading}>
                <div className="risk-url-input-group">
                  <label htmlFor="price-estimate-url-input">
                    {t("risk.urlAnalyzer.label")} *
                  </label>
                  <div className="risk-url-input-row">
                    <input
                      id="price-estimate-url-input"
                      name="url"
                      type="url"
                      required
                      placeholder={t("risk.urlAnalyzer.placeholder")}
                      value={urlInput}
                      onChange={(e) => {
                        setUrlInput(e.target.value);
                        setEstimateError("");
                      }}
                    />
                    <button className="risk-submit" type="submit">
                      {estimateLoading
                        ? t("priceEstimator.urlAnalyzer.analyzing")
                        : t("priceEstimator.urlAnalyzer.analyze")}
                    </button>
                  </div>
                </div>

                <p className="risk-form-note">{t("risk.urlAnalyzer.note")}</p>

                <div className="risk-actions">
                  <button
                    className="risk-reset"
                    type="button"
                    onClick={handleReset}
                  >
                    {t("risk.reset")}
                  </button>

                  {extractedVehicle && (
                    <button
                      type="button"
                      className="risk-edit-manual-btn"
                      onClick={() => setInputMode("manual")}
                    >
                      {t("risk.urlAnalyzer.editManual")}
                    </button>
                  )}
                </div>
              </fieldset>

              {extractedVehicle && (
                <div className="risk-extracted-card">
                  <div className="risk-extracted-header">
                    <div className="risk-extracted-title-wrap">
                      <span
                        className={`risk-source-badge risk-source-${extractedVehicle.source}`}
                      >
                        {extractedVehicle.source === "database"
                          ? t("risk.urlAnalyzer.sourceDatabase")
                          : t("risk.urlAnalyzer.sourceLive")}
                      </span>
                      <h3>
                        {extractedVehicle.brand} {extractedVehicle.model}
                        {extractedVehicle.generation
                          ? ` · ${extractedVehicle.generation}`
                          : ""}
                      </h3>
                    </div>
                    <a
                      href={extractedVehicle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="risk-extracted-link"
                    >
                      {t("risk.urlAnalyzer.openAd")}
                    </a>
                  </div>

                  <div className="risk-extracted-chips">
                    <span className="risk-extracted-chip risk-extracted-chip-price">
                      <strong>
                        {Number(extractedVehicle.price).toLocaleString()} €
                      </strong>
                      {extractedVehicle.original_currency &&
                        extractedVehicle.original_currency.toUpperCase() !==
                          "EUR" &&
                        extractedVehicle.original_price != null && (
                          <small>
                            (
                            {Number(
                              extractedVehicle.original_price
                            ).toLocaleString()}{" "}
                            {extractedVehicle.original_currency})
                          </small>
                        )}
                    </span>
                    {extractedVehicle.year && (
                      <span className="risk-extracted-chip">
                        {t("risk.year")}: <strong>{extractedVehicle.year}</strong>
                      </span>
                    )}
                    {extractedVehicle.mileage != null && (
                      <span className="risk-extracted-chip">
                        {t("risk.mileage")}:{" "}
                        <strong>
                          {Number(extractedVehicle.mileage).toLocaleString()} km
                        </strong>
                      </span>
                    )}
                    {extractedVehicle.engine != null && (
                      <span className="risk-extracted-chip">
                        {t("risk.engine")}:{" "}
                        <strong>{extractedVehicle.engine} L</strong>
                      </span>
                    )}
                    {extractedVehicle.fuel_type && (
                      <span className="risk-extracted-chip">
                        {t("risk.fuel")}:{" "}
                        <strong>
                          {translateVehicleValue(
                            t,
                            "fuel_type",
                            extractedVehicle.fuel_type
                          )}
                        </strong>
                      </span>
                    )}
                    {extractedVehicle.gearbox && (
                      <span className="risk-extracted-chip">
                        {t("risk.gearbox")}:{" "}
                        <strong>
                          {translateVehicleValue(
                            t,
                            "gearbox",
                            extractedVehicle.gearbox
                          )}
                        </strong>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {(estimateError || brandRequest.error) && (
                <p className="risk-error" role="alert">
                  {estimateError || t("home.estimator.errors.options")}
                </p>
              )}

              {estimateLoading && (
                <p className="risk-loading" role="status">
                  {t("priceEstimator.urlAnalyzer.loading")}
                </p>
              )}
            </form>
          ) : (
            <form
              className="risk-form"
              onSubmit={handleEstimateManual}
              onInvalid={(event) => localizeInputValidity(event, t)}
              onInput={clearInputValidity}
              aria-busy={estimateLoading}
            >
              <div className="risk-form-heading">
                <div>
                  <h2>{t("risk.aboutCar")}</h2>
                  <p>{t("priceEstimator.manualDescription")}</p>
                </div>
                <span>* {t("risk.required")}</span>
              </div>

              <fieldset disabled={estimateLoading}>
                <div className="home-estimator-form">
                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.brand")} *</label>
                    <Autocomplete
                      inputRef={fieldRefs.brand}
                      value={estimator.brand}
                      onChange={(value) => updateEstimator("brand", value)}
                      onSelect={(value) => updateEstimator("brand", value, true)}
                      options={brands}
                      loading={brandRequest.loading}
                      error={brandRequest.error}
                      label={t("home.estimator.fields.brand")}
                      placeholder={t("home.estimator.placeholders.brand")}
                    />
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.model")} *</label>
                    <Autocomplete
                      inputRef={fieldRefs.model}
                      value={estimator.model}
                      onChange={(value) => updateEstimator("model", value)}
                      onSelect={(value) => updateEstimator("model", value, true)}
                      key={`model/${selectedBrand}`}
                      options={models}
                      loading={modelRequest.loading}
                      error={modelRequest.error}
                      label={t("home.estimator.fields.model")}
                      placeholder={t("home.estimator.placeholders.model")}
                      disabled={!selectedBrand}
                    />
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.generation")} *</label>
                    <Autocomplete
                      inputRef={fieldRefs.generation}
                      value={estimator.generation}
                      onChange={(value) => updateEstimator("generation", value)}
                      onSelect={(value) =>
                        updateEstimator("generation", value, true)
                      }
                      key={`generation/${selectedBrand}/${selectedModel}`}
                      options={generations}
                      loading={generationRequest.loading}
                      error={generationRequest.error}
                      label={t("home.estimator.fields.generation")}
                      placeholder={t("home.estimator.placeholders.generation")}
                      disabled={!selectedBrand || !selectedModel}
                    />
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.year")} *</label>
                    <input
                      ref={fieldRefs.year}
                      type="number"
                      min="1886"
                      value={estimator.year}
                      onChange={(event) =>
                        updateEstimator("year", event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && estimator.year) {
                          event.preventDefault();
                          focusNextField("year");
                        }
                      }}
                      placeholder={t("home.estimator.placeholders.year")}
                    />
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.mileage")} *</label>
                    <input
                      ref={fieldRefs.mileage}
                      type="number"
                      min="0"
                      value={estimator.mileage}
                      onChange={(event) =>
                        updateEstimator("mileage", event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && estimator.mileage) {
                          event.preventDefault();
                          focusNextField("mileage");
                        }
                      }}
                      placeholder={t("home.estimator.placeholders.mileage")}
                    />
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.fuel")} *</label>
                    <select
                      ref={fieldRefs.fuel_type}
                      value={estimator.fuel_type}
                      onChange={(event) =>
                        updateEstimator("fuel_type", event.target.value, true)
                      }
                    >
                      <option value="">{t("home.estimator.select")}</option>
                      {options.fuel_type.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.engine")}</label>
                    <select
                      ref={fieldRefs.engine}
                      value={estimator.engine}
                      onChange={(event) =>
                        updateEstimator("engine", event.target.value, true)
                      }
                    >
                      <option value="">{t("home.estimator.select")}</option>
                      {options.engine.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.gearbox")} *</label>
                    <select
                      ref={fieldRefs.gearbox}
                      value={estimator.gearbox}
                      onChange={(event) =>
                        updateEstimator("gearbox", event.target.value, true)
                      }
                    >
                      <option value="">{t("home.estimator.select")}</option>
                      {options.gearbox.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.drivetrain")} *</label>
                    <select
                      ref={fieldRefs.drivetrain}
                      value={estimator.drivetrain}
                      onChange={(event) =>
                        updateEstimator("drivetrain", event.target.value, true)
                      }
                    >
                      <option value="">{t("home.estimator.select")}</option>
                      {options.drivetrain.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="home-estimator-field">
                    <label>{t("home.estimator.fields.body")} *</label>
                    <select
                      ref={fieldRefs.body_type}
                      value={estimator.body_type}
                      onChange={(event) =>
                        updateEstimator("body_type", event.target.value, true)
                      }
                    >
                      <option value="">{t("home.estimator.select")}</option>
                      {options.body_type.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="risk-actions">
                  <button
                    type="submit"
                    className="risk-submit"
                    disabled={estimateLoading}
                  >
                    {estimateLoading
                      ? t("home.estimator.actions.calculating")
                      : t("home.estimator.actions.estimate")}
                  </button>

                  <button
                    className="risk-reset"
                    type="button"
                    onClick={handleReset}
                  >
                    {t("risk.reset")}
                  </button>
                </div>
              </fieldset>

              {(estimateError || brandRequest.error) && (
                <p className="risk-error" role="alert">
                  {estimateError || t("home.estimator.errors.options")}
                </p>
              )}
            </form>
          )}

          {estimate ? (
            <div ref={resultRef} tabIndex={-1} className="risk-result-focus">
              {estimate.estimate_available && estimate.estimate ? (
                <div className="home-estimate-result">
                  <div className="home-result-main">
                    <span>{t("home.estimator.result.marketPrice")}</span>

                    <strong>
                      €{formatPrice(estimate.estimate.market_price)}
                    </strong>

                    {estimate.comparison?.message && (
                      <p>
                        {priceEstimateComparisonMessage(
                          estimate.comparison,
                          t
                        )}
                      </p>
                    )}
                  </div>

                  <div className="home-result-ranges">
                    <div className="home-result-range">
                      <span>{t("home.estimator.result.quickSale")}</span>
                      <strong>
                        €{formatPrice(estimate.estimate.sell_fast.min)}
                        {" – "}
                        €{formatPrice(estimate.estimate.sell_fast.max)}
                      </strong>
                    </div>

                    <div className="home-result-range home-result-range-highlight">
                      <span>{t("home.estimator.result.normalPrice")}</span>
                      <strong>
                        €{formatPrice(estimate.estimate.normal.min)}
                        {" – "}
                        €{formatPrice(estimate.estimate.normal.max)}
                      </strong>
                    </div>

                    <div className="home-result-range">
                      <span>{t("home.estimator.result.higherAsking")}</span>
                      <strong>
                        €{formatPrice(estimate.estimate.higher_asking.min)}
                        {" – "}
                        €{formatPrice(estimate.estimate.higher_asking.max)}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="home-estimate-no-data">
                  <strong>{t("home.estimator.result.noDataTitle")}</strong>
                  <p>
                    {priceEstimateComparisonMessage(estimate.comparison, t) ||
                      t("home.estimator.result.noDataDescription")}
                  </p>
                </div>
              )}
            </div>
          ) : (
            !estimateLoading && (
              <div className="risk-preview" aria-label={t("risk.whatYouLearn")}>
                {[
                  ["/risk-price-context.png", "priceContext"],
                  ["/risk-odometer.png", "detailsToCheck"],
                  ["/risk-market-evidence.png", "confidence"],
                ].map(([icon, key]) => (
                  <article key={key}>
                    <img
                      className="risk-preview-icon"
                      src={icon}
                      alt=""
                      width="112"
                      height="112"
                    />
                    <h3>{t(`risk.preview.${key}.title`)}</h3>
                    <p>{t(`risk.preview.${key}.description`)}</p>
                  </article>
                ))}
              </div>
            )
          )}
        </div>

        {showScrollTop && (
          <button
            type="button"
            className={`scroll-top-button ${
              showScrollTop ? "is-visible" : ""
            }`}
            onClick={scrollToTop}
            aria-label={t("home.scrollTop", "Scroll to top")}
          >
            <svg
              className="scroll-top-ring"
              viewBox="0 0 56 56"
              aria-hidden="true"
            >
              <circle
                className="scroll-top-ring-track"
                cx="28"
                cy="28"
                r="24"
              />
              <circle
                className="scroll-top-ring-progress"
                cx="28"
                cy="28"
                r="24"
              />
            </svg>
            <svg
              className="scroll-top-icon"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 6L6 12" />
              <path d="M12 6L18 12" />
              <path d="M12 12L6 18" />
              <path d="M12 12L18 18" />
            </svg>
          </button>
        )}
      </main>
    </>
  );
}

