import { useEffect, useRef, useState } from "react";
import { assessAnomalyRisk } from "../api/anomaly_risk";
import { getListingOptions } from "../api/listings";
import { buildRiskPayload, resolveVehicleOption, riskErrorMessage } from "../utils/anomalyRisk";
import AnomalyRiskResults from "../components/AnomalyRiskResults";
import VehicleSelect from "../components/VehicleSelect";
import SaveItemButton from "../components/SaveItemButton";
import { createSaved } from "../api/saved_items";
import "./AnomalyRiskPage.css";
import { useTranslation } from "react-i18next";

const EMPTY_FORM = {
  brand: "", model: "", generation: "", price: "", year: "", mileage: "",
  engine: "", fuel_type: "", gearbox: "", drivetrain: "", body_type: "",
};
const OPTIONS = {
  fuel_type: ["Benzină", "Diesel", "Electricitate", "Hybrid", "Gaz", "Gaz / Benzină (propan)", "Gaz / Benzină (metan)", "Plug-in Hybrid (benzină)", "Plug-in Hybrid (diesel)", "Mild Hybrid (benzină)", "Mild Hybrid (diesel)"],
  gearbox: ["Mecanică", "Automată", "Automat-Tiptronic", "Robotizată", "Variator"],
  drivetrain: ["Din față", "Din spate", "4x4", "4x2"],
  body_type: ["Sedan", "Hatchback", "Universal", "Combi", "SUV", "Crossover", "Coupe", "Cabriolet", "Roadster", "Pickup", "Minivan", "Microvan", "Furgon", "Camionetă", "Microautobus", "Platformă deschisă"],
};

