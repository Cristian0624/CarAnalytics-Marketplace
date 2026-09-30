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

let refreshPromise = null;

async function attemptRefresh() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/users/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error("Refresh failed");
        }
        return res.json().catch(() => null);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function apiRequest(
  endpoint,
  {
    method = "GET",
    body,
    token,
    headers = {},
    signal,
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

  let res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    credentials: "include",
    signal,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (
    res.status === 401 &&
    !endpoint.startsWith("/users/login") &&
    !endpoint.startsWith("/users/register") &&
    !endpoint.startsWith("/users/refresh")
  ) {
    try {
      await attemptRefresh();
      res = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers: requestHeaders,
        credentials: "include",
        signal,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      // Refresh failed, proceed to error handling below
    }
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(
      getErrorMessage(data, `Request failed (${res.status})`)
    );
    error.status = res.status;
    error.detail = data?.detail;
    throw error;
  }

  return data;
}

export { API_URL };
