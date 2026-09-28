import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./AuthenticationPages.css";
import PasswordInput from "../components/PasswordInput";

function AutentificarePage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await login(form);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
  <h2>Autentificare</h2>

  <input
    className="auth-input"
    name="email"
    type="email"
    placeholder="Adresă de email"
    value={form.email}
    onChange={handleChange}
    required
  />

  <PasswordInput
    name="password"
    placeholder="Parolă"
    value={form.password}
    onChange={handleChange}
  />

  <button className="auth-submit" type="submit">
    Autentificare
  </button>

  {error && <p className="auth-error">{error}</p>}

  <p className="auth-switch">
    Nu ai cont?{" "}
    <button type="button" onClick={() => navigate("/register")}>
      Creează un cont
    </button>
  </p>
</form>
    </div>
  );
}

export default AutentificarePage;