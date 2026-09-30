import { Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import { FavouritesProvider } from "./context/FavouritesContext";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import ListingsPage from "./pages/ListingsPage";
import AnomalyRiskPage from "./pages/AnomalyRiskPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import SavedItemsPage from "./pages/SavedItemsPage";

function App() {
  return (
    <FavouritesProvider>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/anomaly-risk" element={<AnomalyRiskPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/favourites" element={<SavedItemsPage kind="favourites" />} />
        <Route path="/favourites/:id" element={<SavedItemsPage kind="favourites" />} />
        <Route path="/saved-risk-assessments" element={<SavedItemsPage kind="risks" />} />
        <Route path="/saved-risk-assessments/:id" element={<SavedItemsPage kind="risks" />} />
        <Route path="/saved-searches" element={<SavedItemsPage kind="searches" />} />
        <Route path="/saved-searches/:id" element={<SavedItemsPage kind="searches" />} />
      </Routes>
    </FavouritesProvider>
  );
}

export default App;