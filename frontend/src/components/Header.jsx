import { Link } from "react-router-dom";
import AuthButton from "./AuthButton";
import "./Header.css";

function Header() {
  return (
    <div className="header-wrapper">
      <header className="site-header">
        <div className="header-left">
          <Link to="/" className="header-brand" aria-label="Piață Auto Second-Hand">
            <div className="brand-icon">
              <img src="/icon1.png" alt="Piață Auto Second-Hand logo" />
            </div>
            <span>CarAnalytics</span>
          </Link>
        </div>
        <div className="header-right">
          <Link to="/" className="header-nav-link">
            Acasă
          </Link>
          <Link to="/listings" className="header-nav-link">
            Piață
          </Link>
          <Link to="/anomaly-risk" className="header-nav-link">
            Analiza Risc
          </Link>
          
          <AuthButton />
        </div>
      </header>
    </div>
  );
}

export default Header;
