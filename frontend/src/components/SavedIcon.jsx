export default function SavedIcon({ name, className = "" }) {
  const paths = {
    favourites: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    risks: <><path d="M12 3 4 6v6c0 4.5 8 9 8 9s8-4.5 8-9V6l-8-3Z" /><path d="m8 12 2.5 2.5L16 9" /></>,
    searches: <><path d="M4 6h16M4 12h16M4 18h16" /><path d="M8 4v4m8 2v4M10 16v4" /></>,
    comparisons: <path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" />,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    myListings: <><path d="m5 11 2-6h10l2 6M4 11h16v7H4zM6 18v3m12-3v3M7 14h1m8 0h1" /></>,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    forward: <path d="M4 12h16m-6-6 6 6-6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    edit: <><path d="m15 4 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" /></>,
    delete: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
    refresh: <><path d="M20 4v6h-6M4 20v-6h6" /><path d="M5.6 8a7 7 0 0 1 11.5-3L20 10M4 14l2.9 5A7 7 0 0 0 18.4 16" /></>,
  };
  return (
    <svg className={`saved-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.searches}
    </svg>
  );
}
