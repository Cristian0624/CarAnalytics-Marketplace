import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AuthButton.css";

function AuthButton() {
  const { user, loading, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  async function handleLogout() {
    await logout();
    setIsOpen(false);
    navigate("/");
  }

  if (loading) {
    return (
      <div className="auth-button-wrapper">
        <button className="auth-button" disabled>
          Account
        </button>
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-button-wrapper">
        <button className="auth-button" onClick={toggleDropdown}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </svg>
          {user.name}
          <span className={isOpen ? "chevron chevron-open" : "chevron"}>▼</span>
        </button>

        {isOpen && (
          <div className="auth-dropdown">
            <div className="auth-dropdown-header">{user.email}</div>
            <Link to="/profile" className="auth-dropdown-item" onClick={() => setIsOpen(false)}>
              My profile
            </Link>
            <button className="auth-dropdown-item auth-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="auth-button-wrapper">
      <button className="auth-button" onClick={toggleDropdown}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
        Account
        <span className={isOpen ? "chevron chevron-open" : "chevron"}>▼</span>
      </button>

      {isOpen && (
        <div className="auth-dropdown">
          <Link to="/login" className="auth-dropdown-item" onClick={() => setIsOpen(false)}>
            Login
          </Link>
          <Link to="/register" className="auth-dropdown-item" onClick={() => setIsOpen(false)}>
            Register
          </Link>
        </div>
      )}
    </div>
  );
}

export default AuthButton;
