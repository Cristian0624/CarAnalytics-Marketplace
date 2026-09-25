import "./CarCard.css";

function getScoreClass(score) {
  const value = Number(score);

  if (value < 30) {
    return "score-red";
  }

  if (value < 60) {
    return "score-orange";
  }

  return "score-green";
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return value;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (Number.isNaN(number)) {
    return value;
  }

  return number.toLocaleString();
}

function CarCard({
  car,
  expanded,
  position,
  onClick,
}) {
  const score = Number(car.score);

  function openOriginalListing(event) {
    event.stopPropagation();

    if (car.url) {
      window.open(car.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <article
      className={`car-card ${
        expanded ? "car-card-expanded" : ""
      } car-card-${position}`}
      onClick={onClick}
    >
      {!expanded ? (
        <>

          <div className="car-card-content">
            <div className="car-card-title-row">
              <div>
                <h3>
                  {formatValue(car.brand)}{" "}
                  {formatValue(car.model)}
                </h3>

                {car.generation && (
                  <p className="car-generation">
                    {car.generation}
                  </p>
                )}
              </div>

              {car.score !== null &&
                car.score !== undefined && (
                  <span
                    className={`score-badge ${getScoreClass(
                      score
                    )}`}
                  >
                    {score.toFixed(0)}
                  </span>
                )}
            </div>

            <div className="car-details">
              <span>{formatValue(car.year)}</span>

              <span>
                {formatNumber(car.mileage)} km
              </span>
            </div>

            <div className="car-card-bottom">
              <strong>
                €{formatNumber(car.price_eur)}
              </strong>
            </div>
          </div>
        </>
      ) : (
        <div className="car-expanded-content">
          <button
            className="original-listing-button"
            onClick={openOriginalListing}
            title="Open original listing"
          >
            Open Listing
          </button>

          <button
            className="close-card-button"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
            title="Close"
          >
            ×
          </button>

          <div className="expanded-header">
            <div>
              <h2>
                {formatValue(car.brand)}{" "}
                {formatValue(car.model)}
              </h2>

              {car.generation && (
                <p>{car.generation}</p>
              )}
            </div>

            {car.score !== null &&
              car.score !== undefined && (
                <div
                  className={`expanded-score ${getScoreClass(
                    score
                  )}`}
                >
                  <span className="score-value">
                    {score.toFixed(0)}
                  </span>

                  <span className="score-label">
                    Score
                  </span>
                </div>
              )}
          </div>

          <div className="expanded-main">
    

            <div className="expanded-information">
              <div className="information-group">

                <div className="information-grid">
                  <div>
                    <span>Brand</span>
                    <strong>{formatValue(car.brand)}</strong>
                  </div>

                  <div>
                    <span>Model</span>
                    <strong>{formatValue(car.model)}</strong>
                  </div>

                  <div>
                    <span>Generation</span>
                    <strong>
                      {formatValue(car.generation)}
                    </strong>
                  </div>

                  <div>
                    <span>Year</span>
                    <strong>{formatValue(car.year)}</strong>
                  </div>

                  <div>
                    <span>Mileage</span>
                    <strong>
                      {formatNumber(car.mileage)} km
                    </strong>
                  </div>

                  <div>
                    <span>Price</span>
                    <strong>
                      €{formatNumber(car.price_eur)}
                    </strong>
                  </div>

                  <div>
                    <span>Engine</span>
                    <strong>
                      {formatValue(car.engine_size)}
                    </strong>
                  </div>

                  <div>
                    <span>Horsepower</span>
                    <strong>
                      {formatValue(car.horsepower)}
                    </strong>
                  </div>

                  <div>
                    <span>Fuel</span>
                    <strong>
                      {formatValue(car.fuel_type)}
                    </strong>
                  </div>

                  <div>
                    <span>Gearbox</span>
                    <strong>
                      {formatValue(car.gearbox)}
                    </strong>
                  </div>

                  <div>
                    <span>Body</span>
                    <strong>
                      {formatValue(car.body_type)}
                    </strong>
                  </div>

                  <div>
                    <span>Drivetrain</span>
                    <strong>
                      {formatValue(car.drivetrain)}
                    </strong>
                  </div>

                  <div>
                    <span>Doors</span>
                    <strong>
                      {formatValue(car.doors)}
                    </strong>
                  </div>

                  <div>
                    <span>Seats</span>
                    <strong>
                      {formatValue(car.seats)}
                    </strong>
                  </div>

                  <div>
                    <span>State</span>
                    <strong>
                      {formatValue(car.state)}
                    </strong>
                  </div>

                  <div>
                    <span>Registration</span>
                    <strong>
                      {formatValue(
                        car.registration_country
                      )}
                    </strong>
                  </div>
                </div>
              </div>

              {car.description && (
                <div className="information-group">
                  <h4>Description</h4>

                  <p className="car-description">
                    {car.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default CarCard;