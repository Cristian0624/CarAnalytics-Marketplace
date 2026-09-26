import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCurrentUser, loginUser as apiAutentificare, logoutUser as apiDeconectare } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await getCurrentUser(localStorage.getItem("token") || undefined);
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  async function login(credentials) {
    const result = await apiAutentificare(credentials);
    if (result?.access_token) {
      localStorage.setItem("token", result.access_token);
    }
    return refreshUser();
  }

  async function logout() {
    try {
      await apiDeconectare();
    } catch {
      // ignore server error, still clear local state
    }
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
