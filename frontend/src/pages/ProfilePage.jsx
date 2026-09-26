import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  async function handleDeconectare() {
    await logout();
    navigate("/");
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h2>Profilul Meu</h2>
          <p>Se încarcă...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h2>Profilul Meu</h2>
          <p className="auth-error">Nu ești autentificat.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-form">
        <h2>Profilul Meu</h2>
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
        {user.phone && <p><strong>Phone:</strong> {user.phone}</p>}
        {user.seller_type && <p><strong>Tip Cont:</strong> {user.seller_type}</p>}
        <button className="auth-submit" onClick={handleDeconectare}>Deconectare</button>
      </div>
    </div>
  );
}

export default ProfilePage;
