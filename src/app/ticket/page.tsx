"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type NewTicketResponse = {
  id: number;
  displayNo: string;
  token: string;
  serviceId: number;
  status: "WAITING" | "CALLED" | "SERVED" | "SKIPPED" | "CANCELED";
  name?: string | null;
};

export default function TakeTicket() {
  const [services, setServices] = useState<
    { id: number; code: string; name: string }[]
  >([]);
  const [serviceCode, setServiceCode] = useState("");
  const [mode, setMode] = useState<"guest" | "student">("guest");
  const [studentId, setStudentId] = useState("");
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/services-list");
      const j = await r.json();
      setServices(j);
      if (j[0]) setServiceCode(j[0].code);
    })();
  }, []);

  useEffect(() => {
    // When user revisits, keep their ticket if still active
    try {
      if (typeof window !== "undefined") {
        const last = localStorage.getItem("sfaq:lastToken");
        if (last) {
          (async () => {
            try {
              const r = await fetch(`/api/tickets/${last}`, { cache: "no-store" });
              if (r.ok) {
                const d: { status: "WAITING" | "CALLED" | "SERVED" | "SKIPPED" | "CANCELED" } = await r.json();
                const isTerminal = d.status === "SERVED" || d.status === "SKIPPED" || d.status === "CANCELED";
                if (!isTerminal) {
                  router.replace(`/my`);
                  return;
                }
                // if terminal, clear saved token
                localStorage.removeItem("sfaq:lastToken");
              } else {
                // invalid token → clear
                localStorage.removeItem("sfaq:lastToken");
              }
            } catch {
              // network error → ignore and stay
            }
          })();
        }
      }
    } catch {
      // ignore storage errors (Safari private mode, etc.)
    }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceCode,
        mode,
        studentId: mode === "student" ? studentId : undefined,
      }),
    });
    const j = (await res.json()) as NewTicketResponse;
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("sfaq:lastToken", j.token);
      }
    } catch {}
    router.push(`/my`);
  }

  return (
    <main className="p-6 space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold">กดคิว</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          บริการ
          <select
            className="border p-2 w-full"
            value={serviceCode}
            onChange={(e) => setServiceCode(e.target.value)}
          >
            {services.map((s) => (
              <option key={s.id} value={s.code}>
                {s.code} – {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-4">
          <label>
            <input
              type="radio"
              checked={mode === "guest"}
              onChange={() => setMode("guest")}
            />{" "}
            Guest
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "student"}
              onChange={() => setMode("student")}
            />{" "}
            Student
          </label>
        </div>
        {mode === "student" && (
          <input
            className="border p-2 w-full"
            placeholder="รหัสนักศึกษา"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          />
        )}
        <button className="bg-black text-white px-4 py-2">กดคิว</button>
      </form>
    </main>
  );
}