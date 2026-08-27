import axios from "axios";

const TOKEN_KEY = "bratclient_token";
const REFRESH_KEY = "bratclient_refresh";

export const tokens = {
  get: () => localStorage.getItem(TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: ({ token, refresh_token }) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`,
  withCredentials: true,
});

api.interceptors.request.use((cfg) => {
  const token = tokens.get();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const cfg = error.config || {};
    const status = error.response?.status;
    const refresh = tokens.getRefresh();
    const isAuthCall = (cfg.url || "").includes("/auth/refresh") || (cfg.url || "").includes("/auth/login");

    if (status === 401 && refresh && !cfg._retried && !isAuthCall) {
      cfg._retried = true;
      try {
        refreshing = refreshing || axios.post(
          `${process.env.REACT_APP_BACKEND_URL}/api/auth/refresh`,
          { refresh_token: refresh },
          { withCredentials: true },
        );
        const { data } = await refreshing;
        refreshing = null;
        tokens.set(data);
        cfg.headers = { ...cfg.headers, Authorization: `Bearer ${data.token}` };
        return api(cfg);
      } catch (e) {
        refreshing = null;
        tokens.clear();
      }
    }
    return Promise.reject(error);
  },
);

export const errMsg = (e) => {
  const d = e.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg).join(" ");
  return e.message || "Error";
};

export default api;
