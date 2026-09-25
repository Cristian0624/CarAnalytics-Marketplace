import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function ProfilePage() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h2>My profile</h2>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h2>My profile</h2>
          <p className="auth-error">You are not logged in.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-form">
        <h2>My profile</h2>
        <p><strong>Name:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
        {user.phone && <p><strong>Phone:</strong> {user.phone}</p>}
        {user.seller_type && <p><strong>Account type:</strong> {user.seller_type}</p>}
        <button className="auth-submit" onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
}

export default ProfilePage;
