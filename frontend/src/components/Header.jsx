import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import AuthButton from "./AuthButton";
import "./Header.css";
import { useTranslation } from "react-i18next";

function Header() {
  const { user, logout } = useAuth();
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

        {/* Mobile Hamburger Button (3 lines button, visible on phone screens <= 768px) */}
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

        {/* Main Navigation inside Mobile Drawer */}
        <nav className="mobile-drawer-nav">
          <span className="mobile-drawer-label">
            {t("header.navigation", "Navigation")}
          </span>

          <NavLink to="/" end className={mobileNavClass}>
            <span className="mobile-nav-icon">🏠</span>
            <span>{t("header.home")}</span>
          </NavLink>

          <NavLink to="/listings" className={mobileNavClass}>
            <span className="mobile-nav-icon">🚗</span>
            <span>{t("header.listings")}</span>
          </NavLink>

          <NavLink to="/anomaly-risk" className={mobileNavClass}>
            <span className="mobile-nav-icon">⚡</span>
            <span>{t("header.riskAnalysis")}</span>
          </NavLink>

          <NavLink to="/comparator" className={mobileNavClass}>
            <span className="mobile-nav-icon">📊</span>
            <span>{t("header.comparator")}</span>
          </NavLink>

          <NavLink to="/features" className={mobileNavClass}>
            <span className="mobile-nav-icon">💡</span>
            <span>{t("header.features")}</span>
          </NavLink>

          <NavLink to="/about" className={mobileNavClass}>
            <span className="mobile-nav-icon">ℹ️</span>
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

              <Link
                to="/create-listing"
                className="mobile-create-listing-btn"
                onClick={() => setMenuOpen(false)}
              >
                <span>+</span> {t("authButton.createListing", "Create Listing")}
              </Link>

              <div className="mobile-user-links">
                <Link
                  to="/profile"
                  className="mobile-user-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <span>👤</span> {t("authButton.profile", "My Profile")}
                </Link>
                <Link
                  to="/my-listings"
                  className="mobile-user-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <span>📋</span> {t("authButton.myListings", "My Listings")}
                </Link>
                <Link
                  to="/favourites"
                  className="mobile-user-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <span>❤️</span> {t("authButton.favourites", "Saved Cars")}
                </Link>
                <Link
                  to="/saved-searches"
                  className="mobile-user-link"
                  onClick={() => setMenuOpen(false)}
                >
                  <span>🔍</span> {t("authButton.savedSearches", "Saved Searches")}
                </Link>
              </div>

              <button
                type="button"
                className="mobile-logout-btn"
                onClick={handleMobileLogout}
              >
                <span>🚪</span> {t("authButton.logout", "Log Out")}
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
