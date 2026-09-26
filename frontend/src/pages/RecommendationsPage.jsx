import { useEffect, useState } from "react";
import { searchListingsPaginated } from "../api/listings";
import { getRecommendationsForCar } from "../api/recommendations";
import CarCard from "../components/CarCard";
import "./RecommendationsPage.css";

const ITEMS_PER_PAGE = 12;

function RecommendationsPage() {
  const [cars, setCars] = useState([]);
  const [recommendations, setRecommendations] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState({});
  const [error, setError] = useState("");
  const [expandedCarId, setExpandedCarId] = useState(null);

  useEffect(() => {
    loadCars();
  }, []);

  async function loadCars() {
    setLoading(true);
    setError("");

    try {
      const data = await searchListingsPaginated(
        {},
        1,
        ITEMS_PER_PAGE
      );

      setCars(data.items ?? []);
    } catch (err) {
      console.error("Failed to load cars:", err);
      setError(err.message || "Failed to load cars.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRecommendations(carId) {
    if (recommendations[carId]) {
      return;
    }

    setLoadingRecommendations((current) => ({
      ...current,
      [carId]: true,
    }));

    try {
      const data = await getRecommendationsForCar(carId);

      console.log("Recommendations response:", data);

      let items = [];

      if (Array.isArray(data)) {
        items = data;
      } else if (Array.isArray(data.items)) {
        items = data.items;
      } else if (Array.isArray(data.recommendations)) {
        items = data.recommendations;
      }

      setRecommendations((current) => ({
        ...current,
        [carId]: items,
      }));
    } catch (err) {
      console.error("Failed to load recommendations:", err);

      setRecommendations((current) => ({
        ...current,
        [carId]: [],
      }));
    } finally {
      setLoadingRecommendations((current) => ({
        ...current,
        [carId]: false,
      }));
    }
  }

  function handleCarClick(carId) {
    if (expandedCarId === carId) {
      setExpandedCarId(null);
      return;
    }

    setExpandedCarId(carId);
    loadRecommendations(carId);
  }

  function getPosition(index) {
    if (index === 0) return "left";
    if (index === 1) return "middle";
    return "right";
  }

  if (loading) {
    return (
      <main className="recommendations-main">
        <div className="recommendations-loading">
          Se încarcă mașinile...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="recommendations-main">
        <div className="recommendations-error">
          <h2>Ceva nu a mers bine</h2>
          <p>{error}</p>

          <button onClick={loadCars}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="recommendations-main">

      <section className="recommendations-header">

        <button
          className="recommendations-back-button"
          onClick={() => window.history.back()}
        >
          ← Back to marketplace
        </button>

        <h1>Mașini recomandate</h1>

        <p>
          Choose a car to find similar listings.
        </p>

      </section>

      <section className="recommendations-info">

        <span>✨</span>

        <div>
          <strong>
            How recommendations work
          </strong>

          <p>
            Select a listing and we will find similar cars
            based on price, mileage and vehicle class.
          </p>
        </div>

      </section>

      {cars.length === 0 ? (

        <div className="recommendations-empty">
          <h2>Nu au fost găsite mașini</h2>

          <p>
            There are currently no listings available.
          </p>
        </div>

      ) : (

        <div className="recommendations-list">

          {cars.map((car, index) => {

            const expanded =
              expandedCarId === car.id;

            return (
              <section
                key={car.id}
                className={
                  `recommendation-item ${
                    expanded
                      ? "recommendation-item-expanded"
                      : ""
                  }`
                }
              >

                <div className="recommendation-source-card">

                  <CarCard
                    car={car}
                    expanded={expanded}
                    position={getPosition(index % 3)}
                    onClick={() =>
                      handleCarClick(car.id)
                    }
                  />

                </div>

                {expanded && (

                  <div className="recommendation-results">

                    <div className="recommendation-results-header">

                      <div>
                        <h2>
                          Similar cars
                        </h2>

                        <p>
                          Suggestions based on this listing.
                        </p>
                      </div>

                      {loadingRecommendations[car.id] && (
                        <span>
                          Finding cars...
                        </span>
                      )}

                    </div>

                    {loadingRecommendations[car.id] ? (

                      <div className="recommendation-loading">
                        Finding recommendations...
                      </div>

                    ) : (

                      (recommendations[car.id] ?? []).length === 0 ? (

                        <div className="recommendation-empty">
                          <p>
                            No similar cars were found.
                          </p>
                        </div>

                      ) : (

                        <div className="recommendation-grid">

                          {(recommendations[car.id] ?? []).map(
                            (recommendedCar) => (

                              <div
                                key={recommendedCar.id}
                                className="recommendation-card"
                              >

                                <CarCard
                                  car={recommendedCar}
                                  expanded={false}
                                  position="middle"
                                  onClick={() =>
                                    handleCarClick(
                                      recommendedCar.id
                                    )
                                  }
                                />

                              </div>

                            )
                          )}

                        </div>

                      )
                    )}

                  </div>

                )}

              </section>
            );
          })}

        </div>

      )}

    </main>
  );
}

export default RecommendationsPage;