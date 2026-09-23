import { apiRequest } from "./api";

export async function registerUser({
  name,
  email,
  password,
  phone,
  seller_type,
}) {
  return apiRequest("/users/register", {
    method: "POST",
    body: {
      name, 
      email,
      password,
      phone,
      seller_type,
    },
  });
}

export async function loginUser({
  email,
  password,
}) {
  return apiRequest("/users/login", {
    method: "POST",
    body: {
      email,
      password,
    },
  });
}

export async function getCurrentUser(token) {
  return apiRequest("users/me", {
    token, 
  });
}
