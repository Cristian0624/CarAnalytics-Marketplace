import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { registerUser } from "../api/auth";
import "./AuthenticationPages.css";
import PasswordInput from "../components/PasswordInput";

function ÎnregistrarePage() {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

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
      setError(err.message || t("register.error"));
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h2>{t("register.title")}</h2>

        <input
          className="auth-input"
          name="name"
          placeholder={t("register.name")}
          value={form.name}
          onChange={handleChange}
          required
        />

        <input
          className="auth-input"
          name="email"
          type="email"
          placeholder={t("register.email")}
          value={form.email}
          onChange={handleChange}
          required
        />

        <PasswordInput
          name="password"
          placeholder={t("register.password")}
          value={form.password}
          onChange={handleChange}
        />

        <button className="auth-submit" type="submit">
          {t("register.submit")}
        </button>

        {error && (
          <p className="auth-error">
            {error}
          </p>
        )}

        <p className="auth-switch">
          {t("register.hasAccount")}{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
          >
            {t("register.login")}
          </button>
        </p>
      </form>
    </div>
  );
}

export default ÎnregistrarePage;