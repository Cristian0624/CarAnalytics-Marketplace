import { useState, useEffect, useRef } from "react";
import "./Autocomplete.css";

function HighlightMatch({ text, query }) {
  if (!query) return <span>{text}</span>;
  const regex = new RegExp(`(${query})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={i} className="highlight-match">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export default function Autocomplete({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSuggestions() {
      if (!isOpen) return;
      
      try {
        const results = await fetchSuggestions(value || "");
        if (active) {
          setSuggestions(results);
        }
      } catch (e) {
        if (active) setSuggestions([]);
      }
    }

    const timer = setTimeout(() => {
      loadSuggestions();
    }, 200); // debounce

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value, isOpen, fetchSuggestions]);

  return (
    <div className="autocomplete-wrapper" ref={wrapperRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="autocomplete-list">
          {suggestions.map((s, idx) => (
            <li
              key={idx}
              onMouseDown={() => {
                onSelect(s);
                setIsOpen(false);
              }}
            >
              <HighlightMatch text={s} query={value} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
