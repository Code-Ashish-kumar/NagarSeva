/**
 * Generic API connector using native fetch.
 * All requests include credentials (cookies) for httpOnly JWT support.
 *
 * In production, VITE_API_URL points to the Render backend.
 * In development, the Vite proxy handles /api → localhost:5000.
 */
const API_BASE = import.meta.env.VITE_API_URL || '';

export const apiConnector = async (method, url, bodyData = null, headers = null, params = null) => {
  let finalUrl = API_BASE + url;

  if (params) {
    const queryString = new URLSearchParams(params).toString();
    finalUrl = `${url}?${queryString}`;
  }

  const config = {
    method: method.toUpperCase(),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  // Attach Authorization header from localStorage if available
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }

  // Attach body for non-GET requests
  if (bodyData && config.method !== "GET") {
    config.body = typeof bodyData === "object" ? JSON.stringify(bodyData) : bodyData;
  }

  const response = await fetch(finalUrl, config);

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw {
      status: response.status,
      statusText: response.statusText,
      data: data,
    };
  }

  return data;
};
