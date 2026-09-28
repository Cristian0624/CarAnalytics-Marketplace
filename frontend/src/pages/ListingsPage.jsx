import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { searchListingsPaginated } from "../api/listings";
import { createSaved } from "../api/saved_items";
import { listingFiltersToApi, listingFiltersToForm, emptyListingFilters } from "../utils/listingFilters";
import CarCard from "../components/CarCard";
import ListingFilters from "../components/ListingFilters";
import SaveItemButton from "../components/SaveItemButton";
import "./ListingsPage.css";

const ITEMS_PER_PAGE = 45;

export default function ListingsPage() {
  const location = useLocation();
  return <ListingSearch key={location.key} initialFilters={location.state?.savedFilters} />;
}

function ListingSearch({ initialFilters }) {
  const [filters, setFilters] = useState(() => listingFiltersToForm(initialFilters));
  // Draft edits never change the filters used for pagination or saving.
  const [query, setQuery] = useState(() => ({ filters: listingFiltersToApi(listingFiltersToForm(initialFilters)), page: 1, applied: Boolean(initialFilters) }));
  const [data, setData] = useState({ items: [], pages: 0, total: 0 });
  const [expandedCarId, setExpandedCarId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    searchListingsPaginated(query.filters, query.page, ITEMS_PER_PAGE).then((response) => {
      if (current) { setData(response); setExpandedCarId(null); }
    }).catch((err) => {
      if (current) setError(err.message || "Nu am putut încărca anunțurile.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query]);

  function scrollToResults() {
    document.getElementById("listings-results-start")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSearch(override) {
    const values = override && typeof override === "object" && !override.nativeEvent && !override.type ? override : filters;
    setFilters(values);
    setQuery({ filters: listingFiltersToApi(values), page: 1, applied: true });
    scrollToResults();
  }

  function handleReset() {
    setFilters(emptyListingFilters());
    setQuery({ filters: {}, page: 1, applied: false });
  }

  function changePage(page) {
    setQuery((current) => ({ ...current, page }));
    scrollToResults();
  }

  const rows = [];
  for (let index = 0; index < data.items.length; index += 3) rows.push(data.items.slice(index, index + 3));
  const saveAction = query.applied && !loading && !error && <SaveItemButton key={JSON.stringify(query.filters)}
    label="Salveaza filtrele" defaultName={[...(query.filters.brand ?? []), ...(query.filters.model ?? [])].join(" ") || "Căutarea mea"}
    path="/saved-searches" onSave={(name) => createSaved("searches", { name, filters: query.filters })} />;

  const triangles = [
    { id: 1, side: 'left', top: '5%', size: 120, color: '#d32f2f', delay: '-0s', rot: 15, offset: '-30px' },
    { id: 2, side: 'left', top: '25%', size: 80, color: '#ed6c02', delay: '-2s', rot: -45, offset: '10px' },
    { id: 3, side: 'left', top: '45%', size: 150, color: '#2e7d32', delay: '-4s', rot: 30, offset: '-40px' },
    { id: 4, side: 'left', top: '65%', size: 90, color: '#d32f2f', delay: '-1s', rot: 110, offset: '20px' },
    { id: 5, side: 'left', top: '85%', size: 110, color: '#ed6c02', delay: '-3s', rot: -20, offset: '-10px' },
    { id: 6, side: 'right', top: '10%', size: 100, color: '#2e7d32', delay: '-1.5s', rot: 60, offset: '15px' },
    { id: 7, side: 'right', top: '30%', size: 140, color: '#d32f2f', delay: '-3.5s', rot: -15, offset: '-25px' },
    { id: 8, side: 'right', top: '50%', size: 90, color: '#ed6c02', delay: '-0.5s', rot: 45, offset: '30px' },
    { id: 9, side: 'right', top: '75%', size: 130, color: '#2e7d32', delay: '-2.5s', rot: -80, offset: '-35px' },
    { id: 10, side: 'right', top: '90%', size: 80, color: '#d32f2f', delay: '-4.5s', rot: 25, offset: '5px' },
  ];

  return (
    <>
      <div className="background-shapes">
        {triangles.map(t => (
          <svg key={t.id} className="floating-shape" style={{
            width: t.size, height: t.size, color: t.color,
            top: t.top,
            [t.side]: t.offset,
            animationDelay: t.delay,
            '--rot': `${t.rot}deg`
          }} viewBox="-20 -20 140 140" xmlns="http://www.w3.org/2000/svg">
            <polygon points="50,0 100,100 0,100" fill="currentColor" stroke="currentColor" strokeWidth="30" strokeLinejoin="round"/>
          </svg>
        ))}
      </div>
      <main className="home-main">
    <ListingFilters filters={filters} setFilters={setFilters} onSearch={handleSearch} onReset={handleReset}
      loading={loading} actions={saveAction} initiallyOpen={Boolean(initialFilters)} />
    <div id="listings-results-start" style={{ scrollMarginTop: "20px" }} />
    {loading && <div className="marketplace-loading" role="status">Se încarcă mașinile...</div>}
    {!loading && error && <div className="marketplace-error" role="alert"><p>{error}</p><button onClick={() => setQuery((current) => ({ ...current }))}>Încearcă din nou</button></div>}
    {!loading && !error && data.items.length === 0 && <div className="marketplace-empty"><h2>Nu au fost găsite mașini</h2><p>Încearcă alte filtre.</p></div>}
    {!loading && !error && data.items.length > 0 && <>
      <div className="cars-marketplace">
        {rows.map((row, rowIndex) => {
          const expandedIndex = row.findIndex((car) => car.id === expandedCarId);
          const visibleCars = row;
          return <div className="car-row" key={rowIndex}>{visibleCars.map((car, index) => <CarCard key={car.id} car={car}
            expanded={car.id === expandedCarId} peeking={expandedIndex >= 0 && car.id !== expandedCarId} position={["left", "middle", "right"][expandedIndex >= 0 ? expandedIndex : index]}
            onClick={() => setExpandedCarId((current) => current === car.id ? null : car.id)} />)}</div>;
        })}
      </div>
      <nav className="pagination" aria-label="Paginare anunțuri">
        <button className="pagination-button" disabled={query.page === 1} onClick={() => changePage(query.page - 1)}>← Precedenta</button>
        <span className="pagination-info">Pagina {query.page} din {data.pages}</span>
        <button className="pagination-button" disabled={query.page >= data.pages} onClick={() => changePage(query.page + 1)}>Următoarea →</button>
      </nav>
    </>}
  </main></>);
}

