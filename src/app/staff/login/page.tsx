"use client";
import { useState } from "react";

export default function StaffLogin() {
  const [pin, setPin] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/pin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) location.href = "/staff";
    else alert("PIN ไม่ถูกต้อง");
  }

  return (
    <main className="p-6 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold mb-4">Staff Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="border p-2 w-full"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <button className="bg-black text-white px-4 py-2 w-full">
          เข้าสู่ระบบ
        </button>
      </form>
    </main>
  );
}