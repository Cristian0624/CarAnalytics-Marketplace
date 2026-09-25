import { Link } from "react-router-dom";
import "@google/model-viewer";
import "./HomePage.css";

function HomePage() {
  return (
    <div className="landing-page">
      {/* 1. Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">Powered by Advanced Algorithm Pricing</div>
          <h1 className="hero-title">Find the True Value of Any Car Instantly.</h1>
          <p className="hero-subtitle">
            Stop overpaying for used cars. Our algorithm analyzes thousands of market data points to accurately grade every listing and instantly spot overpriced scams.
          </p>
          <div className="hero-buttons">
            <Link to="/listings" className="btn-primary">Browse Marketplace</Link>
            <Link to="/register" className="btn-secondary">Sign Up Free</Link>
          </div>
        </div>
        <div className="hero-image-placeholder">
          <div className="abstract-ui">
            <div className="ui-card top">Score: 80/80 (Perfect Deal)</div>
            <div className="ui-card mid">Market Average: 14,000 €</div>
            <div className="ui-card bot">Scam Alert: Odometer Rolled Back</div>
          </div>
          <div className="hero-3d-model">
            <model-viewer
              src="/r8.glb"
              alt="A 3D model of an Audi R8"
              camera-orbit="35deg 80deg auto"
              disable-zoom="true"
              shadow-intensity="1"
              shadow-softness="1"
              environment-image="neutral"
              exposure="1.1"
              className="floating-model"
            ></model-viewer>
          </div>
        </div>
      </section>

      {/* 3. Features Section */}
      <section className="features-section">
        <h2>Unmatched Market Intelligence</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3>Algorithm Deal Scoring</h3>
            <p>Every single car is mathematically scored up to a maximum of 80 based on exact depreciation, real market medians, and hidden anomalies.</p>
          </div>
          <div className="feature-card">
            <h3>Scam & Fraud Detection</h3>
            <p>Our algorithm catches hidden "Ex-Taxi" vehicles, rolled-back odometers, and missing documentation instantly.</p>
          </div>
          <div className="feature-card">
            <h3>Dynamic Price Targets</h3>
            <p>Tell us what score you want (Fair, Good, Excellent), and we will reverse-engineer the exact target price you should negotiate for.</p>
          </div>
          <div className="feature-card">
            <h3>Price Recommendations for Listings</h3>
            <p>Sellers can use our algorithm to get the perfect price recommendation for adding a new listing, ensuring their car is competitive and sells fast.</p>
          </div>
        </div>
      </section>

      {/* 4. Why Us Section */}
      <section className="why-us-section">
        <div className="why-3d-model">
          <model-viewer
            src="/lada.glb"
            alt="A 3D model of a Lada"
            camera-orbit="-45deg 75deg auto"
            disable-zoom="true"
            shadow-intensity="1"
            shadow-softness="1"
            environment-image="neutral"
            exposure="1.0"
            className="floating-model"
          ></model-viewer>
        </div>
        <h2>Why Choose CarAnalytics?</h2>
        <div className="why-grid">
          <div className="why-item">
            <div className="why-icon"><img src="/icon_chart.png" alt="Data-Driven icon" /></div>
            <h4>Data-Driven</h4>
            <p>We do not rely on subjective opinions. Pure math and market medians dictate the score.</p>
          </div>
          <div className="why-item">
            <div className="why-icon"><img src="/icon_shield.png" alt="Unbiased icon" /></div>
            <h4>Unbiased</h4>
            <p>Sellers cannot manipulate the algorithm. You get raw, unfiltered truth about the deal.</p>
          </div>
          <div className="why-item">
            <div className="why-icon"><img src="/icon_lightning.png" alt="Real-Time icon" /></div>
            <h4>Real-Time</h4>
            <p>As the market shifts, so do our baselines. You always get today's accurate market value.</p>
          </div>
          <div className="why-item">
            <div className="why-icon"><img src="/icon_money.png" alt="Save Money icon" /></div>
            <h4>Save Money</h4>
            <p>Never overpay for a high-mileage car disguised as a good deal ever again.</p>
          </div>
        </div>
      </section>

      {/* 5. Review Section */}
      <section className="reviews-section">
        <h2>Community Reviews</h2>
        <div className="reviews-empty">
          <p>We're building a new community of smart car buyers. Be the first to leave a review of our platform!</p>
          <button className="btn-secondary" onClick={() => alert("Review submission form coming soon!")}>Write a Review</button>
        </div>
      </section>

      {/* 6. FAQ Section */}
      <section className="faq-section">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-list">
          <div className="faq-item">
            <h4>How does the Algorithm Scoring work?</h4>
            <p>We group cars by Brand, Model, Generation, Year, and Engine Size to calculate true median prices and baseline mileages. We then apply complex depreciation math to score each specific car.</p>
          </div>
          <div className="faq-item">
            <h4>How do you catch scams?</h4>
            <p>Our algorithm penalizes listings with impossible mileage-to-age ratios, hidden keywords (like missing documents), or prices that are statistically "too good to be true".</p>
          </div>
          <div className="faq-item">
            <h4>Is it free to use?</h4>
            <p>Yes, browsing the marketplace and viewing the algorithm scores is completely free for all buyers.</p>
          </div>
        </div>
      </section>

      {/* 7. CTA Section */}
      <section className="cta-section">
        <div className="cta-box">
          <h2>Ready to find your perfect car?</h2>
          <p>Join thousands of smart buyers using data to beat the market.</p>
          <Link to="/listings" className="btn-primary large">Start Browsing Now</Link>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="footer-section">
        <div className="footer-content">
          <div className="footer-logo">CarAnalytics</div>
          <div className="footer-links">
            <a href="#">About Us</a>
            <a href="#">Features</a>
            <a href="#">Pricing</a>
            <a href="#">Terms & Conditions</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
