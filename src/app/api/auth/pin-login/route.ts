import { NextResponse } from "next/server";
import { signSession } from "@/lib/auth-guard";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    pin?: string;
    name?: string;
  };

  const expected = process.env.STAFF_PIN || process.env.ADMIN_PIN;
  if (!expected || !body.pin || body.pin !== expected) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const token = signSession("pin-user", body.name ?? null);

  // Detect protocol behind proxy / direct
  const url = new URL(req.url);
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const isHttps = forwardedProto === "https" || url.protocol === "https:";

  // Optional override via env: FORCE_COOKIE_SECURE=1 | 0
  const force = process.env.FORCE_COOKIE_SECURE;
  const secure = force === "1" ? true : force === "0" ? false : isHttps;

  // Respect base path when scoping cookie (e.g. "/q")
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const cookiePath = basePath && basePath !== "/" ? basePath : "/";

  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth_token", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: cookiePath,
    maxAge: 60 * 60 * 8, // 8 ชั่วโมง
  });
  return res;
}