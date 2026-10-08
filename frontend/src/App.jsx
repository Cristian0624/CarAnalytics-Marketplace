import { Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import ListingsPage from "./pages/ListingsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProfilePage from "./pages/ProfilePage";
import RecommendationsPage from "./pages/RecommendationsPage";
import CreateListingPage from "./pages/CreateListingPage";
import AnomalyRiskPage from "./pages/AnomalyRiskPage";
import SavedItemsPage from "./pages/SavedItemsPage";
import MyListingsPage from "./pages/MyListingsPage";
import ComparatorPage from "./pages/ComparatorPage";
import AboutUsPage from "./pages/AboutUsPage";
import FeaturesPage from "./pages/FeaturesPage";
import { FavouritesProvider } from "./context/FavouritesContext";
import { ComparatorProvider } from "./context/ComparatorContext";

function App() {
  return (
    <ComparatorProvider>
    <FavouritesProvider><div>
      <Header />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutUsPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/listings" element={<ListingsPage />} />
        <Route path="/comparator" element={<ComparatorPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/my-listings" element={<MyListingsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/create-listing" element={<CreateListingPage />} />
        <Route path="/anomaly-risk" element={<AnomalyRiskPage />} />
        <Route path="/favourites/:id?" element={<SavedItemsPage kind="favourites" />} />
        <Route path="/saved-risk-assessments/:id?" element={<SavedItemsPage kind="risks" />} />
        <Route path="/saved-searches/:id?" element={<SavedItemsPage kind="searches" />} />
        <Route path="/saved-comparisons/:id?" element={<SavedItemsPage kind="comparisons" />} />
      </Routes>
    </div></FavouritesProvider>
    </ComparatorProvider>
  );
}

export default App;
