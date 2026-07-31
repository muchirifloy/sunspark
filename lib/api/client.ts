import "server-only";

const defaultLocalApi = "http://localhost:4000";

export function getApiBaseUrl() {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? defaultLocalApi;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const defaultTimeoutMs = 12000;
const defaultReadRetries = 1;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path, getApiBaseUrl());
  const headers = new Headers(init.headers);
  const adminToken = process.env.API_ADMIN_TOKEN ?? process.env.ADMIN_API_TOKEN;
  const isAdminRequest = url.pathname.startsWith("/admin/");
  const method = String(init.method ?? "GET").toUpperCase();
  const canRetry = method === "GET" || method === "HEAD";
  const attempts = canRetry ? Math.max(Number(process.env.API_FETCH_RETRIES ?? defaultReadRetries) + 1, 1) : 1;

  if (init.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  if (isAdminRequest && !adminToken) {
    throw new ApiError("Admin API access is not configured on this server.", 503);
  }

  if (isAdminRequest && adminToken && !headers.has("x-sunspark-admin-token")) {
    headers.set("x-sunspark-admin-token", adminToken);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.API_FETCH_TIMEOUT_MS ?? defaultTimeoutMs));

    if (init.signal) {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        cache: init.cache ?? "no-store"
      });
    } catch (error) {
      lastError = controller.signal.aborted
        ? new ApiError("The backend is taking too long to respond.", 504)
        : error;

      clearTimeout(timeout);

      if (attempt < attempts) {
        await delay(600 * attempt);
        continue;
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      let message = "The request could not be completed.";

      try {
        const payload = await response.json();
        if (typeof payload?.message === "string") message = payload.message;
        if (typeof payload?.error === "string") message = payload.error;
      } catch {
        message = response.statusText || message;
      }

      const apiError = new ApiError(message, response.status);
      lastError = apiError;

      if (canRetry && attempt < attempts && [408, 429, 500, 502, 503, 504].includes(response.status)) {
        await delay(600 * attempt);
        continue;
      }

      throw apiError;
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  throw lastError;
}

export function toQueryString(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
