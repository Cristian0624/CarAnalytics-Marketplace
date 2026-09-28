import { useState } from "react";
import "./PasswordInput.scss";

function PasswordInput({ name, placeholder, value = "", onChange, required = true }) {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  return (
    <>
      {/* Hidden SVG Symbols required for rendering the monkey illustration */}
      <svg xmlns="http://www.w3.org/2000/svg" style={{ display: "none" }}>
        <symbol
          xmlns="http://www.w3.org/2000/svg"
          width="35"
          height="35"
          viewBox="0 0 64 64"
          id="monkey-hands"
        >
          <path
            fill="#89664C"
            d="M9.4,32.5L2.1,61.9H14c-1.6-7.7,4-21,4-21L9.4,32.5z"
          />
          <path
            fill="#FFD6BB"
            d="M15.8,24.8c0,0,4.9-4.5,9.5-3.9c2.3,0.3-7.1,7.6-7.1,7.6s9.7-8.2,11.7-5.6c1.8,2.3-8.9,9.8-8.9,9.8s10-8.1,9.6-4.6c-0.3,3.8-7.9,12.8-12.5,13.8C11.5,43.2,6.3,39,9.8,24.4C11.6,17,13.3,25.2,15.8,24.8"
          />
          <path
            fill="#89664C"
            d="M54.8,32.5l7.3,29.4H50.2c1.6-7.7-4-21-4-21L54.8,32.5z"
          />
          <path
            fill="#FFD6BB"
            d="M48.4,24.8c0,0-4.9-4.5-9.5-3.9c-2.3,0.3,7.1,7.6,7.1,7.6s-9.7-8.2-11.7-5.6c-1.8,2.3,8.9,9.8,8.9,9.8s-10-8.1-9.7-4.6c0.4,3.8,8,12.8,12.6,13.8c6.6,1.3,11.8-2.9,8.3-17.5C52.6,17,50.9,25.2,48.4,24.8"
          />
        </symbol>
        <symbol
          xmlns="http://www.w3.org/2000/svg"
          width="35"
          height="35"
          viewBox="0 0 64 64"
          id="monkey"
        >
          <ellipse cx="53.7" cy="33" rx="8.3" ry="8.2" fill="#89664c" />
          <ellipse cx="53.7" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
          <ellipse cx="10.2" cy="33" rx="8.2" ry="8.2" fill="#89664c" />
          <ellipse cx="10.2" cy="33" rx="5.4" ry="5.4" fill="#ffc5d3" />
          <g fill="#89664c">
            <path d="m43.4 10.8c1.1-.6 1.9-.9 1.9-.9-3.2-1.1-6-1.8-8.5-2.1 1.3-1 2.1-1.3 2.1-1.3-20.4-2.9-30.1 9-30.1 19.5h46.4c-.7-7.4-4.8-12.4-11.8-15.2" />
            <path d="m55.3 27.6c0-9.7-10.4-17.6-23.3-17.6s-23.3 7.9-23.3 17.6c0 2.3.6 4.4 1.6 6.4-1 2-1.6 4.2-1.6 6.4 0 9.7 10.4 17.6 23.3 17.6s23.3-7.9 23.3-17.6c0-2.3-.6-4.4-1.6-6.4 1-2 1.6-4.2 1.6-6.4" />
          </g>
          <path
            d="m52 28.2c0-16.9-20-6.1-20-6.1s-20-10.8-20 6.1c0 4.7 2.9 9 7.5 11.7-1.3 1.7-2.1 3.6-2.1 5.7 0 6.1 6.6 11 14.7 11s14.7-4.9 14.7-11c0-2.1-.8-4-2.1-5.7 4.4-2.7 7.3-7 7.3-11.7"
            fill="#e0ac7e"
          />
          <g fill="#3b302a">
            <path d="m35.1 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.6.1 1 1 1 2.1" />
            <path d="m30.9 38.7c0 1.1-.4 2.1-1 2.1-.6 0-1-.9-1-2.1 0-1.1.4-2.1 1-2.1.5.1 1 1 1 2.1" />
            <ellipse cx="40.7" cy="31.7" rx="3.5" ry="4.5" />
            <ellipse cx="23.3" cy="31.7" rx="3.5" ry="4.5" />
          </g>
        </symbol>
      </svg>

      <div className={`password ${showPassword ? "show" : ""}`}>
        <div className="monkey-hands">
          <svg>
            <use href="#monkey-hands" />
          </svg>
        </div>

        <button
          type="button"
          className="monkey"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          <svg>
            <use href="#monkey" />
          </svg>
        </button>

        <div className="password-wrapper">
          <input
            className="password-input"
            name={name}
            type="password"
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            required={required}
            spellCheck="false"
          />

          <span className={`password-text ${isFocused ? "cursor" : ""}`}>
            {Array.from(value).map((char, index) => (
              <span key={index}>{char}</span>
            ))}
          </span>

          <span className={`password-dots ${isFocused ? "cursor" : ""}`}>
            {Array.from(value).map((char, index) => (
              <span key={index}>{char}</span>
            ))}
          </span>
        </div>
      </div>
    </>
  );
}

export default PasswordInput;