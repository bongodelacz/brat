import { createContext, useContext, useEffect, useState } from "react";
import api, { tokens } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    if (!tokens.get() && !tokens.getRefresh()) { setUser(null); return; }
    api.get("/auth/me")
      .then(({ data }) => setUser(data))
      .catch(() => setUser(null));
  }, []);

  // returns { twofa_required, challenge_id, email_hint } or the user object
  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.twofa_required) return data;
    tokens.set(data);
    setUser(data.user);
    return data.user;
  };

  const verify2fa = async (challenge_id, code) => {
    const { data } = await api.post("/auth/2fa/verify", { challenge_id, code });
    tokens.set(data);
    setUser(data.user);
    return data.user;
  };

  const register = async (email, password, username) => {
    const { data } = await api.post("/auth/register", { email, password, username });
    tokens.set(data);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await api.post("/auth/logout", { refresh_token: tokens.getRefresh() }).catch(() => {});
    tokens.clear();
    setUser(null);
  };

  const refreshUser = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, verify2fa, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
