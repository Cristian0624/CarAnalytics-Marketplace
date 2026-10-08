import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import AuthButton from "./AuthButton";
import "./Header.css";
import { useTranslation } from "react-i18next";

function Header() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [languageOpen, setLanguageOpen] = useState(false);

  const navClass = ({ isActive }) =>
    `header-nav-link${isActive ? " active" : ""}`;

  function changeLanguage(language) {
    i18n.changeLanguage(language);
    localStorage.setItem("language", language);
    setLanguageOpen(false);
  }

  return (
    <div className="header-wrapper">
      <header className="site-header">
        <div className="header-left">
          <Link
            to="/"
            className="header-brand"
            aria-label="FaceAuto"
          >
            <div className="brand-icon">
              <img
                src="/icon1.png"
                alt="FaceAuto logo"
              />
            </div>

            <span>
              Face<span style={{ color: "var(--brand-teal)" }}>Auto</span>
            </span>
          </Link>
        </div>

        <div className="header-right">
          <div className="language-selector">
            <button
              type="button"
              className="language-button"
              onClick={() => setLanguageOpen((prev) => !prev)}
              aria-expanded={languageOpen}
              aria-haspopup="true"
            >
              <span className="language-button__content">
                {i18n.language === "ro" }
                {i18n.language === "en"}
                {i18n.language === "ru" }

                <span>
                  {i18n.language === "ro" && "RO"}
                  {i18n.language === "en" && "EN"}
                  {i18n.language === "ru" && "RU"}
                </span>

                <span
                  className={`chevron ${
                    languageOpen ? "chevron-open" : ""
                  }`}
                >
                  ▾
                </span>
              </span>
            </button>

            {languageOpen && (
              <div className="language-dropdown">
                <button
                  type="button"
                  className="language-dropdown-item"
                  onClick={() => changeLanguage("ro")}
                >
                  <span>Română</span>
                </button>

                <button
                  type="button"
                  className="language-dropdown-item"
                  onClick={() => changeLanguage("en")}
                >
                  <span>English</span>
                </button>

                <button
                  type="button"
                  className="language-dropdown-item"
                  onClick={() => changeLanguage("ru")}
                >
                    <span>Русский</span>
                </button>
              </div>
            )}
          </div>

          <NavLink
            to="/"
            end
            className={navClass}
          >
            {t("header.home")}
          </NavLink>

          <NavLink
            to="/listings"
            className={navClass}
          >
            {t("header.listings")}
          </NavLink>

          <NavLink
            to="/anomaly-risk"
            className={navClass}
          >
            {t("header.riskAnalysis")}
          </NavLink>

          {user && (
            <NavLink
              to="/profile"
              className={navClass}
            >
              {t("header.profile")}
            </NavLink>
          )}

          <AuthButton />
        </div>
      </header>
    </div>
  );
}

export default Header;