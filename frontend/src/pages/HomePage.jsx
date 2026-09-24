import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { searchListingsPaginated } from "../api/listings";
import CarCard from "../components/CarCard";
import "./HomePage.css";

const ITEMS_PER_PAGE = 45;

function HomePage() {
  const { user, loading: authLoading } = useAuth();

  const [cars, setCars] = useState([]);
  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);
  const [totalCars, setTotalCars] = useState(0);

  const [expandedCarId, setExpandedCarId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadListings() {
      setLoading(true);
      setError("");

      try {
        const data = await searchListingsPaginated(
          {},
          page,
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
      } finally {
        setLoading(false);
      }
    }

    loadListings();
  }, [page]);

  function handleCardClick(carId) {
    setExpandedCarId((current) =>
      current === carId ? null : carId
    );
  }

  function getCardPosition(index) {
    const column = index % 3;

    if (column === 0) {
      return "left";
    }

    if (column === 1) {
      return "middle";
    }

    return "right";
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
      <section className="marketplace-header">
        <div>
          <h1>Find your next car</h1>

          <p>
            {user
              ? `Welcome back, ${user.name}.`
              : "Browse cars available on the marketplace."}
          </p>
        </div>

        {totalCars > 0 && (
          <span className="listing-count">
            {totalCars.toLocaleString()} cars
          </span>
        )}
      </section>

      {loading && (
        <div className="marketplace-loading">
          <p>Loading cars...</p>
        </div>
      )}

      {!loading && error && (
        <div className="marketplace-error">
          <p>{error}</p>

          <button onClick={() => setPage(1)}>
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
              There are currently no listings
              available.
            </p>
          </div>
        )}

{!loading &&
  !error &&
  cars.length > 0 && (
    <>
      <div className="cars-marketplace">
        {rows.map((row, rowIndex) => {
          const expandedCarIndex = row.findIndex(
            (car) => car.id === expandedCarId
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
                  position={expandedPosition}
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
                        handleCardClick(car.id)
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
          disabled={page === 1}
          onClick={handlePreviousPage}
        >
          ← Previous
        </button>

        <span className="pagination-info">
          Page {page} of {totalPages}
        </span>

        <button
          className="pagination-button"
          disabled={page === totalPages}
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