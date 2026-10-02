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

function shuffleListings(items) {
  const shuffled = [...items];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

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
  const [filterCount, setFilterCount] = useState(0);
  const [countLoading, setCountLoading] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortLabel, setSortLabel] = useState("Aleatoriu");

  useEffect(() => {
    let current = true;
  
    setLoading(true);
    setError("");
  
    const validationError = listingFilterError(
      listingFiltersToForm(query.filters)
    );
  
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }
  
    const apiFilters = {
      ...query.filters,
      ...(query.sort_by ? { sort_by: query.sort_by } : {}),
      ...(query.sort_order ? { sort_order: query.sort_order } : {}),
    };
  
    searchListingsPaginated(
      apiFilters,
      query.page,
      ITEMS_PER_PAGE
    )
      .then((response) => {
        if (current) {
          setData({
            ...response,
            items: query.sort_by
              ? response.items
              : shuffleListings(response.items),
          });
  
          setExpandedCarId(null);
        }
      })
      .catch((err) => {
        if (current) {
          setError(
            err.message || "Nu am putut încărca anunțurile."
          );
        }
      })
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });
  
    return () => {
      current = false;
    };
  }, [query]);

  useEffect(() => {
    let current = true;
  
    const validationError = listingFilterError(filters);
  
    if (validationError) {
      setFilterCount(0);
      return;
    }
  
    setCountLoading(true);
  
    searchListingsPaginated(
      listingFiltersToApi(filters),
      1,
      1
    )
      .then((response) => {
        if (current) {
          setFilterCount(response.total);
        }
      })
      .catch(() => {
        if (current) {
          setFilterCount(0);
        }
      })
      .finally(() => {
        if (current) {
          setCountLoading(false);
        }
      });
  
    return () => {
      current = false;
    };
  }, [filters]);

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
    setQuery({
      filters: {},
      page: 1,
      applied: false,
      sort_by: undefined,
      sort_order: undefined,
    });
    setSortLabel("Aleatoriu");
    setSortOpen(false);
  }

  function changePage(page) {
    setQuery((current) => ({ ...current, page }));
    scrollToResults();
  }

  const rows = [];
  for (let index = 0; index < data.items.length; index += 3) rows.push(data.items.slice(index, index + 3));
  const saveAction = !loading && !error && <SaveItemButton key={JSON.stringify(query.filters)}
    label="Salveaza filtrele" defaultName={[...(query.filters.brand ?? []), ...(query.filters.model ?? [])].join(" ") || "Căutarea mea"}
    path="/saved-searches" onSave={(name) => createSaved("searches", { name, filters: query.filters })} />;

  return (
    <>
      <BackgroundTriangles />
      <main className="home-main">
      <ListingFilters
        filters={filters}
        setFilters={setFilters}
        onSearch={handleSearch}
        onReset={handleReset}
        loading={loading}
        actions={saveAction}
        initiallyOpen={Boolean(initialFilters)}
        resultCount={filterCount}
        countLoading={countLoading}
        sortingActive={Boolean(query.sort_by)}

        barExtras={
          <div className="lf-sort">
            <button
              type="button"
              className={`lf-toggle ${sortOpen ? "open" : ""}`}
              onClick={() => setSortOpen((v) => !v)}
            >
              {sortLabel}
              <span className="lf-arrow" aria-hidden="true">▾</span>
            </button>
        
            {sortOpen && (
              <div className="lf-sort-menu">
                <button
                  type="button"
                  className={!query.sort_by ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: undefined,
                      sort_order: undefined,
                      page: 1,
                    }));
                    setSortLabel("Aleatoriu");
                    setSortOpen(false);
                  }}
                >
                  Aleatoriu
                </button>
                <button
                  type="button"
                  className={query.sort_by === "score" && query.sort_order === "desc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "score",
                      sort_order: "desc",
                      page: 1,
                    }));
                    setSortLabel("Scor: mare → mic");
                    setSortOpen(false);
                  }}
                >
                  Scor: mare → mic
                </button>
        
                <button
                  type="button"
                  className={query.sort_by === "score" && query.sort_order === "asc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "score",
                      sort_order: "asc",
                      page: 1,
                    }));
                    setSortLabel("Scor: mic → mare");
                    setSortOpen(false);
                  }}
                >
                  Scor: mic → mare
                </button>
        
                <button
                  type="button"
                  className={query.sort_by === "price_eur" && query.sort_order === "asc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "price_eur",
                      sort_order: "asc",
                      page: 1,
                    }));
                    setSortLabel("Preț: mic → mare");
                    setSortOpen(false);
                  }}
                >
                  Preț: mic → mare
                </button>
        
                <button
                  type="button"
                  className={query.sort_by === "price_eur" && query.sort_order === "desc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "price_eur",
                      sort_order: "desc",
                      page: 1,
                    }));
                    setSortLabel("Preț: mare → mic");
                    setSortOpen(false);
                  }}
                >
                  Preț: mare → mic
                </button>
        
                <button
                  type="button"
                  className={query.sort_by === "year" && query.sort_order === "desc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "year",
                      sort_order: "desc",
                      page: 1,
                    }));
                    setSortLabel("An: nou → vechi");
                    setSortOpen(false);
                  }}
                >
                  An: nou → vechi
                </button>
        
                <button
                  type="button"
                  className={query.sort_by === "year" && query.sort_order === "asc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "year",
                      sort_order: "asc",
                      page: 1,
                    }));
                    setSortLabel("An: vechi → nou");
                    setSortOpen(false);
                  }}
                >
                  An: vechi → nou
                </button>
        
                <button
                  type="button"
                  className={query.sort_by === "mileage" && query.sort_order === "asc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "mileage",
                      sort_order: "asc",
                      page: 1,
                    }));
                    setSortLabel("Kilometraj: mic → mare");
                    setSortOpen(false);
                  }}
                >
                  Kilometraj: mic → mare
                </button>
        
                <button
                  type="button"
                  className={query.sort_by === "mileage" && query.sort_order === "desc" ? "active" : ""}
                  onClick={() => {
                    setQuery((prev) => ({
                      ...prev,
                      sort_by: "mileage",
                      sort_order: "desc",
                      page: 1,
                    }));
                    setSortLabel("Kilometraj: mare → mic");
                    setSortOpen(false);
                  }}
                >
                  Kilometraj: mare → mic
                </button>
              </div>
            )}
          </div>
        }
      />
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

