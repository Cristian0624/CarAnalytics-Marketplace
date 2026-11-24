import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BackgroundTriangles from "../components/BackgroundTriangles";
import "./AboutUsPage.css";

export default function AboutUsPage() {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="about-page">
      <BackgroundTriangles />

      <div className="about-container">
        <header className="about-hero">
          <div className="about-brand-emblem-wrap">
            <img
              src="/brand/logo1.1.svg"
              alt="FaceAuto"
              className="about-brand-emblem"
            />
          </div>
          <span className="about-badge">{t("aboutUs.badge")}</span>
          <h1>
            {t("aboutUs.titlePrefix")}{" "}
            <span className="about-brand-highlight">
              Face<span>Auto</span>
            </span>
          </h1>
          <p className="about-subtitle">{t("aboutUs.subtitle")}</p>
        </header>

        <section className="about-mission-grid">
          <article className="about-mission-card">
            <span className="about-card-eyebrow">
              {t("aboutUs.mission.eyebrow")}
            </span>
            <h2>{t("aboutUs.mission.title")}</h2>
            <p>{t("aboutUs.mission.description")}</p>
          </article>

          <article className="about-mission-card">
            <span className="about-card-eyebrow">
              {t("aboutUs.vision.eyebrow")}
            </span>
            <h2>{t("aboutUs.vision.title")}</h2>
            <p>{t("aboutUs.vision.description")}</p>
          </article>
        </section>

        <div className="about-footer-action">
          <Link to="/" className="about-home-btn">
            {t("aboutUs.backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}

