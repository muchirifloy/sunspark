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

// Routes that can expose another customer's details are gated on the shared
// service token at the backend. Checkout stays open because it creates an order
// rather than reading one.
function requiresServiceToken(pathname: string) {
  if (pathname.startsWith("/admin/")) return true;
  if (pathname === "/orders") return true;
  return pathname.startsWith("/orders/") && pathname !== "/orders/checkout";
}

/**
 * Per-call overrides for callers that would rather fail fast than sit on the
 * shared 12s-plus-one-retry budget. A page that can still render something
 * useful without this particular read should not make the operator wait ~25s
 * for it.
 */
export type ApiFetchInit = RequestInit & { retries?: number; timeoutMs?: number };

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const url = new URL(path, getApiBaseUrl());
  const headers = new Headers(init.headers);
  const adminToken = process.env.API_ADMIN_TOKEN ?? process.env.ADMIN_API_TOKEN;
  const needsServiceToken = requiresServiceToken(url.pathname);
  const method = String(init.method ?? "GET").toUpperCase();
  const canRetry = method === "GET" || method === "HEAD";
  const configuredRetries = init.retries ?? Number(process.env.API_FETCH_RETRIES ?? defaultReadRetries);
  const attempts = canRetry ? Math.max(configuredRetries + 1, 1) : 1;
  const timeoutMs = init.timeoutMs ?? Number(process.env.API_FETCH_TIMEOUT_MS ?? defaultTimeoutMs);

  if (init.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  if (needsServiceToken && !adminToken) {
    throw new ApiError("Backend service access is not configured on this server.", 503);
  }

  if (needsServiceToken && adminToken && !headers.has("x-sunspark-admin-token")) {
    headers.set("x-sunspark-admin-token", adminToken);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    if (init.signal) {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    let response: Response;

    try {
      // Reads that opt into revalidation manage their own freshness, so the
      // blanket no-store default only applies when nothing else was asked for.
      const cacheMode = init.cache ?? (init.next ? undefined : "no-store");

      response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
        ...(cacheMode ? { cache: cacheMode } : {})
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
