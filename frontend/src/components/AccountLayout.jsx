import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BackgroundTriangles from "./BackgroundTriangles";
import SavedIcon from "./SavedIcon";
import "./AccountLayout.css";

const sections = [
  ["favourites", "/favourites"],
  ["risks", "/saved-risk-assessments"],
  ["searches", "/saved-searches"],
  ["comparisons", "/saved-comparisons"],
  ["profile", "/profile"],
];

export default function AccountLayout({ active, children }) {
  const { t } = useTranslation();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const progressCircleRef = useRef(null);

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

      if (progressCircleRef.current) {
        const circumference = 150.8;
        progressCircleRef.current.style.strokeDashoffset =
          circumference * (1 - progress);
      }

      setShowScrollTop(scrollTop > 220);
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

  return (
    <main className="saved-page">
      <BackgroundTriangles />
      <div className="saved-container saved-workspace">
        <nav className="account-navigation" aria-label={t("savedItems.tabs.ariaLabel")}>
          <p className="account-navigation-title">{t("savedItems.account")}</p>
          <div className="account-navigation-links">
            {sections.map(([key, path]) => (
              <Link key={key} to={path} aria-current={key === active ? "page" : undefined}>
                <SavedIcon name={key} />
                <span>{t(`savedItems.titles.${key}`)}</span>
                <SavedIcon name="chevron" className="account-nav-chevron" />
              </Link>
            ))}
          </div>
          <Link className="account-market-link" to="/listings">
            <SavedIcon name="back" />{t("comparatorPage.backToMarket")}
          </Link>
        </nav>
        <div className="saved-content">{children}</div>
      </div>

      <button
        type="button"
        className={`scroll-top-button ${showScrollTop ? "is-visible" : ""}`}
        onClick={scrollToTop}
        aria-label={t("listings.backToTop", "Back to top")}
        title={t("listings.backToTop", "Back to top")}
      >
        <svg className="scroll-top-ring" viewBox="0 0 56 56" aria-hidden="true">
          <circle className="scroll-top-ring-track" cx="28" cy="28" r="24" />
          <circle
            ref={progressCircleRef}
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
          aria-hidden="true"
        >
          <path
            d="M7 14L12 9L17 14"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M7 19L12 14L17 19"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </main>
  );
}
