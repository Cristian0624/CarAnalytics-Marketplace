import { useAuth } from "../context/AuthContext";
import "./HomePage.css";

function HomePage() {
  const { user, loading } = useAuth();

  return (
    <main className="home-main">
      <section className="listings-placeholder">
        {loading ? (
          <p>Loading...</p>
        ) : user ? (
          <>
            <h2>Hello, {user.name}!</h2>
            <p>You are logged in as {user.email}.</p>
          </>
        ) : (
          <>
            <h2>Listings</h2>
            <p>Car listings and navigation in progress.</p>
          </>
        )}
      </section>
    </main>
  );
}

export default HomePage;
