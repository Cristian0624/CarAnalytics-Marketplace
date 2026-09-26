
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchListingsPaginated } from "../api/listings";
import CarCard from "../components/CarCard";
import ListingFilters from "../components/ListingFilters";
import "./ListingsPage.css";

const ITEMS_PER_PAGE = 45;

const INITIAL_FILTERS = {
  search: "",

  brandText: "",
  modelText: "",
  generationText: "",

  price_min: "",
  price_max: "",

  mileage_min: "",
  mileage_max: "",

  year_min: "",
  year_max: "",

  engine_min: "",
  engine_max: "",

  horsepower_min: "",
  horsepower_max: "",

  fuel_type: [],
  gearbox: [],
  body_types: [],
  state: [],
  drivetrains: [],

  doors_min: "",
  doors_max: "",

  seats_min: "",
  seats_max: "",

  seller_type: [],
  registration_country: [],

  same_model: null,

  class: [],

  score_min: "",
  score_max: "",

  sort_by: "",
  sort_order: "",
};

function ListingsPage() {
  const { user, loading: authLoading } = useAuth();

  const [cars, setCars] = useState([]);
  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);
  const [totalCars, setTotalCars] = useState(0);

  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const [expandedCarId, setExpandedCarId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadListings(currentFilters, currentPage) {
    setLoading(true);
    setError("");

    try {

      const apiFilters = {};

      if (currentFilters.search?.trim()) {
        apiFilters.search =
          currentFilters.search?.trim();
      }

      if (currentFilters.brandText?.trim()) {
        apiFilters.brand = [
          currentFilters.brandText?.trim(),
        ];
      }

      if (currentFilters.modelText?.trim()) {
        apiFilters.model = [
          currentFilters.modelText?.trim(),
        ];
      }

      if (currentFilters.generationText?.trim()) {
        apiFilters.generation = [
          currentFilters.generationText?.trim(),
        ];
      }
      if (currentFilters.price_min !== "" && currentFilters.price_min != null) {
        apiFilters.price_min = Number(
          currentFilters.price_min
        );
      }

      if (currentFilters.price_max !== "" && currentFilters.price_max != null) {
        apiFilters.price_max = Number(
          currentFilters.price_max
        );
      }

      if (currentFilters.mileage_min !== "" && currentFilters.mileage_min != null) {
        apiFilters.mileage_min = Number(
          currentFilters.mileage_min
        );
      }

      if (currentFilters.mileage_max !== "" && currentFilters.mileage_max != null) {
        apiFilters.mileage_max = Number(
          currentFilters.mileage_max
        );
      }

      if (currentFilters.year_min !== "" && currentFilters.year_min != null) {
        apiFilters.year_min = Number(
          currentFilters.year_min
        );
      }

      if (currentFilters.year_max !== "" && currentFilters.year_max != null) {
        apiFilters.year_max = Number(
          currentFilters.year_max
        );
      }

      if (currentFilters.engine_min !== "" && currentFilters.engine_min != null) {
        apiFilters.engine_min = Number(
          currentFilters.engine_min
        );
      }

      if (currentFilters.engine_max !== "" && currentFilters.engine_max != null) {
        apiFilters.engine_max = Number(
          currentFilters.engine_max
        );
      }

      if (currentFilters.horsepower_min !== "" && currentFilters.horsepower_min != null) {
        apiFilters.horsepower_min = Number(
          currentFilters.horsepower_min
        );
      }

      if (currentFilters.horsepower_max !== "" && currentFilters.horsepower_max != null) {
        apiFilters.horsepower_max = Number(
          currentFilters.horsepower_max
        );
      }

      if (currentFilters.doors_min !== "" && currentFilters.doors_min != null) {
        apiFilters.doors_min = Number(
          currentFilters.doors_min
        );
      }

      if (currentFilters.doors_max !== "" && currentFilters.doors_max != null) {
        apiFilters.doors_max = Number(
          currentFilters.doors_max
        );
      }

      if (currentFilters.seats_min !== "" && currentFilters.seats_min != null) {
        apiFilters.seats_min = Number(
          currentFilters.seats_min
        );
      }

      if (currentFilters.seats_max !== "" && currentFilters.seats_max != null) {
        apiFilters.seats_max = Number(
          currentFilters.seats_max
        );
      }

      if (currentFilters.score_min !== "" && currentFilters.score_min != null) {
        apiFilters.score_min = Number(
          currentFilters.score_min
        );
      }

      if (currentFilters.score_max !== "" && currentFilters.score_max != null) {
        apiFilters.score_max = Number(
          currentFilters.score_max
        );
      }


      if (currentFilters.fuel_type?.length > 0) {
        apiFilters.fuel_type =
          currentFilters.fuel_type;
      }

      if (currentFilters.gearbox?.length > 0) {
        apiFilters.gearbox =
          currentFilters.gearbox;
      }

      if (currentFilters.body_types?.length > 0) {
        apiFilters.body_types =
          currentFilters.body_types;
      }

      if (currentFilters.state?.length > 0) {
        apiFilters.state =
          currentFilters.state;
      }

      if (currentFilters.drivetrains?.length > 0) {
        apiFilters.drivetrains =
          currentFilters.drivetrains;
      }

      if (currentFilters.seller_type?.length > 0) {
        apiFilters.seller_type =
          currentFilters.seller_type;
      }

      if (
        currentFilters.registration_country?.length > 0
      ) {
        apiFilters.registration_country =
          currentFilters.registration_country;
      }

      if (currentFilters.class?.length > 0) {
        apiFilters.class =
          currentFilters.class;
      }
      if (currentFilters.same_model !== null) {
        apiFilters.same_model =
          currentFilters.same_model;
      }

      if (currentFilters.sort_by) {
        apiFilters.sort_by =
          currentFilters.sort_by;
      }

      if (currentFilters.sort_order) {
        apiFilters.sort_order =
          currentFilters.sort_order;
      }

      console.log(
        "Listing filters sent to backend:",
        apiFilters
      );

      const data = await searchListingsPaginated(
        apiFilters,
        currentPage,
        ITEMS_PER_PAGE
      );

      setCars(data.items ?? []);
      setTotalPages(data.pages ?? 1);
      setTotalCars(data.total ?? 0);

      setExpandedCarId(null);
    } catch (err) {
      console.error(
        "Failed to load listings:",
        err
      );

      setError(
        err.message ||
          "Failed to load car listings."
      );

      setCars([]);
      setTotalPages(1);
      setTotalCars(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) {
      loadListings(filters, page);
    }
  }, [page, authLoading]);

      function handleSearch(overrideFilters) {
    let finalFilters = filters;
    if (overrideFilters && typeof overrideFilters === 'object' && !overrideFilters.nativeEvent && !overrideFilters.type) {
      finalFilters = overrideFilters;
    }
    setPage(1);
    loadListings(finalFilters, 1);
    setTimeout(() => {
      document.getElementById('listings-results-start')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  function handleReset() {
    setFilters(INITIAL_FILTERS);
    setPage(1);
    loadListings(INITIAL_FILTERS, 1);
    setTimeout(() => {
      document.getElementById('listings-results-start')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  function handleCardClick(carId) {
    setExpandedCarId((current) =>
      current === carId ? null : carId
    );
  }

  function handlePreviousPage() {
    if (page > 1) {
      setPage((current) => current - 1);
      setTimeout(() => {
        document.getElementById('listings-results-start')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  function handleNextPage() {
    if (page < totalPages) {
      setPage((current) => current + 1);
      setTimeout(() => {
        document.getElementById('listings-results-start')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }

  if (authLoading) {
    return (
      <main className="home-main">
        <div className="marketplace-loading">
          Se încarcă...
        </div>
      </main>
    );
  }

  const rows = [];

  for (let i = 0; i < cars.length; i += 3) {
    rows.push(cars.slice(i, i + 3));
  }

  return (
    <main className="home-main">


      <ListingFilters
        filters={filters}
        setFilters={setFilters}
        onSearch={handleSearch}
        onReset={handleReset}
        loading={loading}
      />

      <div id="listings-results-start" style={{ scrollMarginTop: '20px' }}></div>

      {loading && (
        <div className="marketplace-loading">
          <p>Se încarcă mașinile...</p>
        </div>
      )}

      {!loading && error && (
        <div className="marketplace-error">
          <p>{error}</p>

          <button
            onClick={() =>
              loadListings(filters, page)
            }
          >
            Încearcă din nou
          </button>
        </div>
      )}

      {!loading &&
        !error &&
        cars.length === 0 && (
          <div className="marketplace-empty">
            <h2>Nu au fost găsite mașini</h2>

            <p>
              Try changing your filters or search
              criteria.
            </p>
          </div>
        )}

      {!loading &&
        !error &&
        cars.length > 0 && (
          <>
            <div className="cars-marketplace">
              {rows.map((row, rowIndex) => {
                const expandedCarIndex =
                  row.findIndex(
                    (car) =>
                      car.id === expandedCarId
                  );

                const expandedCar =
                  expandedCarIndex !== -1
                    ? row[expandedCarIndex]
                    : null;

                const expandedPosition =
                  expandedCarIndex === 0
                    ? "left"
                    : expandedCarIndex === 1
                    ? "middle"
                    : "right";

                return (
                  <div
                    className="car-row"
                    key={rowIndex}
                  >
                    {expandedCar ? (
                      <CarCard
                        car={expandedCar}
                        expanded={true}
                        position={
                          expandedPosition
                        }
                        onClick={() =>
                          handleCardClick(
                            expandedCar.id
                          )
                        }
                      />
                    ) : (
                      row.map((car, index) => {
                        const position =
                          index === 0
                            ? "left"
                            : index === 1
                            ? "middle"
                            : "right";

                        return (
                          <CarCard
                            key={car.id}
                            car={car}
                            expanded={false}
                            position={position}
                            onClick={() =>
                              handleCardClick(
                                car.id
                              )
                            }
                          />
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>

            <nav className="pagination">
              <button
                className="pagination-button"
                disabled={
                  page === 1 || loading
                }
                onClick={
                  handlePreviousPage
                }
              >
                ← Precedenta
              </button>

              <span className="pagination-info">
                Pagina {page} din {totalPages}
              </span>

              <button
                className="pagination-button"
                disabled={
                  page === totalPages ||
                  loading
                }
                onClick={handleNextPage}
              >
                Următoarea →
              </button>
            </nav>
          </>
        )}
    </main>
  );
}

export default ListingsPage;

