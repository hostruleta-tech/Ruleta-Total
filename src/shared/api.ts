// URL del backend API.
// En desarrollo: proxied via Vite a http://localhost:3001
// En producción (Vercel): mismo dominio, función serverless catch-all en /api
export const API_URL = "/api";

/**
 * Petición al backend con JSON por defecto.
 * La API es pública: no hay autenticación ni tokens de sesión.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
