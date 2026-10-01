import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthButton from "./AuthButton";
import "./Header.css";

function Header() {
  const { user } = useAuth();
  const navClass = ({ isActive }) => `header-nav-link${isActive ? " active" : ""}`;

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
          <NavLink to="/" end className={navClass}>
            Acasă
          </NavLink>
          <NavLink to="/listings" className={navClass}>
            Piață
          </NavLink>
          <NavLink to="/anomaly-risk" className={navClass}>
            Analiza Risc
          </NavLink>
          {user && (
            <NavLink to="/profile" className={navClass}>Profilul meu</NavLink>
          )}
          
          <AuthButton />
        </div>
      </header>
    </div>
  );
}

export default Header;