export default function AnomalyRiskPage() {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [generations, setGenerations] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState({ brand: true, model: false, generation: false });
  const [optionsError, setOptionsError] = useState({ brand: false, model: false, generation: false });
  const [result, setResult] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(null);
  const resultRef = useRef(null);
  const selectedBrand = resolveVehicleOption(brands, form.brand);
  const selectedModel = selectedBrand ? resolveVehicleOption(models, form.model) : null;
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
    return () => requestRef.current?.abort();
  }, []);
  useEffect(() => { if (result) resultRef.current?.focus(); }, [result]);
  useEffect(() => {
    let current = true;
    getListingOptions().then((data) => {
      if (current) setBrands(data.brand ?? []);
    }).catch(() => {
      if (current) setOptionsError((state) => ({ ...state, brand: true }));
    }).finally(() => {
      if (current) setOptionsLoading((state) => ({ ...state, brand: false }));
    });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (!selectedBrand) return;
    let current = true;
    getListingOptions({ brand: selectedBrand }).then((data) => {
      if (current) setModels(data.model ?? []);
    }).catch(() => {
      if (current) setOptionsError((state) => ({ ...state, model: true }));
    }).finally(() => {
      if (current) setOptionsLoading((state) => ({ ...state, model: false }));
    });
    return () => { current = false; };
  }, [selectedBrand]);
  useEffect(() => {
    if (!selectedModel) return;
    let current = true;
    getListingOptions({ brand: selectedBrand, model: selectedModel }).then((data) => {
      if (current) setGenerations(data.generation ?? []);
    }).catch(() => {
      if (current) setOptionsError((state) => ({ ...state, generation: true }));
    }).finally(() => {
      if (current) setOptionsLoading((state) => ({ ...state, generation: false }));
    });
    return () => { current = false; };
  }, [selectedBrand, selectedModel]);

  function update(field, value) {
    const brandChanged = field === "brand" && resolveVehicleOption(brands, value) !== selectedBrand;
    const modelChanged = field === "model" && resolveVehicleOption(models, value) !== selectedModel;
    setForm((current) => ({ ...current, [field]: value,
      ...(brandChanged ? { model: "", generation: "" } : modelChanged ? { generation: "" } : {}),
    }));
    if (brandChanged) {
      setModels([]);
      setGenerations([]);
      setOptionsError((state) => ({ ...state, model: false, generation: false }));
      setOptionsLoading((state) => ({ ...state, model: Boolean(resolveVehicleOption(brands, value)), generation: false }));
    } else if (modelChanged) {
      setGenerations([]);
      setOptionsError((state) => ({ ...state, generation: false }));
      setOptionsLoading((state) => ({ ...state, generation: Boolean(resolveVehicleOption(models, value)) }));
    }
    setResult(null);
    setError("");
  }

  function commit(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (requestRef.current) return;
    if (!selectedBrand || !selectedModel) {
      setError(t("risk.errors.selectBrandModel"));
      return;
    }
    const selectedGeneration = resolveVehicleOption(generations, form.generation);
    if (form.generation.trim() && !selectedGeneration) {
      setError(t("risk.errors.selectGeneration"));
      return;
    }
    const payload = buildRiskPayload({ ...form, brand: selectedBrand, model: selectedModel, generation: selectedGeneration ?? "" });
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 60000);
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await assessAnomalyRisk(payload, controller.signal);
      if (!controller.signal.aborted) { setSubmitted(payload); setResult(response); }
    } catch (err) {
      if (err.name !== "AbortError") setError(riskErrorMessage(err));
    } finally {
      clearTimeout(timeout);
      requestRef.current = null;
      setLoading(false);
    }
  }


  const triangles = [
    { id: 1, side: 'left', top: '5%', size: 120, color: '#17202A', delay: '-0s', rot: 15, offset: '-30px' },
    { id: 2, side: 'left', top: '25%', size: 80, color: '#14B8A6', delay: '-2s', rot: -45, offset: '10px' },
    { id: 3, side: 'left', top: '45%', size: 150, color: '#CBD5E1', delay: '-4s', rot: 30, offset: '-40px' },
    { id: 4, side: 'left', top: '65%', size: 90, color: '#17202A', delay: '-1s', rot: 75, offset: '20px' },
    { id: 5, side: 'left', top: '85%', size: 110, color: '#14B8A6', delay: '-3s', rot: -15, offset: '-20px' },
    { id: 6, side: 'right', top: '10%', size: 100, color: '#CBD5E1', delay: '-1.5s', rot: 60, offset: '-20px' },
    { id: 7, side: 'right', top: '30%', size: 130, color: '#17202A', delay: '-3.5s', rot: -30, offset: '10px' },
    { id: 8, side: 'right', top: '50%', size: 90, color: '#14B8A6', delay: '-0.5s', rot: 45, offset: '-15px' },
    { id: 9, side: 'right', top: '70%', size: 140, color: '#CBD5E1', delay: '-2.5s', rot: -60, offset: '-30px' },
    { id: 10, side: 'right', top: '90%', size: 85, color: '#17202A', delay: '-4.5s', rot: 15, offset: '5px' }
  ];

  return (
    <>
      <div className="background-shapes">
        {triangles.map(t => (
          <svg key={t.id} className="floating-shape" style={{
            width: t.size, height: t.size, color: t.color,
            top: t.top,
            [t.side]: t.offset,
            animationDelay: t.delay,
            '--rot': `${t.rot}deg`
          }} viewBox="-20 -20 140 140" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,0 100,100 0,100" fill="currentColor" stroke="currentColor" strokeWidth="30" strokeLinejoin="round"/>
          </svg>
        ))}
      </div>
      <main className="risk-page">
      <div className="risk-container">
      <header className="risk-heading">
        <h1>{t("risk.title")}</h1>
        <p>{t("risk.description")}</p>
      </header>

        <form className="risk-form" onSubmit={submit} aria-busy={loading}>
        <div className="risk-form-heading">
          <div>
            <h2>{t("risk.aboutCar")}</h2>
            <p>{t("risk.formDescription")}</p>
          </div>
          <span>* {t("risk.required")}</span>
        </div>
          <fieldset disabled={loading}>
          <legend className="risk-sr-only">
            {t("risk.offerData")}
          </legend>
            <div className="risk-fields risk-identity">
            <VehicleSelect
              field="brand"
              label={t("risk.brand")}
              value={form.brand}
              options={brands}
              onChange={update}
              onCommit={commit}
              required
              loading={optionsLoading.brand}
              error={optionsError.brand}
            />

            <VehicleSelect
              key={selectedBrand ?? ""}
              field="model"
              label={t("risk.model")}
              value={form.model}
              options={models}
              onChange={update}
              onCommit={commit}
              required
              disabled={!selectedBrand}
              loading={optionsLoading.model}
              error={optionsError.model}
            />

            <VehicleSelect
              key={`${selectedBrand}/${selectedModel}`}
              field="generation"
              label={t("risk.generation")}
              value={form.generation}
              options={generations}
              onChange={update}
              onCommit={commit}
              disabled={!selectedModel}
              loading={optionsLoading.generation}
              error={optionsError.generation}
            />
            </div>
            <div className="risk-fields">
              {[
                {
                  field: "price",
                  label: t("risk.price"),
                  min: 0.01,
                  step: "0.01",
                  placeholder: t("risk.placeholders.price"),
                  required: true,
                },
                {
                  field: "year",
                  label: t("risk.year"),
                  min: 1886,
                  max: new Date().getFullYear() + 1,
                  placeholder: t("risk.placeholders.year"),
                },
                {
                  field: "mileage",
                  label: t("risk.mileage"),
                  min: 0,
                  max: 10000000,
                  placeholder: t("risk.placeholders.mileage"),
                },
                {
                  field: "engine",
                  label: t("risk.engine"),
                  min: 0,
                  max: 20,
                  step: "any",
                  placeholder: t("risk.placeholders.engine"),
                },
              ].map(({ field, label, ...props }) => (
                <div className="risk-field" key={field}>
                  <label htmlFor={`risk-${field}`}>{label}{props.required ? " *" : ""}</label>
                  <input id={`risk-${field}`} name={field} type="number" step="1" {...props} value={form[field]} onChange={(e) => update(field, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="risk-fields">
              {[
                  ["fuel_type", t("risk.fuel")],
                  ["gearbox", t("risk.gearbox")],
                  ["drivetrain", t("risk.drivetrain")],
                  ["body_type", t("risk.bodyType")],
                ].map(([field, label]) => (
                <div className="risk-field" key={field}>
                  <label htmlFor={`risk-${field}`}>{label}</label>
                  <select id={`risk-${field}`} name={field} value={form[field]} onChange={(e) => update(field, e.target.value)}>
                  <option value="">{t("risk.unspecified")}</option>
                  {OPTIONS[field].map((option) => (
                    <option key={option} value={option}>
                      {t(`risk.options.${field}.${option}`, option)}
                    </option>
                  ))}
                  </select>
                </div>
              ))}
            </div>
            <p className="risk-form-note">
              {t("risk.formNote")}
            </p>
            <div className="risk-actions">
            <button className="risk-submit" type="submit">
                {loading ? t("risk.analyzing") : t("risk.analyze")}
              </button>

              <button
                className="risk-reset"
                type="button"
                onClick={() => {
                  setForm({ ...EMPTY_FORM });
                  setModels([]);
                  setGenerations([]);
                  setResult(null);
                  setError("");
                }}
              >
                {t("risk.reset")}
              </button>
              {result && submitted && (
                  <SaveItemButton
                    key={JSON.stringify(submitted)}
                    label={t("risk.saveAnalysis")}
                    defaultName={`${submitted.brand} ${submitted.model}${submitted.year ? ` ${submitted.year}` : ""}`}
                    path="/saved-risk-assessments"
                    onSave={(name) =>
                      createSaved("risks", { name, input: submitted })
                    }
                    onSaved={(item) => setResult(item.result)}
                  />
                )}
            </div>
          </fieldset>
          {error && (
              <p className="risk-error" role="alert">
                {error}
              </p>
            )}

            {loading && (
              <p className="risk-loading" role="status">
                {t("risk.loading")}
              </p>
            )}
        </form>

        {result ? <div ref={resultRef} tabIndex={-1} className="risk-result-focus"><AnomalyRiskResults result={result} vehicle={submitted} /></div> : !loading && (
          <div className="risk-preview" aria-label={t("risk.whatYouLearn")}>
          {[
            [
              "/risk-price-context.png",
              "priceContext",
            ],
            [
              "/risk-odometer.png",
              "detailsToCheck",
            ],
            [
              "/risk-market-evidence.png",
              "confidence",
            ],
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
        )}
       <p className="risk-disclaimer">
        {t("risk.disclaimer")}
      </p>
      </div>
    </main>
    </>
  );
}
