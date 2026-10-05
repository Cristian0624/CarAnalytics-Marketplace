const API_URL = import.meta.env.VITE_API_URL ?? "/api";

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

export async function registerUser(data) {
  const res = await fetch(`${API_URL}/users/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  return handleResponse(res, "Registration failed");
}

export async function loginUser(data) {
  const res = await fetch(`${API_URL}/users/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const result = await handleResponse(res, "Login failed");
  if (result?.access_token) {
    localStorage.setItem("token", result.access_token);
  }
  return result;
}

export async function getCurrentUser(token) {
  const headers = {};
  const stored = token ?? localStorage.getItem("token");
  if (stored) {
    headers["Authorization"] = `Bearer ${stored}`;
  }
  const res = await fetch(`${API_URL}/users/me`, {
    headers,
    credentials: "include",
  });
  return handleResponse(res, "Failed to load user");
}

export async function logoutUser() {
  const res = await fetch(`${API_URL}/users/logout`, {
    method: "POST",
    credentials: "include",
  });
  localStorage.removeItem("token");
  return handleResponse(res, "Logout failed");
}
