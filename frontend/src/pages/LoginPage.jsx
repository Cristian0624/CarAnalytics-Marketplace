import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../context/AuthContext";
import "./AuthenticationPages.css";
import PasswordInput from "../components/PasswordInput";

function AutentificarePage() {
  const { login } = useAuth();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  function handleChange(e) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      await login({
        email: form.email,
        password: form.password,
      });

      const destination = location.state?.from || "/";
      navigate(destination, { replace: true });
    } catch (error) {
      setError(error.message || t("login.error"));
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>{t("login.title")}</h2>

        <input
          className="auth-input"
          name="email"
          type="email"
          placeholder={t("login.email")}
          value={form.email}
          onChange={handleChange}
          required
        />

        <PasswordInput
          name="password"
          placeholder={t("login.password")}
          value={form.password}
          onChange={handleChange}
        />

        <button className="auth-submit" type="submit">
          {t("login.submit")}
        </button>

        {error && (
          <p className="auth-error">
            {error}
          </p>
        )}

        <p className="auth-switch">
          {t("login.noAccount")}{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
          >
            {t("login.createAccount")}
          </button>
        </p>
      </form>
    </div>
  );
}

export default AutentificarePage;