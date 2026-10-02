import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import CarViewer from "../components/CarViewer";
import "./HomePage.css";
import { useEffect, useState } from "react";
import { getListingOptions } from "../api/listings";
import { estimatePrice } from "../api/price_estimate";
import Autocomplete from "../components/Autocomplete";
import {
  getPredictionBrands,
  getPredictionModels,
  getPredictionGenerations,
} from "../api/predictions";

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

  const [estimator, setEstimator] = useState(INITIAL_ESTIMATOR);
  const [options, setOptions] = useState(EMPTY_OPTIONS);

  const [estimate, setEstimate] = useState(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      try {
        const result = await getListingOptions();

        setOptions({
          fuel_type: result.fuel_type || [],
          engine: result.engine || [],
          gearbox: result.gearbox || [],
          drivetrain: result.drivetrain || [],
          body_type: result.body_type || [],
        });
      } catch {
        setEstimateError(
          "Nu au putut fi încărcate opțiunile pentru estimator."
        );
      }
    }

    loadOptions();
  }, []);

  function updateEstimator(name, value) {
    setEstimator((current) => ({
      ...current,
      [name]: value,
    }));

    setEstimate(null);
    setEstimateError("");
  }

  function handleBrandChange(value) {
    setEstimator((current) => ({
      ...current,
      brand: value,
      model: "",
      generation: "",
    }));

    setEstimate(null);
    setEstimateError("");
  }

  function handleModelChange(value) {
    setEstimator((current) => ({
      ...current,
      model: value,
      generation: "",
    }));

    setEstimate(null);
    setEstimateError("");
  }

  function handleGenerationChange(value) {
    updateEstimator("generation", value);
  }

  async function handleEstimate() {
    const year = parseNumber(estimator.year);
    const mileage = parseNumber(estimator.mileage);

    if (
      !estimator.brand ||
      !estimator.model ||
      !estimator.generation ||
      year === null ||
      mileage === null ||
      !estimator.fuel_type ||
      !estimator.gearbox ||
      !estimator.drivetrain ||
      !estimator.body_type
    ) {
      setEstimateError(
        "Completează toate câmpurile obligatorii pentru a calcula prețul."
      );
      setEstimate(null);
      return;
    }

    const engine =
      estimator.engine === ""
        ? null
        : parseNumber(estimator.engine);

    const payload = {
      brand: estimator.brand,
      model: estimator.model,
      generation: estimator.generation,

      year,
      mileage,

      fuel_type: estimator.fuel_type,
      engine,

      gearbox: estimator.gearbox,
      drivetrain: estimator.drivetrain,
      body_type: estimator.body_type,

      year_min: Math.max(1886, year - 2),
      year_max: year + 2,

      mileage_min: Math.max(0, mileage - 30000),
      mileage_max: mileage + 30000,
    };

    setEstimateLoading(true);
    setEstimateError("");
    setEstimate(null);

    try {
      const result = await estimatePrice(payload);
      setEstimate(result);
    } catch (error) {
      setEstimateError(
        error?.message ||
        "Nu am putut calcula prețul estimat."
      );
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
                Bine ai revenit, {user.name}
              </div>

              <h1 className="hero-title">
                Piața te așteaptă. Continuă vânătoarea.
              </h1>

              <p className="hero-subtitle">
                Anunțurile tale favorite sunt salvate, iar algoritmul nostru
                a evaluat deja ofertele noi apărute în piață.
              </p>

              <div className="hero-buttons">
                <Link to="/listings" className="btn-primary">
                  Răsfoiește Piața
                </Link>

                <Link to="/favourites" className="btn-secondary">
                  Anunțurile Mele
                </Link>

                <Link
                  to="/anomaly-risk"
                  className="btn-primary hero-risk-link"
                >
                  Estimează Riscul unei Oferte
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="hero-title">
                Află Valoarea Reală a Oricărei Mașini Instant.
              </h1>

              <p className="hero-subtitle">
                Nu mai plăti prea mult pentru mașini second-hand.
                Algoritmul nostru analizează mii de date din piață
                pentru a evalua precis fiecare anunț.
              </p>

              <div className="hero-buttons">
                <Link to="/listings" className="btn-primary">
                  Răsfoiește Piața
                </Link>

                <Link to="/register" className="btn-secondary">
                  Înscrie-te Gratuit
                </Link>

                <Link
                  to="/anomaly-risk"
                  className="btn-primary hero-risk-link"
                >
                  Estimează Riscul unei Oferte
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="hero-image-placeholder">
          <CarViewer />
        </div>
      </section>


      {/* PRICE ESTIMATOR */}
      <section className="home-estimator-section">

        <div className="home-estimator-header">
          <span className="home-estimator-badge">
            ANALIZĂ DE PIAȚĂ
          </span>

          <h2>
            Cât valorează mașina ta?
          </h2>

          <p>
            Introdu caracteristicile vehiculului și află instant
            prețul estimat pe baza anunțurilor comparabile din piață.
          </p>
        </div>


        <div className="home-estimator-card">

          <div className="home-estimator-form">

            {/* BRAND */}
            <div className="home-estimator-field">
              <label>Marcă *</label>

              <Autocomplete
                value={estimator.brand}
                onChange={handleBrandChange}
                onSelect={handleBrandChange}
                fetchSuggestions={async (query) => {
                  try {
                    const data = await getPredictionBrands(query);
                    return data.brands || [];
                  } catch {
                    return [];
                  }
                }}
                placeholder="ex. BMW"
              />
            </div>


            {/* MODEL */}
            <div className="home-estimator-field">
              <label>Model *</label>

              <Autocomplete
                value={estimator.model}
                onChange={handleModelChange}
                onSelect={handleModelChange}
                fetchSuggestions={async (query) => {
                  if (!estimator.brand) {
                    return [];
                  }

                  try {
                    const data = await getPredictionModels(
                      estimator.brand,
                      query
                    );

                    return data.models || [];
                  } catch {
                    return [];
                  }
                }}
                placeholder="ex. Seria 3"
                disabled={!estimator.brand}
              />
            </div>


            {/* GENERATION */}
            <div className="home-estimator-field">
              <label>Generație *</label>

              <Autocomplete
                value={estimator.generation}
                onChange={handleGenerationChange}
                onSelect={handleGenerationChange}
                fetchSuggestions={async (query) => {
                  if (!estimator.brand || !estimator.model) {
                    return [];
                  }

                  try {
                    const data = await getPredictionGenerations(
                      estimator.brand,
                      estimator.model,
                      query
                    );

                    return data.generations || [];
                  } catch {
                    return [];
                  }
                }}
                placeholder="ex. G20"
                disabled={!estimator.model}
              />
            </div>


            {/* YEAR */}
            <div className="home-estimator-field">
              <label>An *</label>

              <input
                type="number"
                min="1886"
                value={estimator.year}
                onChange={(event) =>
                  updateEstimator("year", event.target.value)
                }
                placeholder="ex. 2020"
              />
            </div>


            {/* MILEAGE */}
            <div className="home-estimator-field">
              <label>Kilometraj (km) *</label>

              <input
                type="number"
                min="0"
                value={estimator.mileage}
                onChange={(event) =>
                  updateEstimator("mileage", event.target.value)
                }
                placeholder="ex. 85000"
              />
            </div>


            {/* FUEL */}
            <div className="home-estimator-field">
              <label>Combustibil *</label>

              <select
                value={estimator.fuel_type}
                onChange={(event) =>
                  updateEstimator(
                    "fuel_type",
                    event.target.value
                  )
                }
              >
                <option value="">
                  Selectează
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
              <label>Motor</label>

              <select
                value={estimator.engine}
                onChange={(event) =>
                  updateEstimator(
                    "engine",
                    event.target.value
                  )
                }
              >
                <option value="">
                  Selectează
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
              <label>Cutie de viteze *</label>

              <select
                value={estimator.gearbox}
                onChange={(event) =>
                  updateEstimator(
                    "gearbox",
                    event.target.value
                  )
                }
              >
                <option value="">
                  Selectează
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
              <label>Tracțiune *</label>

              <select
                value={estimator.drivetrain}
                onChange={(event) =>
                  updateEstimator(
                    "drivetrain",
                    event.target.value
                  )
                }
              >
                <option value="">
                  Selectează
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
              <label>Caroserie *</label>

              <select
                value={estimator.body_type}
                onChange={(event) =>
                  updateEstimator(
                    "body_type",
                    event.target.value
                  )
                }
              >
                <option value="">
                  Selectează
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
                  Se calculează...
                </>
              ) : (
                "Estimează Prețul"
              )}
            </button>

          </div>


          {estimateError && (
            <div className="home-estimate-error">
              {estimateError}
            </div>
          )}


          {estimate?.estimate_available && estimate.estimate && (
            <div className="home-estimate-result">

              <div className="home-result-main">

                <span>
                  PREȚ ESTIMAT PE PIAȚĂ
                </span>

                <strong>
                  €{formatPrice(
                    estimate.estimate.market_price
                  )}
                </strong>

                {estimate.comparison?.message && (
                  <p>
                    {estimate.comparison.message}
                  </p>
                )}

              </div>


              <div className="home-result-ranges">

                <div className="home-result-range">
                  <span>Vânzare rapidă</span>

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
                  <span>Preț normal</span>

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
                  <span>Preț cerut mai ridicat</span>

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
                  Nu există suficiente date de piață.
                </strong>

                <p>
                  {estimate.comparison?.message ||
                    "Nu au fost găsite suficiente anunțuri comparabile pentru această configurație."}
                </p>
              </div>
            )}

        </div>
      </section>


      {/* FEATURES */}
      <section className="features-section">
        <h2>Inteligență de Piață Inegalabilă</h2>

        <div className="features-grid">
          <div className="feature-card">
            <h3>Scor Algoritmic al Ofertei</h3>
            <p>
              Fiecare mașină este evaluată matematic până la un maxim de
              80 de puncte, pe baza deprecierii exacte, a medianelor reale
              ale pieței și a anomaliilor ascunse.
            </p>
          </div>

          <div className="feature-card">
            <h3>Detectarea Fraudelor și Țepelor</h3>
            <p>
              Algoritmul nostru depistează instant vehiculele ascunse
              „Fost Taxi”, kilometrajele modificate și actele lipsă.
            </p>
          </div>

          <div className="feature-card">
            <h3>Ținte Dinamice de Preț</h3>
            <p>
              Spune-ne ce scor dorești (Corect, Bun, Excelent), și noi
              vom calcula prețul exact pe care ar trebui să-l negociezi.
            </p>
          </div>

          <div className="feature-card">
            <h3>Recomandări de Preț pentru Anunțuri</h3>
            <p>
              Vânzătorii pot folosi algoritmul nostru pentru a obține
              recomandarea perfectă de preț la adăugarea unui nou anunț.
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

        <h2>De ce să alegi CarAnalytics?</h2>

        <div className="why-grid">
          <div className="why-item">
            <div className="why-icon">
              <img src="/icon_chart.png" alt="Bazat pe Date icon" />
            </div>

            <h4>Bazat pe Date</h4>

            <p>
              Nu ne bazăm pe opinii subiective. Matematica pură și
              medianele pieței dictează scorul.
            </p>
          </div>

          <div className="why-item">
            <div className="why-icon">
              <img src="/icon_shield.png" alt="Imparțial icon" />
            </div>

            <h4>Imparțial</h4>

            <p>
              Vânzătorii nu pot manipula algoritmul. Primești adevărul
              brut, nefiltrat, despre ofertă.
            </p>
          </div>

          <div className="why-item">
            <div className="why-icon">
              <img
                src="/icon_lightning.png"
                alt="În Timp Real icon"
              />
            </div>

            <h4>În Timp Real</h4>

            <p>
              Pe măsură ce piața se schimbă, se schimbă și bazele noastre.
            </p>
          </div>

          <div className="why-item">
            <div className="why-icon">
              <img
                src="/icon_money.png"
                alt="Economisește Bani icon"
              />
            </div>

            <h4>Economisește Bani</h4>

            <p>
              Nu mai plăti niciodată în plus pentru o mașină cu rulaj mare.
            </p>
          </div>
        </div>
      </section>


      {/* REVIEWS */}
      <section className="reviews-section">
        <h2>Recenzii ale Comunității</h2>

        <div className="reviews-empty">
          <p>
            Construim o nouă comunitate de cumpărători inteligenți de
            mașini. Fii primul care lasă o recenzie platformei noastre!
          </p>

          <button
            className="btn-secondary"
            onClick={() =>
              alert(
                "Formularul pentru recenzii va fi disponibil în curând!"
              )
            }
          >
            Scrie o Recenzie
          </button>
        </div>
      </section>


      {/* FAQ */}
      <section className="faq-section">
        <h2>Întrebări Frecvente</h2>

        <div className="faq-list">
          <div className="faq-item">
            <h4>Cum funcționează Scorul Algoritmic?</h4>

            <p>
              Grupăm mașinile după Marcă, Model, Generație, An și
              Capacitate Motor pentru a calcula prețurile mediane adevărate
              și kilometrajele de bază.
            </p>
          </div>

          <div className="faq-item">
            <h4>Cum depistați țepele?</h4>

            <p>
              Algoritmul nostru penalizează anunțurile cu proporții
              imposibile între rulaj și vârstă, cuvinte-cheie ascunse sau
              prețuri statistic prea bune ca să fie adevărate.
            </p>
          </div>

          <div className="faq-item">
            <h4>Este gratuit?</h4>

            <p>
              Da, navigarea pe piață și vizualizarea scorurilor algoritmului
              sunt complet gratuite pentru toți cumpărătorii.
            </p>
          </div>
        </div>
      </section>


      {/* CTA */}
      <section className="cta-section">
        <div className="cta-box">
          <h2>Ești pregătit să găsești mașina perfectă?</h2>

          <p>
            Alătură-te miilor de cumpărători inteligenți care folosesc
            datele pentru a bate piața.
          </p>

          <Link
            to="/listings"
            className="btn-primary large"
          >
            Începe să Cauți Acum
          </Link>
        </div>
      </section>


      {/* FOOTER */}
      <footer className="footer-section">
        <div className="footer-content">
          <div className="footer-logo">
            CarAnalytics
          </div>

          <div className="footer-links">
            <a href="#">Despre Noi</a>
            <a href="#">Funcționalități</a>
            <a href="#">Prețuri</a>
            <a href="#">Termeni și Condiții</a>
            <a href="#">Politica de Confidențialitate</a>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default HomePage;
