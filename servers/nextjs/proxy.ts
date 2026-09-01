import { NextRequest, NextResponse } from "next/server";
import { isAuthDisabled } from "@/utils/auth";
import {
  EMBED_SAFE_NEXT_API_PATHS,
  PRESENTON_EMBED_COOKIE,
  PRESENTON_EMBED_HEADER,
} from "@/utils/embed";

/**
 * API-only: session required for all /api/* except auth, telemetry, public
 * image transforms, and the authenticated export-runtime bridge.
 * Page routes are protected in server layouts (unknown URLs still 404; login uses relative redirects).
 */
function getFastApiBaseUrl(): string {
  const internal = process.env.FAST_API_INTERNAL_URL?.trim();
  if (internal) {
    return internal.replace(/\/+$/, "");
  }
  const configured = process.env.NEXT_PUBLIC_FAST_API?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000";
  }
  return "http://127.0.0.1:8000";
}

function isFastApiApiPath(pathname: string): boolean {
  return (
    pathname === "/api/v1" ||
    pathname.startsWith("/api/v1/") ||
    pathname === "/api/v2" ||
    pathname.startsWith("/api/v2/")
  );
}

function isFastApiAssetPath(pathname: string): boolean {
  return (
    pathname === "/app_data" ||
    pathname.startsWith("/app_data/") ||
    pathname === "/static" ||
    pathname.startsWith("/static/")
  );
}

function rewriteToFastApi(request: NextRequest): NextResponse {
  const destination = new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    `${getFastApiBaseUrl()}/`
  );
  const embedToken = request.cookies.get(PRESENTON_EMBED_COOKIE)?.value;
  if (embedToken && !request.headers.get("authorization")) {
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${embedToken}`);
    return NextResponse.rewrite(destination, { request: { headers } });
  }
  return NextResponse.rewrite(destination);
}

function continueRequest(request: NextRequest): NextResponse {
  return isFastApiApiPath(request.nextUrl.pathname)
    ? rewriteToFastApi(request)
    : NextResponse.next();
}

type AuthStatus = {
  configured: boolean;
  authenticated: boolean;
};

const SESSION_COOKIE_NAME = "presenton_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const EMBED_COOKIE_TTL_SECONDS = 60 * 60;

function isSecureRequest(request: NextRequest): boolean {
  return (
    request.headers.get("x-forwarded-proto")?.toLowerCase() === "https" ||
    request.nextUrl.protocol === "https:"
  );
}

function stampEmbedPresentation(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname !== "/presentation") {
    return null;
  }
  const queryToken = request.nextUrl.searchParams.get("token")?.trim();
  const cookieToken = request.cookies.get(PRESENTON_EMBED_COOKIE)?.value;
  const token = queryToken || cookieToken;
  if (!token) {
    return null;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PRESENTON_EMBED_HEADER, token);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (queryToken) {
    response.cookies.set({
      name: PRESENTON_EMBED_COOKIE,
      value: queryToken,
      maxAge: EMBED_COOKIE_TTL_SECONDS,
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

async function getAuthStatus(request: NextRequest): Promise<AuthStatus> {
  const cookieHeader = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  const embedToken = request.cookies.get(PRESENTON_EMBED_COOKIE)?.value;
  const authStatusUrl = `${getFastApiBaseUrl()}/api/v1/auth/status`;
  const headers: HeadersInit = {};
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }
  if (authorization) {
    headers.Authorization = authorization;
  } else if (embedToken) {
    headers.Authorization = `Bearer ${embedToken}`;
  }
  try {
    const response = await fetch(authStatusUrl, {
      method: "GET",
      headers: Object.keys(headers).length ? headers : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      return { configured: true, authenticated: false };
    }
    const payload = (await response.json()) as Partial<AuthStatus>;
    return {
      configured: Boolean(payload.configured),
      authenticated: Boolean(payload.authenticated),
    };
  } catch {
    return { configured: true, authenticated: false };
  }
}

function isApiAuthExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/v1/auth/") ||
    pathname === "/api/telemetry-status" ||
    /** Public image transform used as a browser/Konva image source. */
    pathname === "/api/update-svg" ||
    pathname.startsWith("/api/export-presentation-data/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Docker handles these paths in nginx. Electron has no nginx and chooses
  // random loopback ports, so proxy them at request time instead of baking a
  // build-time destination into Next.js' routes manifest.
  if (isFastApiAssetPath(pathname)) {
    return rewriteToFastApi(request);
  }

  if (pathname === "/pdf-maker") {
    const exportSession = request.nextUrl.searchParams.get("exportSession");
    if (exportSession) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.searchParams.delete("exportSession");

      const response = NextResponse.redirect(redirectUrl);
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: exportSession,
        maxAge: SESSION_TTL_SECONDS,
        httpOnly: true,
        secure: isSecureRequest(request),
        sameSite: "lax",
        path: "/",
      });
      return response;
    }

    return NextResponse.next();
  }

  const embedResponse = stampEmbedPresentation(request);
  if (embedResponse) {
    return embedResponse;
  }
  if (pathname === "/presentation") {
    // El layout exige sesión; aquí solo se sella el token de embed.
    return NextResponse.next();
  }

  if (isAuthDisabled()) {
    return continueRequest(request);
  }

  if (request.method === "OPTIONS" || isApiAuthExempt(pathname)) {
    return continueRequest(request);
  }

  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    // FastAPI valida API keys, JWT de Brain o el secreto de servicio.
    if (isFastApiApiPath(pathname)) {
      return rewriteToFastApi(request);
    }
    // El iframe no puede usar cookie SameSite=Lax; el JWT viaja en Authorization.
    // Solo lectura: POST /api/user-config sigue bloqueado.
    if (
      request.method === "GET" &&
      EMBED_SAFE_NEXT_API_PATHS.has(pathname)
    ) {
      const embedStatus = await getAuthStatus(request);
      return embedStatus.authenticated
        ? NextResponse.next()
        : NextResponse.json(
            { detail: "Unauthorized" },
            { status: 401, headers: { "Cache-Control": "no-store" } }
          );
    }
    return NextResponse.json(
      { detail: "Bearer tokens are only accepted by the Presenton API" },
      { status: 403 }
    );
  }

  if (request.cookies.get(PRESENTON_EMBED_COOKIE)?.value && isFastApiApiPath(pathname)) {
    return rewriteToFastApi(request);
  }

  const authStatus = await getAuthStatus(request);
  if (authStatus.authenticated) {
    return continueRequest(request);
  }
  if (!authStatus.configured) {
    return NextResponse.json(
      { detail: "Login setup is required", setup_required: true },
      { status: 428, headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { detail: "Unauthorized" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

export const config = {
  matcher: [
    "/api/:path*",
    "/app_data/:path*",
    "/static/:path*",
    "/pdf-maker",
    "/presentation",
  ],
};
