import { Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import ListingsPage from "./pages/ListingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import RecommendationsPage from "./pages/RecommendationsPage";
import AnomalyRiskPage from "./pages/AnomalyRiskPage";
import SavedItemsPage from "./pages/SavedItemsPage";
import { FavouritesProvider } from "./context/FavouritesContext";

function App() {
  return (
    <FavouritesProvider><div>
      <Header />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/anomaly-risk" element={<AnomalyRiskPage />} />
        <Route path="/favourites/:id?" element={<SavedItemsPage kind="favourites" />} />
        <Route path="/saved-risk-assessments/:id?" element={<SavedItemsPage kind="risks" />} />
        <Route path="/saved-searches/:id?" element={<SavedItemsPage kind="searches" />} />
      </Routes>
    </div></FavouritesProvider>
  );
}

export default App;
