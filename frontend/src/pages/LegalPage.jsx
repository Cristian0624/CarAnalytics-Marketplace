import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BackgroundTriangles from "../components/BackgroundTriangles";
import "./LegalPage.css";

export default function LegalPage({ type = "terms" }) {
  const { t } = useTranslation();
  const isTerms = type === "terms";
  const prefix = isTerms ? "legal.terms" : "legal.privacy";
  const sections = t(`${prefix}.sections`, { returnObjects: true });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [type]);

  return (
    <main className="legal-page">
      <BackgroundTriangles />

      <div className="legal-container">
        <header className="legal-hero">
          <div className="legal-brand-emblem-wrap">
            <img
              src="/brand/logo1.1.svg"
              alt="FaceAuto"
              className="legal-brand-emblem"
            />
          </div>
          <span className="legal-badge">{t(`${prefix}.badge`)}</span>
          <h1>{t(`${prefix}.title`)}</h1>
          <p className="legal-subtitle">{t(`${prefix}.subtitle`)}</p>
          <span className="legal-updated">{t("legal.lastUpdated")}</span>
        </header>

        <div className="legal-switcher">
          <Link
            to="/terms"
            className={`legal-switch-tab ${isTerms ? "active" : ""}`}
          >
            {t("home.footer.terms")}
          </Link>
          <Link
            to="/privacy"
            className={`legal-switch-tab ${!isTerms ? "active" : ""}`}
          >
            {t("home.footer.privacy")}
          </Link>
        </div>

        <article className="legal-card">
          {Array.isArray(sections) &&
            sections.map((section, index) => (
              <section key={index} className="legal-section">
                <div className="legal-section-heading">
                  <span className="legal-section-num">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{section.title}</h2>
                </div>
                <p>{section.body}</p>
                {Array.isArray(section.points) && section.points.length > 0 && (
                  <ul className="legal-points">
                    {section.points.map((point, pointIdx) => (
                      <li key={pointIdx}>{point}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
        </article>

        <div className="legal-footer-action">
          <Link to="/" className="legal-home-btn">
            {t("aboutUs.backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
