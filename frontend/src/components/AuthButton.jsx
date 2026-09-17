import { useState } from "react";
import "./AuthButton.css";

function AuthButton() {
  const [isOpen, setIsOpen] = useState(false);

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  return (
    <div className="auth-button-wrapper">
      <button className="auth-button" onClick={toggleDropdown}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
        Account
        <span className={isOpen ? "arrow arrow-open" : "arrow"}>▼</span>
    </button>
      {isOpen && (
        <div className="auth-dropdown">
          <div className="auth-dropdown-item">Login</div>
          <div className="auth-dropdown-item">Register</div>
        </div>
      )}
    </div>
  );
}

export default AuthButton;