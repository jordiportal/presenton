import { NextResponse } from "next/server";
import { PRESENTON_EMBED_COOKIE } from "@/utils/embed";

export type ServerAuthStatus = {
  configured: boolean;
  authenticated: boolean;
  username: string | null;
  user_id: string | null;
  role: "admin" | "user" | null;
};

function fastApiBase(): string {
  return (
    process.env.FAST_API_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_FAST_API?.trim() ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");
}

function embedTokenFromCookie(cookie: string): string | null {
  const match = cookie.match(
    new RegExp(`(?:^|;\\s*)${PRESENTON_EMBED_COOKIE}=([^;]+)`)
  );
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** Cookie de sesión, Bearer de embed, o cookie `presenton_embed`. */
export function outboundAuthHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get("cookie") || "";
  const authorization = request.headers.get("authorization") || "";
  if (cookie) {
    headers.cookie = cookie;
  }
  if (authorization) {
    headers.authorization = authorization;
  } else {
    const embedToken = embedTokenFromCookie(cookie);
    if (embedToken) {
      headers.authorization = `Bearer ${embedToken}`;
    }
  }
  return headers;
}

export async function authStatusForRequest(
  request: Request
): Promise<ServerAuthStatus> {
  const headers = outboundAuthHeaders(request);
  try {
    const response = await fetch(`${fastApiBase()}/api/v1/auth/status`, {
      headers: Object.keys(headers).length ? headers : undefined,
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        configured: true,
        authenticated: false,
        username: null,
        user_id: null,
        role: null,
      };
    }
    return (await response.json()) as ServerAuthStatus;
  } catch {
    return {
      configured: true,
      authenticated: false,
      username: null,
      user_id: null,
      role: null,
    };
  }
}

export async function requireAdminApi(
  request: Request
): Promise<NextResponse | null> {
  const status = await authStatusForRequest(request);
  if (!status.authenticated) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  if (status.role !== "admin") {
    return NextResponse.json(
      { detail: "Admin access required" },
      { status: 403 }
    );
  }
  return null;
}
