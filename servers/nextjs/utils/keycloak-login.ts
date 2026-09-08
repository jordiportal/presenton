export type KeycloakPublicConfig = {
  enabled: boolean;
  client_id: string;
  authority: string;
  redirect_uri?: string;
};

const PKCE_STORAGE_KEY = "PKCE_verifier";
const CODE_IN_FLIGHT_KEY = "kc_code_in_flight";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const verifier = base64UrlEncode(bytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return { verifier, challenge: base64UrlEncode(new Uint8Array(digest)) };
}

function storePkceVerifier(verifier: string): void {
  sessionStorage.setItem(PKCE_STORAGE_KEY, verifier);
  localStorage.setItem(PKCE_STORAGE_KEY, verifier);
}

function readPkceVerifier(): string | null {
  return (
    sessionStorage.getItem(PKCE_STORAGE_KEY) ??
    localStorage.getItem(PKCE_STORAGE_KEY)
  );
}

function clearPkceVerifier(): void {
  sessionStorage.removeItem(PKCE_STORAGE_KEY);
  localStorage.removeItem(PKCE_STORAGE_KEY);
}

export function keycloakRedirectUri(): string {
  return window.location.origin;
}

export function cleanOAuthParamsFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("session_state");
  url.searchParams.delete("iss");
  url.searchParams.delete("error");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, document.title, url.pathname + url.hash);
}

export function readOAuthRedirectError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  if (!error) {
    return null;
  }
  const description = params.get("error_description") ?? error;
  return decodeURIComponent(description.replace(/\+/g, " "));
}

export function readOAuthAuthorizationCode(): string | null {
  return new URLSearchParams(window.location.search).get("code");
}

export function isKeycloakConfigReady(
  config: KeycloakPublicConfig | null | undefined
): config is KeycloakPublicConfig {
  return Boolean(config?.enabled && config.client_id && config.authority);
}

export async function startKeycloakLogin(
  config: KeycloakPublicConfig
): Promise<void> {
  const redirectUri = keycloakRedirectUri();
  const { verifier, challenge } = await createPkcePair();
  storePkceVerifier(verifier);

  const authorize = new URL(
    `${config.authority.replace(/\/+$/, "")}/protocol/openid-connect/auth`
  );
  authorize.searchParams.set("client_id", config.client_id);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid");
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  window.location.assign(authorize.toString());
}

export function consumePkceVerifierForCode(code: string): string | null {
  if (sessionStorage.getItem(CODE_IN_FLIGHT_KEY) === code) {
    return null;
  }
  sessionStorage.setItem(CODE_IN_FLIGHT_KEY, code);
  const verifier = readPkceVerifier();
  if (!verifier) {
    sessionStorage.removeItem(CODE_IN_FLIGHT_KEY);
    return null;
  }
  return verifier;
}

export function finishKeycloakCodeExchange(): void {
  clearPkceVerifier();
  sessionStorage.removeItem(CODE_IN_FLIGHT_KEY);
}

export function abortKeycloakCodeExchange(): void {
  sessionStorage.removeItem(CODE_IN_FLIGHT_KEY);
}
