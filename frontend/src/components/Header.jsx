import { Link } from "react-router-dom";
import HomeButton from "./HomeButton";
import AuthButton from "./AuthButton";
import "./Header.css";

function Header() {
  return (
    <div className="header-wrapper">
      <header className="site-header">
        <div className="header-left">
          <Link to="/" className="header-brand" aria-label="Used-Car Marketplace">
            <div className="brand-icon">
              <img src="/icon1.png" alt="Used-Car Marketplace logo" />
            </div>
            <span>CarAnalytics</span>
          </Link>
        </div>
        <div className="header-right">
          <Link to="/" className="header-nav-link">
            Home
          </Link>
          <Link to="/listings" className="header-nav-link">
            Marketplace
          </Link>
          <AuthButton />
        </div>
      </header>
    </div>
  );
}

export default Header;