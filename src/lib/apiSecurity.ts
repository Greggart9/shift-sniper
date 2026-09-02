import type { NextRequest, NextResponse } from "next/server";

function allowedOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function applyCors(request: NextRequest, response: NextResponse) {
  const origin = request.headers.get("origin");
  const allowed = origin && allowedOrigins().has(origin.replace(/\/$/, ""));
  response.headers.set("Vary", "Origin");
  if (allowed) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "600");
  }
  return response;
}

export function checkApiRequest(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return undefined;

  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin.replace(/\/$/, ""))) {
    return { status: 403, message: "Origin is not allowed." };
  }

  return undefined;
}

export function securityResponse(request: NextRequest, response: NextResponse) {
  return applyCors(request, response);
}
