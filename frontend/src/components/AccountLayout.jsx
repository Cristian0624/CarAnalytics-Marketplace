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
    </main>
  );
}
