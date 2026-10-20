// URL del backend API.
// En desarrollo: proxied via Vite a http://localhost:3001
// En producción (Vercel): mismo dominio, función serverless catch-all en /api
export const API_URL = "/api";

const ADMIN_SESSION_KEY = "admin_session";

export function getAdminSession(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ADMIN_SESSION_KEY);
}

export function setAdminSession(token: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADMIN_SESSION_KEY, token);
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

export async function adminFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = getAdminSession();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
      "x-admin-token": token ?? "",
    },
  });

  if (res.status === 401) {
    clearAdminSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("admin-unauthorized"));
    }
  }

  return res;
}
