import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import AuthButton from "./AuthButton";
import "./Header.css";
import { useTranslation } from "react-i18next";

function ThemeIcon({ isDark }) {
  if (isDark) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.5" />
        <line x1="12" y1="2.5" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="21.5" />
        <line x1="4.93" y1="4.93" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19.07" y2="19.07" />
        <line x1="2.5" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="21.5" y2="12" />
        <line x1="4.93" y1="19.07" x2="6.7" y2="17.3" />
        <line x1="17.3" y1="6.7" x2="19.07" y2="4.93" />
      </svg>
    );
  }
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function Header() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile menu whenever route changes
  useEffect(() => {
    setMenuOpen(false);
    setLanguageOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Handle ESC key to close mobile menu
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setLanguageOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const navClass = ({ isActive }) =>
    `header-nav-link${isActive ? " active" : ""}`;

  const currentLanguage = (i18n.resolvedLanguage || i18n.language || "ro").slice(0, 2);

  const mobileNavClass = ({ isActive }) =>
    `mobile-nav-link${isActive ? " active" : ""}`;

  function changeLanguage(language) {
    i18n.changeLanguage(language);
    localStorage.setItem("language", language);
    setLanguageOpen(false);
  }

  async function handleMobileLogout() {
    await logout();
    setMenuOpen(false);
    navigate("/");
  }

  return (
    <div className="header-wrapper">
      <header className="site-header">
        <div className="header-left">
          <Link
            to="/"
            className="header-brand"
            aria-label="FaceAuto"
            onClick={() => setMenuOpen(false)}
          >
            <img
              src="/brand/logo4_1.svg"
              alt="FaceAuto"
              className="header-brand-full"
            />
            <img
              src="/brand/logo1.1.svg"
              alt="FaceAuto"
              className="header-brand-mark"
            />
          </Link>
        </div>

        {/* Desktop Navigation (visible on screens > 768px) */}
        <div className="header-right header-desktop-nav">
          <button
            type="button"
            className={`theme-toggle-button ${isDark ? "is-dark" : ""}`}
            onClick={toggleTheme}
            aria-label={isDark ? t("header.switchToLight") : t("header.switchToDark")}
            title={isDark ? t("header.switchToLight") : t("header.switchToDark")}
            aria-pressed={isDark}
          >
            <ThemeIcon isDark={isDark} />
          </button>

          <div className="language-selector">
            <button
              type="button"
              className="language-button"
              onClick={() => setLanguageOpen((prev) => !prev)}
              aria-expanded={languageOpen}
              aria-haspopup="true"
            >
              <span className="language-button__content">
                <span>
                  {currentLanguage.toUpperCase()}
                  
                  
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
                  <span>{t("language.ro")}</span>
                </button>

                <button
                  type="button"
                  className="language-dropdown-item"
                  onClick={() => changeLanguage("en")}
                >
                  <span>{t("language.en")}</span>
                </button>

                <button
                  type="button"
                  className="language-dropdown-item"
                  onClick={() => changeLanguage("ru")}
                >
                  <span>{t("language.ru")}</span>
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
            to="/price-estimate"
            className={navClass}
          >
            {t("header.priceEstimate")}
          </NavLink>

          <NavLink
            to="/anomaly-risk"
            className={navClass}
          >
            {t("header.riskAnalysis")}
          </NavLink>

          <NavLink
            to="/copilot"
            className={({ isActive }) => `header-nav-link header-nav-copilot${isActive ? " active" : ""}`}
          >
            <span>{t("header.copilot", "Buy-Safe")}</span>
            <span className="header-beta-pill">BETA</span>
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

        {/* Mobile Right Controls: Theme Toggle + Hamburger Button (visible on screens <= 768px) */}
        <div className="mobile-header-actions">
          <button
            type="button"
            className={`mobile-theme-toggle ${isDark ? "is-dark" : ""}`}
            onClick={toggleTheme}
            aria-label={isDark ? t("header.switchToLight") : t("header.switchToDark")}
            title={isDark ? t("header.switchToLight") : t("header.switchToDark")}
            aria-pressed={isDark}
          >
            <ThemeIcon isDark={isDark} />
          </button>

          <button
            type="button"
            className={`mobile-menu-toggle ${menuOpen ? "open" : ""}`}
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label={menuOpen ? t("header.closeMenu") : t("header.openMenu")}
            aria-expanded={menuOpen}
          >
            <span className="hamburger-bar"></span>
            <span className="hamburger-bar"></span>
            <span className="hamburger-bar"></span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {menuOpen && (
        <div
          className="mobile-menu-backdrop"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile Pop-out Drawer Menu */}
      <aside
        className={`mobile-menu-drawer ${menuOpen ? "open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-brand">
            <img
              src="/brand/logo1.1.svg"
              alt="FaceAuto"
              className="mobile-drawer-logo"
            />
            <span className="mobile-drawer-title">FaceAuto</span>
          </div>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={() => setMenuOpen(false)}
            aria-label={t("header.closeMenu")}
          >
            ✕
          </button>
        </div>

        {/* Language Selector Pills inside Mobile Drawer */}
        <div className="mobile-drawer-section">
          <span className="mobile-drawer-label">
            {t("header.language", "Language")}
          </span>
          <div className="mobile-lang-pills">
            <button
              type="button"
              className={`mobile-lang-pill ${
                currentLanguage === "ro" ? "active" : ""
              }`}
              onClick={() => changeLanguage("ro")}
            >
              RO
            </button>
            <button
              type="button"
              className={`mobile-lang-pill ${
                currentLanguage === "en" ? "active" : ""
              }`}
              onClick={() => changeLanguage("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={`mobile-lang-pill ${
                currentLanguage === "ru" ? "active" : ""
              }`}
              onClick={() => changeLanguage("ru")}
            >
              RU
            </button>
          </div>
        </div>

        {/* Theme Selector Pills inside Mobile Drawer */}
        <div className="mobile-drawer-section">
          <span className="mobile-drawer-label">
            {t("header.theme", "Theme")}
          </span>
          <div className="mobile-lang-pills">
            <button
              type="button"
              className={`mobile-lang-pill mobile-theme-pill ${!isDark ? "active" : ""}`}
              onClick={() => setTheme("light")}
            >
              {t("header.lightTheme", "Light")}
            </button>
            <button
              type="button"
              className={`mobile-lang-pill mobile-theme-pill ${isDark ? "active" : ""}`}
              onClick={() => setTheme("dark")}
            >
              {t("header.darkTheme", "Dark")}
            </button>
          </div>
        </div>

        {/* Main Navigation inside Mobile Drawer */}
        <nav className="mobile-drawer-nav">
          <span className="mobile-drawer-label">
            {t("header.navigation", "Navigation")}
          </span>

          <NavLink to="/" end className={mobileNavClass}>
            <span>{t("header.home")}</span>
          </NavLink>

          <NavLink to="/listings" className={mobileNavClass}>
            <span>{t("header.listings")}</span>
          </NavLink>

          <NavLink to="/price-estimate" className={mobileNavClass}>
            <span>{t("header.priceEstimate")}</span>
          </NavLink>

          <NavLink to="/anomaly-risk" className={mobileNavClass}>
            <span>{t("header.riskAnalysis")}</span>
          </NavLink>

          <NavLink to="/copilot" className={mobileNavClass}>
            <span>{t("header.copilot", "Buy-Safe")}</span>
            <span className="header-beta-pill">BETA</span>
          </NavLink>

          <NavLink to="/comparator" className={mobileNavClass}>
            <span>{t("header.comparator")}</span>
          </NavLink>

          <NavLink to="/about" className={mobileNavClass}>
            <span>{t("header.about")}</span>
          </NavLink>
        </nav>

        {/* Account / User Area inside Mobile Drawer */}
        <div className="mobile-drawer-user-section">
          <span className="mobile-drawer-label">
            {t("authButton.account", "Account")}
          </span>

          {user ? (
            <div className="mobile-user-card">
              <div className="mobile-user-header">
                <div className="mobile-user-avatar">
                  {user.name ? user.name[0].toUpperCase() : "U"}
                </div>
                <div className="mobile-user-info">
                  <strong className="mobile-user-name">{user.name}</strong>
                  <span className="mobile-user-email">{user.email}</span>
                </div>
              </div>

              <div className="mobile-user-links">
                <Link
                  to="/profile"
                  className="mobile-user-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("authButton.profile", "My Profile")}
                </Link>
                <Link
                  to="/favourites"
                  className="mobile-user-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("authButton.favourites", "Saved Cars")}
                </Link>
                <Link
                  to="/saved-searches"
                  className="mobile-user-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("authButton.savedSearches", "Saved Searches")}
                </Link>
              </div>

              <button
                type="button"
                className="mobile-logout-btn"
                onClick={handleMobileLogout}
              >
                {t("authButton.logout", "Log Out")}
              </button>
            </div>
          ) : (
            <div className="mobile-auth-actions">
              <Link
                to="/login"
                className="mobile-login-btn"
                onClick={() => setMenuOpen(false)}
              >
                {t("authButton.login", "Log In")}
              </Link>
              <Link
                to="/register"
                className="mobile-register-btn"
                onClick={() => setMenuOpen(false)}
              >
                {t("authButton.register", "Create Account")}
              </Link>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

export default Header;
