import axios from 'axios';
import { STATIC_DEMO } from '../static/mode.js';
import { staticAdapter } from '../static/adapter.js';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// withCredentials sends the httpOnly refresh cookie to the API (different port = different origin).
export const api = axios.create({ baseURL: API_URL, withCredentials: true });
// Static demo (GitHub Pages): no server, answers come from exported JSON files.
if (STATIC_DEMO) api.defaults.adapter = staticAdapter;

// The access token lives only in memory (never localStorage), so a page reload starts by refreshing.
let accessToken = null;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const getAccessToken = () => accessToken; // for fetch() calls that can't use axios (streaming)

let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Single-flight refresh: if several requests get 401 at once they all wait for ONE refresh call.
// This matters because refresh tokens rotate — a second refresh with the old cookie would be
// treated as token theft by the server and log the user out.
let refreshPromise = null;
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        await refreshSession();
        return api(original); // replay with the new token
      } catch {
        setAccessToken(null);
        onSessionExpired();
      }
    }
    return Promise.reject(error);
  },
);

// Turns any axios error into a sentence we can show the user.
export function errorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (error?.response?.data?.error?.message) return error.response.data.error.message;
  if (error?.request && !error.response) return "Can't reach the ExamLens server. Is it running?";
  return fallback;
}
