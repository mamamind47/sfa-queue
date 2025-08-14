"use client";

import { useState } from "react";
import Link from "next/link";

export default function StaffLogin() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        location.href = "/staff";
      } else {
        setErr("PIN ไม่ถูกต้อง");
      }
    } catch {
      setErr("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">เข้าสู่ระบบเจ้าหน้าที่</h1>
          <p className="mt-1 text-sm text-slate-600">โปรดกรอก PIN สำหรับเจ้าหน้าที่</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-700">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                autoFocus
                className="w-full rounded-lg border border-slate-300 p-3 tracking-widest outline-none focus:ring-2 focus:ring-slate-200"
                placeholder=""
                value={pin}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "");
                  setPin(digits.slice(0, 8));
                }}
              />
              {err && (
                <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
                  {err}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={!pin || loading}
              className="w-full rounded-lg bg-black px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
            </button>
          </form>
        </div>

        {/* Helper / Back to ticket */}
        <div className="mt-4 text-center text-sm text-slate-600">
          ไม่ใช่ผู้ดูแลใช่ไหม?{" "}
          <Link href="/ticket" className="font-medium text-blue-600 hover:underline">
            ต้องการจองคิว
          </Link>
        </div>
      </div>
    </main>
  );
}