export const PRESENTON_EMBED_COOKIE = "presenton_embed";
export const PRESENTON_EMBED_HEADER = "x-presenton-embed-token";

const EMBED_TOKEN_STORAGE = "presenton_embed_token";

export function isTruthyEmbedFlag(value?: string | null): boolean {
  const raw = value?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readEmbedTokenFromSearch(search?: string | null): string | null {
  if (!search) return null;
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("token")?.trim() || null;
}

export function persistEmbedToken(token: string | null | undefined): void {
  if (typeof window === "undefined" || !token) return;
  try {
    sessionStorage.setItem(EMBED_TOKEN_STORAGE, token);
  } catch {
    // private mode / blocked storage
  }
}

/** Token de embed: query `?token=` (primera carga) o sessionStorage (iframe). */
export function getEmbedToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = readEmbedTokenFromSearch(window.location.search);
  if (fromUrl) {
    persistEmbedToken(fromUrl);
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(EMBED_TOKEN_STORAGE);
  } catch {
    return null;
  }
}

export function embedAuthHeaders(): Record<string, string> {
  const token = getEmbedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * El iframe de Brain es cross-site: Chrome no guarda la cookie httpOnly
 * SameSite=Lax. Las llamadas del SPA tienen que llevar el JWT a mano.
 */
export function installEmbedAuthFetch(): void {
  if (typeof window === "undefined") return;
  const flagged = window as Window & { __presentonEmbedFetch?: boolean };
  if (flagged.__presentonEmbedFetch) return;
  flagged.__presentonEmbedFetch = true;
  getEmbedToken();
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getEmbedToken();
    if (!token) return original(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    if (!headers.has("Authorization") && !headers.has("authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    const nextInit: RequestInit = {
      ...init,
      headers,
      credentials: init?.credentials ?? "include",
    };
    if (input instanceof Request) {
      return original(new Request(input, nextInit));
    }
    return original(input, nextInit);
  };
}
