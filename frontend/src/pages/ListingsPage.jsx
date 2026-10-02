import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { searchListingsPaginated } from "../api/listings";
import { createSaved } from "../api/saved_items";
import { listingFiltersToApi, listingFiltersToForm, emptyListingFilters, listingFilterError } from "../utils/listingFilters";
import CarCard from "../components/CarCard";
import ListingFilters from "../components/ListingFilters";
import BackgroundTriangles from "../components/BackgroundTriangles";
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
    const validationError = listingFilterError(listingFiltersToForm(query.filters));
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }
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
    const validationError = listingFilterError(values);
    if (validationError) { setError(validationError); return; }
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

  return (
    <>
      <BackgroundTriangles />
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

