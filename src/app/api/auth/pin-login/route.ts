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

  const res = NextResponse.json({ ok: true });
  res.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 ชั่วโมง
  });
  return res;
}