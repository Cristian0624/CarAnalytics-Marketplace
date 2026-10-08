import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { searchListingsPaginated } from "../api/listings";
import { getRecommendationsForCar } from "../api/recommendations";
import CarCard from "../components/CarCard";
import "./RecommendationsPage.css";

const ITEMS_PER_PAGE = 9;
const RECOMMENDATIONS_PER_LOAD = 6;

function RecommendationsPage() {
  const { t } = useTranslation();

  const [cars, setCars] = useState([]);
  const [recommendations, setRecommendations] = useState({});
  const [visibleRecommendations, setVisibleRecommendations] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState({});
  const [loadingMoreCars, setLoadingMoreCars] = useState(false);
  const [error, setError] = useState("");

  const [expandedCarId, setExpandedCarId] = useState(null);
  const [expandedRecommendationId, setExpandedRecommendationId] =
    useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const mainCarsTopRef = useRef(null);
  const mainCarsBottomRef = useRef(null);
  const recommendationRefs = useRef({});

  const triangles = [
    { id: 1, side: "left", top: "5%", size: 120, color: "#d32f2f", delay: "-0s", rot: 15, offset: "-30px" },
    { id: 2, side: "left", top: "25%", size: 80, color: "#ed6c02", delay: "-2s", rot: -45, offset: "10px" },
    { id: 3, side: "left", top: "45%", size: 150, color: "#2e7d32", delay: "-4s", rot: 30, offset: "-40px" },
    { id: 4, side: "left", top: "65%", size: 90, color: "#d32f2f", delay: "-1s", rot: 110, offset: "20px" },
    { id: 5, side: "left", top: "85%", size: 110, color: "#ed6c02", delay: "-3s", rot: -20, offset: "-10px" },
    { id: 6, side: "right", top: "10%", size: 100, color: "#2e7d32", delay: "-1.5s", rot: 60, offset: "15px" },
    { id: 7, side: "right", top: "30%", size: 140, color: "#d32f2f", delay: "-3.5s", rot: -15, offset: "-25px" },
    { id: 8, side: "right", top: "50%", size: 90, color: "#ed6c02", delay: "-0.5s", rot: 45, offset: "30px" },
    { id: 9, side: "right", top: "75%", size: 130, color: "#2e7d32", delay: "-2.5s", rot: -80, offset: "-35px" },
    { id: 10, side: "right", top: "90%", size: 80, color: "#d32f2f", delay: "-4.5s", rot: 25, offset: "5px" },
  ];

  useEffect(() => {
    loadCars(1, true);
  }, []);

  async function loadCars(page = 1, replace = false) {
    if (replace) {
      setLoading(true);
      setError("");
    } else {
      setLoadingMoreCars(true);
    }

    try {
      const data = await searchListingsPaginated(
        {},
        page,
        ITEMS_PER_PAGE
      );

      const newCars = data.items ?? [];

      if (replace) {
        setCars(newCars);
      } else {
        setCars((current) => [...current, ...newCars]);
      }

      setCurrentPage(page);
      setTotalPages(data.pages ?? 1);
    } catch (err) {
      console.error("Failed to load cars:", err);

      if (replace) {
        setError(err.message || t("recommendations.error"));
      }
    } finally {
      if (replace) {
        setLoading(false);
      } else {
        setLoadingMoreCars(false);
      }
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

      items = [...items].sort((a, b) => {
        const scoreA = a.score !== null && a.score !== undefined ? Number(a.score) : -Infinity;
        const scoreB = b.score !== null && b.score !== undefined ? Number(b.score) : -Infinity;
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
        return (b.similarity_score || 0) - (a.similarity_score || 0);
      });

      setRecommendations((current) => ({
        ...current,
        [carId]: items,
      }));

      setVisibleRecommendations((current) => ({
        ...current,
        [carId]: RECOMMENDATIONS_PER_LOAD,
      }));
    } catch (err) {
      console.error("Failed to load recommendations:", err);

      setRecommendations((current) => ({
        ...current,
        [carId]: [],
      }));

      setVisibleRecommendations((current) => ({
        ...current,
        [carId]: 0,
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
      setExpandedRecommendationId(null);

      setVisibleRecommendations((current) => ({
        ...current,
        [carId]: RECOMMENDATIONS_PER_LOAD,
      }));

      return;
    }

    setExpandedCarId(carId);
    setExpandedRecommendationId(null);

    setVisibleRecommendations((current) => ({
      ...current,
      [carId]: RECOMMENDATIONS_PER_LOAD,
    }));

    loadRecommendations(carId);
  }

  function handleRecommendationClick(recommendationId) {
    if (expandedRecommendationId === recommendationId) {
      setExpandedRecommendationId(null);
    } else {
      setExpandedRecommendationId(recommendationId);
    }
  }

  function loadMoreRecommendations(carId) {
    setVisibleRecommendations((current) => ({
      ...current,
      [carId]:
        (current[carId] ?? RECOMMENDATIONS_PER_LOAD) +
        RECOMMENDATIONS_PER_LOAD,
    }));

    setExpandedRecommendationId(null);
  }

  function loadPreviousRecommendations(carId) {
    setVisibleRecommendations((current) => ({
      ...current,
      [carId]: RECOMMENDATIONS_PER_LOAD,
    }));

    setExpandedRecommendationId(null);

    setTimeout(() => {
      recommendationRefs.current[carId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
  }

  function getPosition(index) {
    const position = index % 3;

    if (position === 0) return "left";
    if (position === 1) return "middle";
    return "right";
  }

  function getRecommendationRows(items) {
    const rows = [];

    for (let i = 0; i < items.length; i += 3) {
      rows.push(items.slice(i, i + 3));
    }

    return rows;
  }

  function handleLoadMoreCars() {
    if (currentPage >= totalPages || loadingMoreCars) {
      return;
    }

    loadCars(currentPage + 1, false);
  }

  function handleShowFewerCars() {
    setCars((current) =>
      current.slice(0, ITEMS_PER_PAGE)
    );

    setCurrentPage(1);

    setExpandedCarId(null);
    setExpandedRecommendationId(null);

    setTimeout(() => {
      mainCarsTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  if (loading) {
    return (
      <>
        <div className="background-shapes">
          {triangles.map((t) => (
            <svg
              key={t.id}
              className="floating-shape"
              style={{
                width: `${t.size}px`,
                height: `${t.size}px`,
                color: t.color,
                top: t.top,
                [t.side]: t.offset,
                animationDelay: t.delay,
                "--rot": `${t.rot}deg`,
              }}
              viewBox="-20 -20 140 140"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon
                points="50,0 100,100 0,100"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="30"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>

        <main className="recommendations-main">
          <div className="recommendations-loading">
            {t("recommendations.loading")}
          </div>
        </main>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="background-shapes">
          {triangles.map((t) => (
            <svg
              key={t.id}
              className="floating-shape"
              style={{
                width: `${t.size}px`,
                height: `${t.size}px`,
                color: t.color,
                top: t.top,
                [t.side]: t.offset,
                animationDelay: t.delay,
                "--rot": `${t.rot}deg`,
              }}
              viewBox="-20 -20 140 140"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polygon
                points="50,0 100,100 0,100"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="30"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>

        <main className="recommendations-main">
          <div className="recommendations-error">
            <h2>{t("recommendations.errorTitle")}</h2>

            <p>{error}</p>

            <button onClick={() => loadCars(1, true)}>
              {t("recommendations.retry")}
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <div className="background-shapes">
        {triangles.map((t) => (
          <svg
            key={t.id}
            className="floating-shape"
            style={{
              width: `${t.size}px`,
              height: `${t.size}px`,
              color: t.color,
              top: t.top,
              [t.side]: t.offset,
              animationDelay: t.delay,
              "--rot": `${t.rot}deg`,
            }}
            viewBox="-20 -20 140 140"
            xmlns="http://www.w3.org/2000/svg"
          >
            <polygon
              points="50,0 100,100 0,100"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="30"
              strokeLinejoin="round"
            />
          </svg>
        ))}
      </div>

      <main className="recommendations-main">

        <section className="recommendations-header">

          <button
            className="recommendations-back-button"
            onClick={() => window.history.back()}
          >
            <span>←</span>
            {t("recommendations.back")}
          </button>

          <div className="recommendations-title">
            <h1>{t("recommendations.title")}</h1>

            <p>
              {t("recommendations.subtitle")}
            </p>
          </div>

        </section>

        <section className="recommendations-info">

          <div className="recommendations-info-icon">
            ✨
          </div>

          <div>
            <strong>
              {t("recommendations.info.title")}
            </strong>

            <p>
              {t("recommendations.info.description")}
            </p>
          </div>

        </section>

        {cars.length === 0 ? (

          <div className="recommendations-empty">
            <h2>{t("recommendations.empty.title")}</h2>

            <p>
              {t("recommendations.empty.description")}
            </p>
          </div>

        ) : (

          <div
            className="recommendations-list"
            ref={mainCarsTopRef}
          >

            {cars.map((car, index) => {

              const expanded =
                expandedCarId === car.id;

              const carRecommendations =
                recommendations[car.id] ?? [];

              const visibleCount =
                visibleRecommendations[car.id] ??
                RECOMMENDATIONS_PER_LOAD;

              const visibleCars =
                carRecommendations.slice(0, visibleCount);

              const hasMore =
                visibleCount < carRecommendations.length;

              const hasPrevious =
                visibleCount > RECOMMENDATIONS_PER_LOAD;

              const recommendationRows =
                getRecommendationRows(visibleCars);

              return (
                <section
                  key={car.id}
                  ref={(element) => {
                    recommendationRefs.current[car.id] = element;
                  }}
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
                      position={getPosition(index)}
                      onClick={() => handleCarClick(car.id)}
                    />
                  </div>

                  {expanded && (

                    <div
                      className="recommendation-results"
                      onMouseDown={(event) => {
                        event.stopPropagation();
                      }}
                    >

                      <div className="recommendation-results-header">

                        <div>
                          <span className="recommendation-label">
                            {t("recommendations.results.label")}
                          </span>

                          <h2>
                            {t("recommendations.results.title")}
                          </h2>

                          <p>
                            {t("recommendations.results.description")}
                          </p>
                        </div>

                        {loadingRecommendations[car.id] && (
                          <span className="recommendation-status">
                            {t("recommendations.results.searching")}
                          </span>
                        )}

                      </div>

                      {loadingRecommendations[car.id] ? (

                        <div className="recommendation-loading">
                          <div className="recommendation-spinner" />

                          <span>
                            {t("recommendations.results.loading")}
                          </span>
                        </div>

                      ) : (

                        carRecommendations.length === 0 ? (

                          <div className="recommendation-empty">
                            <p>
                              {t("recommendations.results.empty")}
                            </p>
                          </div>

                        ) : (

                          <>

                            <div className="recommendation-rows">

                              {recommendationRows.map(
                                (row, rowIndex) => {

                                  const expandedInRow =
                                    row.findIndex(
                                      (recommendation) =>
                                        recommendation.id ===
                                        expandedRecommendationId
                                    );

                                  if (expandedInRow !== -1) {

                                    const recommendedCar =
                                      row[expandedInRow];

                                    return (
                                      <div
                                        key={`expanded-row-${rowIndex}`}
                                        className="recommendation-row recommendation-row-expanded"
                                      >
                                        <div
                                          className="recommendation-card recommendation-card-expanded"
                                        >
                                          <CarCard
                                            car={recommendedCar}
                                            expanded={true}
                                            position={getPosition(
                                              expandedInRow
                                            )}
                                            onClick={() =>
                                              handleRecommendationClick(
                                                recommendedCar.id
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      key={`row-${rowIndex}`}
                                      className="recommendation-row"
                                    >

                                      {row.map(
                                        (
                                          recommendedCar,
                                          columnIndex
                                        ) => {

                                          const recommendationExpanded =
                                            expandedRecommendationId ===
                                            recommendedCar.id;

                                          return (
                                            <div
                                              key={recommendedCar.id}
                                              className={
                                                `recommendation-card ${
                                                  recommendationExpanded
                                                    ? "recommendation-card-expanded"
                                                    : ""
                                                }`
                                              }
                                            >

                                              <CarCard
                                                car={recommendedCar}
                                                expanded={
                                                  recommendationExpanded
                                                }
                                                position={getPosition(
                                                  columnIndex
                                                )}
                                                onClick={() =>
                                                  handleRecommendationClick(
                                                    recommendedCar.id
                                                  )
                                                }
                                              />

                                            </div>
                                          );
                                        }
                                      )}

                                    </div>
                                  );
                                }
                              )}

                            </div>

                            <div className="recommendation-controls">

                              {hasPrevious && (
                                <button
                                  type="button"
                                  className="recommendation-previous"
                                  onMouseDown={(event) => {
                                    event.stopPropagation();
                                  }}
                                  onClick={() =>
                                    loadPreviousRecommendations(
                                      car.id
                                    )
                                  }
                                >
                                  <span className="load-more-arrow">
                                    ↑
                                  </span>

                                  <span>
                                    {t("recommendations.controls.showFewer")}
                                  </span>
                                </button>
                              )}

                              {hasMore && (
                                <button
                                  type="button"
                                  className="recommendation-load-more"
                                  onMouseDown={(event) => {
                                    event.stopPropagation();
                                  }}
                                  onClick={() =>
                                    loadMoreRecommendations(
                                      car.id
                                    )
                                  }
                                >
                                  <span>
                                    {t("recommendations.controls.showMore")}
                                  </span>

                                  <span className="load-more-arrow">
                                    ↓
                                  </span>
                                </button>
                              )}

                              <span className="recommendation-count">
                                {t("recommendations.controls.count", {
                                  visible: visibleCars.length,
                                  total: carRecommendations.length,
                                })}
                              </span>

                            </div>

                          </>

                        )
                      )}

                    </div>
                  )}

                </section>
              );
            })}

            {currentPage < totalPages && (
              <div
                className="main-cars-load-more"
                ref={mainCarsBottomRef}
              >

                {currentPage < totalPages && (
                  <button
                    type="button"
                    className="main-cars-load-more-button"
                    disabled={loadingMoreCars}
                    onClick={handleLoadMoreCars}
                  >
                    {loadingMoreCars ? (
                      <>
                        <span className="main-cars-spinner" />
                        {t("recommendations.cars.loading")}
                      </>
                    ) : (
                      <>
                        <span>
                          {t("recommendations.cars.showMore")}
                        </span>

                        <span className="main-cars-load-more-arrow">
                          ↓
                        </span>
                      </>
                    )}
                  </button>
                )}

                {currentPage > 1 && (
                  <button
                    type="button"
                    className="main-cars-previous-button"
                    onClick={handleShowFewerCars}
                  >
                    <span className="main-cars-load-more-arrow">
                      ↑
                    </span>

                    <span>
                      {t("recommendations.cars.showFewer")}
                    </span>
                  </button>
                )}

                <span className="main-cars-count">
                  {t("recommendations.cars.count", {
                    count: cars.length,
                  })}
                </span>

              </div>
            )}

          </div>
        )}

      </main>
    </>
  );
}

export default RecommendationsPage;