const API_URL =
  import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:8000`;

function getErrorMessage(data, fallback) {
  const detail = data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const first = detail[0];

    if (typeof first === "string") {
      return first;
    }

    if (first?.msg) {
      return first.msg;
    }
  }

  return fallback;
}

export async function apiRequest(
  endpoint,
  {
    method = "GET",
    body,
    token,
    headers = {},
  } = {}
) {
  const requestHeaders = {
    ...headers,
  };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      getErrorMessage(data, `Request failed (${res.status})`)
    );
  }

  return data;
}

export { API_URL };