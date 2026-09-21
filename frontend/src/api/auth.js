const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

function getErrorMessage(data, fallback) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const first = detail[0];
    if (typeof first === "string") return first;
    if (first?.msg) return first.msg;
  }
  return fallback;
}

async function handleResponse(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(getErrorMessage(data, fallback));
  }
  return data;
}

export async function registerUser({ name, email, password, phone, seller_type }) {
  const res = await fetch(`${API_URL}/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, phone, seller_type }),
  });
  return handleResponse(res, "Registration failed");
}

export async function loginUser({ email, password }) {
  const res = await fetch(`${API_URL}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return handleResponse(res, "Login failed");
}

export async function getCurrentUser(token) {
  const res = await fetch(`${API_URL}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(res, "Failed to load user");
}
