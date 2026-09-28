import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../api/auth";
import "./AuthenticationPages.css";
import PasswordInput from "../components/PasswordInput";

function ÎnregistrarePage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      await registerUser(form);
      navigate("/login");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>Înregistrare</h2>
        <input
          className="auth-input"
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          required
        />
        <input
          className="auth-input"
          name="email"
          type="email"
          placeholder="Email"
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
        <button className="auth-submit" type="submit">Înregistrare</button>
        {error && <p className="auth-error">{error}</p>}
        <p className="auth-switch">
  Ai deja un cont? <button type="button" onClick={() => navigate("/login")}>Autentifică-te</button>
</p>
      </form>
    </div>
  );
}

export default ÎnregistrarePage;