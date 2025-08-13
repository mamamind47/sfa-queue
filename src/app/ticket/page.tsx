"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [loadingServices, setLoadingServices] = useState<boolean>(true);
  const [serviceCode, setServiceCode] = useState("");
  const [mode, setMode] = useState<"guest" | "student" | null>(null);
  const [studentId, setStudentId] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [posting, setPosting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const router = useRouter();

  // 1) Load services
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/services-list", { cache: "no-store" });
        const j = await r.json();
        setServices(j);
      } catch {
        // ignore
      } finally {
        setLoadingServices(false);
      }
    })();
  }, []);

  // 2) Restore my ticket if still active
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const last = localStorage.getItem("sfaq:lastToken");
        if (last) {
          (async () => {
            try {
              const r = await fetch(`/api/tickets/${last}`, { cache: "no-store" });
              if (r.ok) {
                const d: { status: NewTicketResponse["status"] } = await r.json();
                const terminal = d.status === "SERVED" || d.status === "SKIPPED" || d.status === "CANCELED";
                if (!terminal) {
                  router.replace(`/my`);
                  return;
                }
                localStorage.removeItem("sfaq:lastToken");
              } else {
                localStorage.removeItem("sfaq:lastToken");
              }
            } catch {
              /* ignore */
            }
          })();
        }
      }
    } catch {
      /* ignore */
    }
  }, [router]);

  // Derived validators
  const isStudentIdValid = useMemo(() => /^(\d{11})$/.test(studentId.trim()), [studentId]);
  const canGoStep2 = !!serviceCode;
  const canConfirm = useMemo(() => {
    if (!serviceCode || !mode) return false;
    if (mode === "student") return isStudentIdValid;
    return true;
  }, [serviceCode, mode, isStudentIdValid]);

  // Handlers
  const selectService = (code: string) => {
    setServiceCode(code);
    setStep(2);
  };
  const selectMode = (m: "guest" | "student") => {
    setMode(m);
    if (m === "guest") setStep(3);
  };

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canConfirm || posting) return;
    setPosting(true);
    setErrMsg(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceCode,
          mode: mode ?? "guest",
          studentId: mode === "student" ? studentId.trim() : undefined,
        }),
      });
      const j = (await res.json()) as NewTicketResponse | { error?: string };
      if (!("token" in j)) {
        const maybeErr = (j as Record<string, unknown>).error;
        const err =
          typeof maybeErr === "string" ? maybeErr : "เกิดข้อผิดพลาด กรุณาลองใหม่";
        setErrMsg(err);
        setPosting(false);
        return;
      }
      try {
        if (typeof window !== "undefined") {
          localStorage.setItem("sfaq:lastToken", (j as NewTicketResponse).token);
        }
      } catch {}
      router.push(`/my`);
    } catch {
      setErrMsg("ไม่สามารถจองคิวได้ กรุณาลองใหม่");
      setPosting(false);
    }
  }

  // Components
  const StepDots = ({ current }: { current: 1 | 2 | 3 }) => (
    <div className="flex items-center justify-center gap-2 py-2">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-2.5 w-2.5 rounded-full transition-colors ${
            current >= (n as 1 | 2 | 3) ? "bg-black" : "bg-slate-300"
          }`}
        />
      ))}
    </div>
  );

  const Section = ({
    title,
    children,
    active,
  }: {
    title: string;
    children: React.ReactNode;
    active: boolean;
  }) => (
    <section
      className={`rounded-2xl border p-4 shadow-sm transition-all ${
        active ? "bg-white" : "bg-white/70 opacity-70"
      }`}
    >
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );

  return (
    <main className="mx-auto max-w-md p-4 pb-28">
      <div className="sticky top-0 z-10 -mx-4 mb-4 bg-white/80 px-4 pt-3 backdrop-blur">
        <h1 className="text-2xl font-bold">รับบัตรคิว - SFA Queue</h1>
        <StepDots current={step} />
      </div>

      {/* Step 1: เลือกบริการ */}
      <Section title="เลือกประเภทบริการ" active={step === 1}>
        {loadingServices ? (
          <div className="animate-pulse text-slate-500">กำลังโหลดบริการ…</div>
        ) : services.length === 0 ? (
          <div className="text-slate-500">ยังไม่มีบริการให้เลือก</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {services.map((s) => {
              const selected = serviceCode === s.code;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => selectService(s.code)}
                  className={`flex items-center justify-between rounded-xl border p-4 text-left shadow-sm transition-all active:scale-[.99] ${
                    selected
                      ? "border-black bg-black text-white"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <div className="text-base font-semibold tracking-wide">
                      {s.code}
                    </div>
                    <div
                      className={`text-sm ${
                        selected ? "opacity-90" : "text-slate-600"
                      }`}
                    >
                      {s.name}
                    </div>
                  </div>
                  <div
                    className={`text-sm ${
                      selected ? "opacity-90" : "text-slate-500"
                    }`}
                  >
                    {selected ? "เลือกแล้ว" : "เลือก"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        {serviceCode && step === 1 && (
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg bg-black px-4 py-2 text-white"
            >
              ต่อไป
            </button>
          </div>
        )}
      </Section>

      {/* Step 2: เลือกโหมด */}
      <div className="h-4" />
      <Section title="เลือกรูปแบบการจอง" active={step === 2}>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => selectMode("guest")}
            className={`rounded-xl border p-4 text-center shadow-sm transition-all active:scale-[.99] ${
              mode === "guest"
                ? "border-black bg-black text-white"
                : "hover:bg-slate-50"
            }`}
          >
            <div className="text-2xl">🙋‍♂️</div>
            <div className="mt-1 font-semibold">ไม่ระบุชื่อ</div>
            <div className="text-xs opacity-70">เข้ารับบริการแบบทั่วไป</div>
          </button>
          <button
            type="button"
            onClick={() => selectMode("student")}
            className={`rounded-xl border p-4 text-center shadow-sm transition-all active:scale-[.99] ${
              mode === "student"
                ? "border-black bg-black text-white"
                : "hover:bg-slate-50"
            }`}
          >
            <div className="text-2xl">🎓</div>
            <div className="mt-1 font-semibold">รหัสนักศึกษา</div>
            <div className="text-xs opacity-70">เชื่อมข้อมูลนักศึกษา</div>
          </button>
        </div>

        {mode === "student" && (
          <div className="mt-4">
            <label className="mb-1 block text-sm">รหัสนักศึกษา (11 หลัก)</label>
            <input
              inputMode="numeric"
              maxLength={11}
              autoFocus
              className={`w-full rounded-lg border p-3 tracking-wider outline-none focus:ring-2 ${
                studentId && !isStudentIdValid
                  ? "border-red-300 focus:ring-red-200"
                  : "border-slate-300 focus:ring-slate-200"
              }`}
              placeholder="เช่น 67070501234"
              value={studentId}
              onChange={(e) => {
                const onlyNums = e.target.value.replace(/[^0-9]/g, "");
                const trimmed = onlyNums.slice(0, 11);
                setStudentId(trimmed);
                if (trimmed.length === 11) {
                  setTimeout(() => setStep(3), 150);
                }
              }}
            />
            <div className="mt-1 text-xs text-red-600">
              {studentId && !isStudentIdValid
                ? "รูปแบบรหัสไม่ถูกต้อง"
                : "\u00A0"}
            </div>
          </div>
        )}

        {mode && step === 2 && (
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border px-4 py-2 hover:bg-slate-50"
            >
              ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={
                !canGoStep2 || (mode === "student" && !isStudentIdValid)
              }
              className="rounded-lg bg-black px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              ต่อไป
            </button>
          </div>
        )}
      </Section>

      {/* Step 3: สรุป & ยืนยัน */}
      <div className="h-4" />
      <Section title="ตรวจสอบและยืนยัน" active={step === 3}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="opacity-70">ประเภทบริการ</div>
            <div className="font-medium">
              {services.find((s) => s.code === serviceCode)?.name || (
                <span className="text-slate-400">—</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="opacity-70">รูปแบบ</div>
            <div className="font-medium">
              {mode === "guest" ? (
                "ไม่ระบุชื่อ"
              ) : mode === "student" ? (
                "รหัสนักศึกษา"
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          </div>
          {mode === "student" && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="opacity-70">รหัสนักศึกษา</div>
              <div className="font-mono tracking-wider">{studentId || "—"}</div>
            </div>
          )}
          {errMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {errMsg}
            </div>
          )}
        </div>
      </Section>

      {/* Sticky footer CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <button
            type="button"
            onClick={
              step < 3
                ? () => setStep((s) => (s === 3 ? 3 : s === 2 ? 3 : 2))
                : submit
            }
            disabled={!canConfirm || posting}
            className="w-full rounded-lg bg-black px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {step < 3 ? "ต่อไป" : posting ? "กำลังจอง…" : "ยืนยันจอง"}
          </button>
        </div>
      </div>
    </main>
  );
}