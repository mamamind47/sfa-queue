// src/lib/auth-guard.ts
import type { NextRequest } from "next/server";
import jwt from "jsonwebtoken";

const MODE = process.env.AUTH_MODE ?? "PIN"; // "PIN_SESSION" | "PIN" | "SESSION" (อนาคต)
const SECRET = process.env.AUTH_SECRET || "dev-secret";

type AuthResult =
  | { ok: true; user: { id: string; name?: string | null } }
  | { ok: false; status: number; body: { error: string } };

export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  // 1) เช็ค cookie session ก่อน
  const token = req.cookies.get("auth_token")?.value;
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET) as {
        sub: string;
        typ?: string;
        name?: string;
      };
      return {
        ok: true,
        user: { id: payload.sub, name: payload.name ?? null },
      };
    } catch {
      // token เสีย/หมดอายุ → ปล่อยผ่านไปเช็ค PIN ต่อไป (โหมด PIN/PIN_SESSION)
    }
  }

  // 2) โหมดปัจจุบัน: PIN / PIN_SESSION
  if (MODE === "PIN" || MODE === "PIN_SESSION") {
    const expected = process.env.STAFF_PIN || process.env.ADMIN_PIN;
    const pin =
      req.headers.get("x-staff-pin") || req.headers.get("x-admin-pin");
    if (expected && pin === expected) {
      // ถือว่าผ่าน (เหมือน login สำเร็จแล้ว)
      return { ok: true, user: { id: "pin-user" } };
    }
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }

  // 3) โหมดอนาคต: SESSION (NextAuth) — ไว้สลับมาใช้งานตอนหลังได้
  // if (MODE === "SESSION") {
  //   const session = await getServerSession(authOptions);
  //   if (!session?.user) return { ok: false, status: 401, body: { error: "Unauthorized" } };
  //   return { ok: true, user: { id: String(session.user.id ?? "session-user"), name: session.user.name } };
  // }

  return { ok: false, status: 500, body: { error: "Auth mode not supported" } };
}

/** ใช้ตอน login ด้วย PIN → ออก session token */
export function signSession(sub: string, name?: string | null) {
  // อายุ session 8 ชม. (ปรับได้)
  return jwt.sign({ sub, name, typ: "pin" }, SECRET, { expiresIn: "8h" });
}