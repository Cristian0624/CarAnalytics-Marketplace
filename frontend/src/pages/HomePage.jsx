import { Link } from "react-router-dom";
import "@google/model-viewer";
import "./HomePage.css";

function HomePage() {
  return (
    <div className="landing-page">
      {/* 1. Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">Propulsat de Algoritmi Avansați de Preț</div>
          <h1 className="hero-title">Află Valoarea Reală a Oricărei Mașini Instant.</h1>
          <p className="hero-subtitle">
            Nu mai plăti prea mult pentru mașini second-hand. Algoritmul nostru analizează mii de date din piață pentru a evalua precis fiecare anunț și a depista instant țepele supraevaluate.
          </p>
          <div className="hero-buttons">
            <Link to="/listings" className="btn-primary">Răsfoiește Piața</Link>
            <Link to="/register" className="btn-secondary">Înscrie-te Gratuit</Link>
          </div>
        </div>
        <div className="hero-image-placeholder">
          <div className="abstract-ui">
            <div className="ui-card top">Scor: 80/80 (Ofertă Perfectă)</div>
            <div className="ui-card mid">Medie Piață: 14,000 €</div>
            <div className="ui-card bot">Alertă Fraudă: Kilometraj Dat Înapoi</div>
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

      {/* 3. Funcționalități Section */}
      <section className="features-section">
        <h2>Inteligență de Piață Inegalabilă</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3>Scor Algoritmic al Ofertei</h3>
            <p>Fiecare mașină este evaluată matematic până la un maxim de 80 de puncte, pe baza deprecierii exacte, a medianelor reale ale pieței și a anomaliilor ascunse.</p>
          </div>
          <div className="feature-card">
            <h3>Detectarea Fraudelor și Țepelor</h3>
            <p>Algoritmul nostru depistează instant vehiculele ascunse „Fost Taxi”, kilometrajele modificate și actele lipsă.</p>
          </div>
          <div className="feature-card">
            <h3>Ținte Dinamice de Preț</h3>
            <p>Spune-ne ce scor dorești (Corect, Bun, Excelent), și noi vom calcula prețul exact pe care ar trebui să-l negociezi.</p>
          </div>
          <div className="feature-card">
            <h3>Recomandări de Preț pentru Anunțuri</h3>
            <p>Vânzătorii pot folosi algoritmul nostru pentru a obține recomandarea perfectă de preț la adăugarea unui nou anunț, asigurându-se că mașina lor este competitivă și se vinde rapid.</p>
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
        <h2>De ce să alegi CarAnalytics?</h2>
        <div className="why-grid">
          <div className="why-item">
            <div className="why-icon"><img src="/icon_chart.png" alt="Bazat pe Date icon" /></div>
            <h4>Bazat pe Date</h4>
            <p>Nu ne bazăm pe opinii subiective. Matematica pură și medianele pieței dictează scorul.</p>
          </div>
          <div className="why-item">
            <div className="why-icon"><img src="/icon_shield.png" alt="Imparțial icon" /></div>
            <h4>Imparțial</h4>
            <p>Vânzătorii nu pot manipula algoritmul. Primești adevărul brut, nefiltrat, despre ofertă.</p>
          </div>
          <div className="why-item">
            <div className="why-icon"><img src="/icon_lightning.png" alt="În Timp Real icon" /></div>
            <h4>În Timp Real</h4>
            <p>Pe măsură ce piața se schimbă, se schimbă și bazele noastre. Ai întotdeauna valoarea de piață precisă de azi.</p>
          </div>
          <div className="why-item">
            <div className="why-icon"><img src="/icon_money.png" alt="Economisește Bani icon" /></div>
            <h4>Economisește Bani</h4>
            <p>Nu mai plăti niciodată în plus pentru o mașină cu rulaj mare, mascată ca o ofertă bună.</p>
          </div>
        </div>
      </section>

      {/* 5. Review Section */}
      <section className="reviews-section">
        <h2>Recenzii ale Comunității</h2>
        <div className="reviews-empty">
          <p>Construim o nouă comunitate de cumpărători inteligenți de mașini. Fii primul care lasă o recenzie platformei noastre!</p>
          <button className="btn-secondary" onClick={() => alert("Formularul pentru recenzii va fi disponibil în curând!")}>Scrie o Recenzie</button>
        </div>
      </section>

      {/* 6. FAQ Section */}
      <section className="faq-section">
        <h2>Întrebări Frecvente</h2>
        <div className="faq-list">
          <div className="faq-item">
            <h4>Cum funcționează Scorul Algoritmic?</h4>
            <p>Grupăm mașinile după Marcă, Model, Generație, An și Capacitate Motor pentru a calcula prețurile mediane adevărate și kilometrajele de bază. Apoi aplicăm formule matematice complexe de depreciere pentru a evalua fiecare mașină în parte.</p>
          </div>
          <div className="faq-item">
            <h4>Cum depistați țepele?</h4>
            <p>Algoritmul nostru penalizează anunțurile cu proporții imposibile între rulaj și vârstă, cuvinte-cheie ascunse (precum acte lipsă) sau prețuri statistic „prea bune ca să fie adevărate”.</p>
          </div>
          <div className="faq-item">
            <h4>Este gratuit?</h4>
            <p>Da, navigarea pe piață și vizualizarea scorurilor algoritmului sunt complet gratuite pentru toți cumpărătorii.</p>
          </div>
        </div>
      </section>

      {/* 7. CTA Section */}
      <section className="cta-section">
        <div className="cta-box">
          <h2>Ești pregătit să găsești mașina perfectă?</h2>
          <p>Alătură-te miilor de cumpărători inteligenți care folosesc datele pentru a bate piața.</p>
          <Link to="/listings" className="btn-primary large">Începe să Cauți Acum</Link>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="footer-section">
        <div className="footer-content">
          <div className="footer-logo">CarAnalytics</div>
          <div className="footer-links">
            <a href="#">Despre Noi</a>
            <a href="#">Funcționalități</a>
            <a href="#">Prețuri</a>
            <a href="#">Termeni și Condiții</a>
            <a href="#">Politica de Confidențialitate</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
