import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CarViewer from "../components/CarViewer";
import "./HomePage.css";
import { useEffect, useState, useRef } from "react";
import { estimatePrice } from "../api/price_estimate";
import { priceEstimateComparisonMessage, priceEstimateErrorMessage, priceEstimateMileageBounds, priceEstimateYearBounds } from "../utils/priceEstimate";
import Autocomplete from "../components/Autocomplete";
import useVehicleOptions from "../hooks/useVehicleOptions";
import { resolveVehicleOption } from "../utils/anomalyRisk";
import { useTranslation } from "react-i18next";

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

function HomePage() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const [showScrollTop, setShowScrollTop] = useState(false);

  const [estimator, setEstimator] = useState(INITIAL_ESTIMATOR);
  const brandRequest = useVehicleOptions();
  const options = brandRequest.data ?? EMPTY_OPTIONS;
  const brands = options.brand ?? [];
  const selectedBrand = resolveVehicleOption(brands, estimator.brand);
  const modelRequest = useVehicleOptions(selectedBrand, undefined, Boolean(selectedBrand));
  const models = modelRequest.data?.model ?? [];
  const selectedModel = selectedBrand ? resolveVehicleOption(models, estimator.model) : null;
  const generationRequest = useVehicleOptions(selectedBrand, selectedModel, Boolean(selectedBrand && selectedModel));
  const generations = generationRequest.data?.generation ?? [];
  const selectedGeneration = resolveVehicleOption(generations, estimator.generation);

  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState("");

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

        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    });
  }

  useEffect(() => {
    let ticking = false;
  
    function updateScrollProgress() {
      const scrollTop =
        window.scrollY || document.documentElement.scrollTop;
  
      const documentHeight =
        document.documentElement.scrollHeight - window.innerHeight;
  
      const progress =
        documentHeight > 0
          ? Math.min(1, Math.max(0, scrollTop / documentHeight))
          : 0;
  
      const progressCircle = document.querySelector(
        ".scroll-top-ring-progress"
      );
  
      if (progressCircle) {
        const circumference = 150.8;
  
        progressCircle.style.strokeDashoffset =
          circumference * (1 - progress);
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
  
    window.addEventListener("scroll", handleScroll, {
      passive: true,
    });
  
    updateScrollProgress();
  
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function updateEstimator(name, value, moveNext = false) {
    const brandChanged = name === "brand" && resolveVehicleOption(brands, value) !== selectedBrand;
    const modelChanged = name === "model" && resolveVehicleOption(models, value) !== selectedModel;
    setEstimator((current) => ({
      ...current,
      [name]: value,
      ...(brandChanged ? { model: "", generation: "" } : modelChanged ? { generation: "" } : {}),
    }));

    setEstimate(null);
    setEstimateError("");

    if (moveNext && value) {
      focusNextField(name);
    }
  }

  function handleBrandChange(value) {
    updateEstimator("brand", value, true);
  }

  function handleModelChange(value) {
    updateEstimator("model", value, true);
  }

  function handleGenerationChange(value) {
    updateEstimator("generation", value, true);
  }

  async function handleEstimate() {
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
      estimator.engine === ""
        ? null
        : parseNumber(estimator.engine);

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

    setEstimateLoading(true);
    setEstimateError("");
    setEstimate(null);

    try {
      const result = await estimatePrice(payload);
      setEstimate(result);
    } catch (error) {
      setEstimateError(priceEstimateErrorMessage(error, t));
    } finally {
      setEstimateLoading(false);
    }
  }

  return (
    <div className="landing-page">

      {/* HERO */}
      <section className="hero-section">
        <div className="hero-content">
          {user ? (
            <>
              <div className="hero-badge">
                {t("home.hero.welcome", { name: user.name })}
              </div>

              <h1 className="hero-title">
                {t("home.hero.loggedInTitle")}
              </h1>

              <p className="hero-subtitle">
                {t("home.hero.loggedInSubtitle")}
              </p>
            </>
          ) : (
            <>
              <h1 className="hero-title">
                {t("home.hero.guestTitle")}
              </h1>

              <p className="hero-subtitle">
                {t("home.hero.guestSubtitle")}
              </p>
            </>
          )}
        </div>

        <div className="hero-image-placeholder">
          <div className="hero-buttons">
            {user ? (
              <>
                <Link to="/listings" className="btn-primary">
                  {t("home.hero.browseMarket")}
                </Link>

                <Link to="/favourites" className="btn-secondary">
                  {t("home.hero.myListings")}
                </Link>

                <Link
                  to="/anomaly-risk"
                  className="btn-primary hero-risk-link"
                >
                  {t("home.hero.estimateRisk")}
                </Link>
              </>
            ) : (
              <>
                <Link to="/listings" className="btn-primary">
                  {t("home.hero.browseMarket")}
                </Link>

                <Link to="/register" className="btn-secondary">
                  {t("home.hero.registerFree")}
                </Link>

                <Link
                  to="/anomaly-risk"
                  className="btn-primary hero-risk-link"
                >
                  {t("home.hero.estimateRisk")}
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* PRICE ESTIMATOR */}
      <section className="home-estimator-section" id="estimator">

        <div className="estimator-car-image">
          <img
            src="/r8.png"
            alt="Audi R8"
            className="floating-car"
          />
        </div>

        <div className="home-estimator-header">
          <span className="home-estimator-badge">
            {t("home.estimator.badge")}
          </span>

          <h2>
            {t("home.estimator.title")}
          </h2>

          <p>
            {t("home.estimator.description")}
          </p>

          <p className="home-estimator-crosslink">
            {t("home.estimator.riskCtaPrefix")}{" "}
            <Link to="/anomaly-risk">
              {t("home.estimator.riskCtaLink")}
            </Link>
          </p>
        </div>

        <div className="home-estimator-card">

          <div className="home-estimator-form">

            {/* BRAND */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.brand")}
              </label>

              <Autocomplete
                inputRef={fieldRefs.brand}
                value={estimator.brand}
                onChange={(value) => updateEstimator("brand", value)}
                onSelect={(value) => {
                  handleBrandChange(value);
                }}
                options={brands}
                loading={brandRequest.loading}
                error={brandRequest.error}
                label={t("home.estimator.fields.brand")}
                placeholder={t("home.estimator.placeholders.brand")}
              />
            </div>

            {/* MODEL */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.model")}
              </label>

              <Autocomplete
                inputRef={fieldRefs.model}
                value={estimator.model}
                onChange={(value) => updateEstimator("model", value)}
                onSelect={(value) => {
                  handleModelChange(value);
                }}
                key={`model/${selectedBrand}`}
                options={models}
                loading={modelRequest.loading}
                error={modelRequest.error}
                label={t("home.estimator.fields.model")}
                placeholder={t("home.estimator.placeholders.model")}
                disabled={!selectedBrand}
              />
            </div>

            {/* GENERATION */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.generation")}
              </label>

              <Autocomplete
                inputRef={fieldRefs.generation}
                value={estimator.generation}
                onChange={(value) => updateEstimator("generation", value)}
                onSelect={(value) => {
                  handleGenerationChange(value);
                }}
                key={`generation/${selectedBrand}/${selectedModel}`}
                options={generations}
                loading={generationRequest.loading}
                error={generationRequest.error}
                label={t("home.estimator.fields.generation")}
                placeholder={t("home.estimator.placeholders.generation")}
                disabled={!selectedBrand || !selectedModel}
              />
            </div>

            {/* YEAR */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.year")}
              </label>

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

            {/* MILEAGE */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.mileage")}
              </label>

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

            {/* FUEL */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.fuel")}
              </label>

              <select
                ref={fieldRefs.fuel_type}
                value={estimator.fuel_type}
                onChange={(event) =>
                  updateEstimator(
                    "fuel_type",
                    event.target.value,
                    true
                  )
                }
              >
                <option value="">
                  {t("home.estimator.select")}
                </option>

                {options.fuel_type.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* ENGINE */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.engine")}
              </label>

              <select
                ref={fieldRefs.engine}
                value={estimator.engine}
                onChange={(event) =>
                  updateEstimator(
                    "engine",
                    event.target.value,
                    true
                  )
                }
              >
                <option value="">
                  {t("home.estimator.select")}
                </option>

                {options.engine.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* GEARBOX */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.gearbox")}
              </label>

              <select
                ref={fieldRefs.gearbox}
                value={estimator.gearbox}
                onChange={(event) =>
                  updateEstimator(
                    "gearbox",
                    event.target.value,
                    true
                  )
                }
              >
                <option value="">
                  {t("home.estimator.select")}
                </option>

                {options.gearbox.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* DRIVETRAIN */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.drivetrain")}
              </label>

              <select
                ref={fieldRefs.drivetrain}
                value={estimator.drivetrain}
                onChange={(event) =>
                  updateEstimator(
                    "drivetrain",
                    event.target.value,
                    true
                  )
                }
              >
                <option value="">
                  {t("home.estimator.select")}
                </option>

                {options.drivetrain.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            {/* BODY */}
            <div className="home-estimator-field">
              <label>
                {t("home.estimator.fields.body")}
              </label>

              <select
                ref={fieldRefs.body_type}
                value={estimator.body_type}
                onChange={(event) =>
                  updateEstimator(
                    "body_type",
                    event.target.value,
                    true
                  )
                }
              >
                <option value="">
                  {t("home.estimator.select")}
                </option>

                {options.body_type.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

          </div>

          <div className="home-estimator-action">

            <button
              type="button"
              className="home-estimate-button"
              onClick={handleEstimate}
              disabled={estimateLoading}
            >
              {estimateLoading ? (
                <>
                  <span className="home-estimate-spinner" />
                  {t("home.estimator.actions.calculating")}
                </>
              ) : (
                t("home.estimator.actions.estimate")
              )}
            </button>

          </div>

          {(estimateError || brandRequest.error) && (
            <div className="home-estimate-error">
              {estimateError || t("home.estimator.errors.options")}
            </div>
          )}

          {estimate?.estimate_available && estimate.estimate && (
            <div className="home-estimate-result">

              <div className="home-result-main">

                <span>
                  {t("home.estimator.result.marketPrice")}
                </span>

                <strong>
                  €{formatPrice(
                    estimate.estimate.market_price
                  )}
                </strong>

                {estimate.comparison?.message && (
                  <p>
                    {priceEstimateComparisonMessage(estimate.comparison, t)}
                  </p>
                )}

              </div>

              <div className="home-result-ranges">

                <div className="home-result-range">
                  <span>
                    {t("home.estimator.result.quickSale")}
                  </span>

                  <strong>
                    €{formatPrice(
                      estimate.estimate.sell_fast.min
                    )}
                    {" – "}
                    €{formatPrice(
                      estimate.estimate.sell_fast.max
                    )}
                  </strong>
                </div>

                <div className="home-result-range home-result-range-highlight">
                  <span>
                    {t("home.estimator.result.normalPrice")}
                  </span>

                  <strong>
                    €{formatPrice(
                      estimate.estimate.normal.min
                    )}
                    {" – "}
                    €{formatPrice(
                      estimate.estimate.normal.max
                    )}
                  </strong>
                </div>

                <div className="home-result-range">
                  <span>
                    {t("home.estimator.result.higherAsking")}
                  </span>

                  <strong>
                    €{formatPrice(
                      estimate.estimate.higher_asking.min
                    )}
                    {" – "}
                    €{formatPrice(
                      estimate.estimate.higher_asking.max
                    )}
                  </strong>
                </div>

              </div>

            </div>
          )}

          {estimate &&
            !estimate.estimate_available && (
              <div className="home-estimate-no-data">
                <strong>
                  {t("home.estimator.result.noDataTitle")}
                </strong>

                <p>
                  {priceEstimateComparisonMessage(estimate.comparison, t) ||
                    t("home.estimator.result.noDataDescription")}
                </p>
              </div>
            )}

        </div>
      </section>

      {/* FEATURES */}
      <section className="features-section">
        <h2>
          {t("home.features.title")}
        </h2>

        <div className="features-grid">

          <div className="feature-card">
            <h3>
              {t("home.features.algorithmicScore.title")}
            </h3>

            <p>
              {t("home.features.algorithmicScore.description")}
            </p>
          </div>

          <div className="feature-card">
            <h3>
              {t("home.features.fraudDetection.title")}
            </h3>

            <p>
              {t("home.features.fraudDetection.description")}
            </p>
          </div>

          <div className="feature-card">
            <h3>
              {t("home.features.dynamicPriceTargets.title")}
            </h3>

            <p>
              {t("home.features.dynamicPriceTargets.description")}
            </p>
          </div>

          <div className="feature-card">
            <h3>
              {t("home.features.priceRecommendations.title")}
            </h3>

            <p>
              {t("home.features.priceRecommendations.description")}
            </p>
          </div>

        </div>
      </section>

      {/* WHY US */}
      <section className="why-us-section">

        <div className="why-car-image">
          <img
            src="/lada.png"
            alt="Lada"
            className="floating-car"
          />
        </div>

        <h2>
          {t("home.whyUs.title")}
        </h2>

        <div className="why-grid">

          <div className="why-item">
            <div className="why-icon">
              <img
                src="/icon_chart.png"
                alt={t("home.whyUs.dataDriven.alt")}
              />
            </div>

            <h4>
              {t("home.whyUs.dataDriven.title")}
            </h4>

            <p>
              {t("home.whyUs.dataDriven.description")}
            </p>
          </div>

          <div className="why-item">
            <div className="why-icon">
              <img
                src="/icon_shield.png"
                alt={t("home.whyUs.impartial.alt")}
              />
            </div>

            <h4>
              {t("home.whyUs.impartial.title")}
            </h4>

            <p>
              {t("home.whyUs.impartial.description")}
            </p>
          </div>

          <div className="why-item">
            <div className="why-icon">
              <img
                src="/icon_lightning.png"
                alt={t("home.whyUs.realTime.alt")}
              />
            </div>

            <h4>
              {t("home.whyUs.realTime.title")}
            </h4>

            <p>
              {t("home.whyUs.realTime.description")}
            </p>
          </div>

          <div className="why-item">
            <div className="why-icon">
              <img
                src="/icon_money.png"
                alt={t("home.whyUs.saveMoney.alt")}
              />
            </div>

            <h4>
              {t("home.whyUs.saveMoney.title")}
            </h4>

            <p>
              {t("home.whyUs.saveMoney.description")}
            </p>
          </div>

        </div>
      </section>

      {/* REVIEWS */}
      <section className="reviews-section">
        <h2>
          {t("home.reviews.title")}
        </h2>

        <div className="reviews-empty">
          <p>
            {t("home.reviews.description")}
          </p>

          <button
            className="btn-secondary"
            onClick={() =>
              alert(t("home.reviews.comingSoon"))
            }
          >
            {t("home.reviews.write")}
          </button>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section">
        <h2>
          {t("home.faq.title")}
        </h2>

        <div className="faq-list">

          <div className="faq-item">
            <h4>
              {t("home.faq.algorithmicScore.question")}
            </h4>

            <p>
              {t("home.faq.algorithmicScore.answer")}
            </p>
          </div>

          <div className="faq-item">
            <h4>
              {t("home.faq.scams.question")}
            </h4>

            <p>
              {t("home.faq.scams.answer")}
            </p>
          </div>

          <div className="faq-item">
            <h4>
              {t("home.faq.free.question")}
            </h4>

            <p>
              {t("home.faq.free.answer")}
            </p>
          </div>

        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-box">

          <h2>
            {t("home.cta.title")}
          </h2>

          <p>
            {t("home.cta.description")}
          </p>

          <Link
            to="/listings"
            className="btn-primary large"
          >
            {t("home.cta.button")}
          </Link>

        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer-section">
        <div className="footer-content">

          <div className="footer-logo">
            Face<span style={{ color: "var(--brand-teal)" }}>Auto</span>
          </div>

          <div className="footer-links">
            <Link to="/about">
              {t("home.footer.about")}
            </Link>

            <Link to="/features">
              {t("home.footer.features")}
            </Link>

            <a href="#">
              {t("home.footer.terms")}
            </a>

            <a href="#">
              {t("home.footer.privacy")}
            </a>
          </div>

        </div>
      </footer>
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
    </div>
  );
}

export default HomePage;
