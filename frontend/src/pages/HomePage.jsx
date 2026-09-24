
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchListingsPaginated } from "../api/listings";
import CarCard from "../components/CarCard";
import ListingFilters from "../components/ListingFilters";
import "./HomePage.css";

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

function HomePage() {
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

      if (currentFilters.search.trim()) {
        apiFilters.search =
          currentFilters.search.trim();
      }

      if (currentFilters.brandText.trim()) {
        apiFilters.brand = [
          currentFilters.brandText.trim(),
        ];
      }

      if (currentFilters.modelText.trim()) {
        apiFilters.model = [
          currentFilters.modelText.trim(),
        ];
      }

      if (currentFilters.generationText.trim()) {
        apiFilters.generation = [
          currentFilters.generationText.trim(),
        ];
      }
      if (currentFilters.price_min !== "") {
        apiFilters.price_min = Number(
          currentFilters.price_min
        );
      }

      if (currentFilters.price_max !== "") {
        apiFilters.price_max = Number(
          currentFilters.price_max
        );
      }

      if (currentFilters.mileage_min !== "") {
        apiFilters.mileage_min = Number(
          currentFilters.mileage_min
        );
      }

      if (currentFilters.mileage_max !== "") {
        apiFilters.mileage_max = Number(
          currentFilters.mileage_max
        );
      }

      if (currentFilters.year_min !== "") {
        apiFilters.year_min = Number(
          currentFilters.year_min
        );
      }

      if (currentFilters.year_max !== "") {
        apiFilters.year_max = Number(
          currentFilters.year_max
        );
      }

      if (currentFilters.engine_min !== "") {
        apiFilters.engine_min = Number(
          currentFilters.engine_min
        );
      }

      if (currentFilters.engine_max !== "") {
        apiFilters.engine_max = Number(
          currentFilters.engine_max
        );
      }

      if (currentFilters.horsepower_min !== "") {
        apiFilters.horsepower_min = Number(
          currentFilters.horsepower_min
        );
      }

      if (currentFilters.horsepower_max !== "") {
        apiFilters.horsepower_max = Number(
          currentFilters.horsepower_max
        );
      }

      if (currentFilters.doors_min !== "") {
        apiFilters.doors_min = Number(
          currentFilters.doors_min
        );
      }

      if (currentFilters.doors_max !== "") {
        apiFilters.doors_max = Number(
          currentFilters.doors_max
        );
      }

      if (currentFilters.seats_min !== "") {
        apiFilters.seats_min = Number(
          currentFilters.seats_min
        );
      }

      if (currentFilters.seats_max !== "") {
        apiFilters.seats_max = Number(
          currentFilters.seats_max
        );
      }

      if (currentFilters.score_min !== "") {
        apiFilters.score_min = Number(
          currentFilters.score_min
        );
      }

      if (currentFilters.score_max !== "") {
        apiFilters.score_max = Number(
          currentFilters.score_max
        );
      }


      if (currentFilters.fuel_type.length > 0) {
        apiFilters.fuel_type =
          currentFilters.fuel_type;
      }

      if (currentFilters.gearbox.length > 0) {
        apiFilters.gearbox =
          currentFilters.gearbox;
      }

      if (currentFilters.body_types.length > 0) {
        apiFilters.body_types =
          currentFilters.body_types;
      }

      if (currentFilters.state.length > 0) {
        apiFilters.state =
          currentFilters.state;
      }

      if (currentFilters.drivetrains.length > 0) {
        apiFilters.drivetrains =
          currentFilters.drivetrains;
      }

      if (currentFilters.seller_type.length > 0) {
        apiFilters.seller_type =
          currentFilters.seller_type;
      }

      if (
        currentFilters.registration_country.length > 0
      ) {
        apiFilters.registration_country =
          currentFilters.registration_country;
      }

      if (currentFilters.class.length > 0) {
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

  function handleSearch() {

    setPage(1);

    loadListings(filters, 1);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleReset() {
    setFilters(INITIAL_FILTERS);
    setPage(1);

    loadListings(INITIAL_FILTERS, 1);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function handleCardClick(carId) {
    setExpandedCarId((current) =>
      current === carId ? null : carId
    );
  }

  function handlePreviousPage() {
    if (page > 1) {
      setPage((current) => current - 1);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  function handleNextPage() {
    if (page < totalPages) {
      setPage((current) => current + 1);

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }

  if (authLoading) {
    return (
      <main className="home-main">
        <div className="marketplace-loading">
          Loading...
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

      {loading && (
        <div className="marketplace-loading">
          <p>Loading cars...</p>
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
            Try again
          </button>
        </div>
      )}

      {!loading &&
        !error &&
        cars.length === 0 && (
          <div className="marketplace-empty">
            <h2>No cars found</h2>

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
                ← Previous
              </button>

              <span className="pagination-info">
                Page {page} of {totalPages}
              </span>

              <button
                className="pagination-button"
                disabled={
                  page === totalPages ||
                  loading
                }
                onClick={handleNextPage}
              >
                Next →
              </button>
            </nav>
          </>
        )}
    </main>
  );
}

export default HomePage;

