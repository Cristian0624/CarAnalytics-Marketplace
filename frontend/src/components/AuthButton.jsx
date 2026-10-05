import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import "./AuthButton.css";

function AuthButton() {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  async function handleDeconectare() {
    await logout();
    setIsOpen(false);
    navigate("/");
  }

  // Shared inner blobs component
  const Blobs = () => (
    <span className="auth-button__inner">
      <span className="auth-button__blobs">
        <span className="auth-button__blob"></span>
        <span className="auth-button__blob"></span>
        <span className="auth-button__blob"></span>
        <span className="auth-button__blob"></span>
      </span>
    </span>
  );

  return (
    <div className="auth-button-wrapper" ref={dropdownRef}>
      {/* Required SVG Filter definition for liquid goo blur */}
      <svg xmlns="http://www.w3.org/2000/svg" version="1.1" style={{ display: "none" }}>
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {loading ? (
        <button className="auth-button" disabled>
          <span className="auth-button__content">{t("authButton.account")}</span>
          <Blobs />
        </button>
      ) : user ? (
        <button className="auth-button" onClick={toggleDropdown}>
          <span className="auth-button__content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
            {user.name}
            <span className={isOpen ? "chevron chevron-open" : "chevron"}>▼</span>
          </span>
          <Blobs />
        </button>
      ) : (
        <button className="auth-button" onClick={toggleDropdown}>
          <span className="auth-button__content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
            {t("authButton.account")}
            <span className={isOpen ? "chevron chevron-open" : "chevron"}>▼</span>
          </span>
          <Blobs />
        </button>
      )}

      {isOpen && (
        <div className="auth-dropdown">
          {user ? (
            <>
              <div className="auth-dropdown-header">{user.email}</div>

              <Link
                to="/profile"
                className="auth-dropdown-item"
                onClick={() => setIsOpen(false)}
              >
                {t("authButton.profile")}
              </Link>

              <Link
                to="/my-listings"
                className="auth-dropdown-item"
                onClick={() => setIsOpen(false)}
              >
                {t("authButton.myListings")}
              </Link>

              <Link
                to="/create-listing"
                className="auth-dropdown-item"
                onClick={() => setIsOpen(false)}
              >
                {t("authButton.createListing")}
              </Link>

              <Link
                to="/favourites"
                className="auth-dropdown-item"
                onClick={() => setIsOpen(false)}
              >
                {t("authButton.favourites")}
              </Link>

              <Link
                to="/saved-risk-assessments"
                className="auth-dropdown-item"
                onClick={() => setIsOpen(false)}
              >
                {t("authButton.savedRisks")}
              </Link>

              <Link to="/saved-searches" className="auth-dropdown-item" onClick={() => setIsOpen(false)}>{t("authButton.savedSearches")}</Link><Link to="/saved-comparisons" className="auth-dropdown-item" onClick={() => setIsOpen(false)}>{t("authButton.comparisons", { defaultValue: "Comparari Salvate" })}</Link>

              <button
                className="auth-dropdown-item auth-logout"
                onClick={handleDeconectare}
              >
                {t("authButton.logout")}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="auth-dropdown-item"
                onClick={() => setIsOpen(false)}
              >
                {t("authButton.login")}
              </Link>

              <Link
                to="/register"
                className="auth-dropdown-item"
                onClick={() => setIsOpen(false)}
              >
                {t("authButton.register")}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default AuthButton;
