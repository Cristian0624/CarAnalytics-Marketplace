import { Link } from "react-router-dom";
import "./HomeButton.css";

function HomeButton() {
  return (
    <Link to="/" className="home-button" aria-label="Home">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
        <path d="M3 11h18a1 1 0 0 1 1 1v5h-2" />
        <path d="M2 12v5h2" />
        <circle cx="7.5" cy="17" r="1.8" />
        <circle cx="16.5" cy="17" r="1.8" />
        <path d="M9.3 17h5.4" />
      </svg>
      Home
    </Link>
  );
}

export default HomeButton;
