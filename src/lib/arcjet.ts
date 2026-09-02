import arcjet, { shield, slidingWindow } from "@arcjet/next";
import { NextResponse } from "next/server";

type ProtectionCategory = "auth" | "sniper-write" | "expensive-read" | "history" | "api";

function positiveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function ruleConfig(category: ProtectionCategory) {
  const defaults: Record<ProtectionCategory, [number, number]> = {
    auth: [10, 60],
    "sniper-write": [20, 60],
    "expensive-read": [60, 60],
    history: [120, 60],
    api: [240, 60],
  };
  const [maxDefault, intervalDefault] = defaults[category];
  const prefix = category.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()).toUpperCase();
  return {
    max: positiveNumber(`RATE_LIMIT_${prefix}_MAX_REQUESTS`, positiveNumber("RATE_LIMIT_MAX_REQUESTS", maxDefault)),
    interval: positiveNumber(`RATE_LIMIT_${prefix}_WINDOW_MS`, positiveNumber("RATE_LIMIT_WINDOW_MS", intervalDefault * 1000)) / 1000,
  };
}

const baseArcjet = arcjet({
  key: process.env.ARCJET_KEY!,
  rules: [shield({ mode: "LIVE" })],
});

const protections = new Map(
  (["auth", "sniper-write", "expensive-read", "history", "api"] as ProtectionCategory[]).map((category) => {
    const config = ruleConfig(category);
    return [
      category,
      baseArcjet.withRule(
        slidingWindow({
          mode: "LIVE",
          interval: config.interval,
          max: config.max,
          ...(category === "auth" || category === "api" ? {} : { characteristics: ["userId"] }),
        }),
      ),
    ];
  }),
);

export async function protectApi(request: Request, category: ProtectionCategory, userId?: string) {
  if (process.env.RATE_LIMIT_ENABLED?.toLowerCase() === "false") return undefined;

  const protection = protections.get(category);
  if (!protection) return undefined;

  const decision = await protection.protect(request, { userId: userId ?? "anonymous" });
  if (!decision.isDenied()) return undefined;

  const rateLimited = decision.reason.isRateLimit();
  const response = NextResponse.json(
    { success: false, error: rateLimited ? "Too many requests. Please retry later." : "Request blocked by security policy." },
    { status: rateLimited ? 429 : 403 },
  );
  if (rateLimited) response.headers.set("Retry-After", "60");
  return response;
}
