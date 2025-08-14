"use client";

import React, { use, useEffect, useRef, useState, useCallback } from "react";
import type { FC } from "react";
import Image from "next/image";

type DisplayPageProps = {
  params: Promise<{
    serviceId: string;
  }>;
};

// รองรับทั้งรูปแบบอีเวนต์ที่เรียบง่าย และแบบเต็มของระบบปัจจุบัน
type SimpleTicketEvent =
  | { type: "CURRENT"; ticketNo: string; nextTicketNo?: string }
  | { type: "NEXT"; ticketNo: string; nextTicketNo?: string };

type RichTicket = {
  id: number;
  displayNo: string;
  name?: string | null;
};

type RichTicketEvent =
  | { type: "NEXT"; current: RichTicket | null; next: RichTicket | null }
  | { type: "RECALL"; current: RichTicket | null }
  | { type: "SKIP"; current: RichTicket | null }
  | { type: "SERVED"; served: RichTicket | null; next: RichTicket | null };

const DisplayPage: FC<DisplayPageProps> = ({ params }) => {
  const { serviceId } = use(params);
  const [currentTicket, setCurrentTicket] = useState<string | null>(null);
  const [nextTicket, setNextTicket] = useState<string | null>(null);

  const [currentName, setCurrentName] = useState<string | null>(null);
  const [nextName, setNextName] = useState<string | null>(null);
  const [animateKey, setAnimateKey] = useState<number>(0);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastObjectUrlRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [dateTime, setDateTime] = useState<string>(() => {
    const now = new Date();
    const datePart = now.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
    const timePart = now.toLocaleTimeString("th-TH");
    return `${datePart} ${timePart}`;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const datePart = now.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
      const timePart = now.toLocaleTimeString("th-TH");
      setDateTime(`${datePart} ${timePart}`);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const announce = useCallback(async (text: string) => {
    if (!audioEnabled) return; // ต้องมี user gesture เปิดก่อน
    try {
      const res = await fetch(`/api/tts?q=${encodeURIComponent(text)}`);
      if (!res.ok) return;
      const blob = await res.blob();
      // cleanup URL เก่า
      if (lastObjectUrlRef.current) {
        URL.revokeObjectURL(lastObjectUrlRef.current);
        lastObjectUrlRef.current = null;
      }
      const url = URL.createObjectURL(blob);
      lastObjectUrlRef.current = url;
      if (!audioRef.current) return;
      audioRef.current.src = url;
      await audioRef.current.play().catch(() => {});
    } catch {
      // เงียบไว้
    }
  }, [audioEnabled]);

  useEffect(() => {
    if (!serviceId) return;

    const es = new EventSource(`/api/stream/${serviceId}`);
    eventSourceRef.current = es;

    es.onmessage = (event: MessageEvent) => {
      try {
        const raw = JSON.parse(event.data);

        // พยายามแยกสองรูปแบบอีเวนต์
        const isSimple =
          typeof raw?.ticketNo === "string" || raw?.type === "CURRENT";
        if (isSimple) {
          const data = raw as SimpleTicketEvent;
          if (data.type === "CURRENT") {
            setCurrentTicket(data.ticketNo);
            setCurrentName(null);
            setNextTicket(data.nextTicketNo ?? null);
            setNextName(null);
          } else if (data.type === "NEXT") {
            setCurrentTicket(data.ticketNo);
            setCurrentName(null);
            setNextTicket(data.nextTicketNo ?? null);
            setNextName(null);
            setAnimateKey((k) => k + 1);
            announce(`ขอเชิญหมายเลข ${data.ticketNo} `);
          }
          return;
        }

        // รูปแบบอีเวนต์ของระบบจริง
        const ev = raw as RichTicketEvent;
        switch (ev.type) {
          case "NEXT": {
            const now = ev.current?.displayNo ?? null;
            const nxt = ev.next?.displayNo ?? null;
            setCurrentTicket(now);
            setCurrentName(ev.current?.name ?? null);
            setNextTicket(nxt);
            setNextName(ev.next?.name ?? null);
            if (now) {
              setAnimateKey((k) => k + 1);
              announce(`ขอเชิญหมายเลข ${now} `);
            }
            break;
          }
          case "RECALL": {
            const now = ev.current?.displayNo ?? null;
            setCurrentTicket(now);
            setCurrentName(ev.current?.name ?? null);
            if (now) {
              setAnimateKey((k) => k + 1);
              announce(`ขอเชิญหมายเลข ${now} `);
            }
            break;
          }
          case "SKIP": {
            const curNo = ev.current?.displayNo ?? null;
            const curName = ev.current?.name ?? null;
            setCurrentTicket((prev) =>
              prev && curNo && prev === curNo ? null : prev
            );
            setCurrentName((prev) =>
              prev && curName && prev === curName ? null : prev
            );
            break;
          }
          case "SERVED": {
            setCurrentTicket((prev) =>
              ev.served?.displayNo && prev === ev.served.displayNo ? null : prev
            );
            setCurrentName((prev) =>
              ev.served?.name && prev === ev.served.name ? null : prev
            );
            setNextTicket(ev.next?.displayNo ?? null);
            setNextName(ev.next?.name ?? null);
            break;
          }
          default:
            break;
        }
      } catch {
        // ignore parse error
      }
    };

    return () => {
      es.close();
    };
  }, [serviceId, announce]);

  useEffect(() => {
    return () => {
      if (lastObjectUrlRef.current) {
        URL.revokeObjectURL(lastObjectUrlRef.current);
        lastObjectUrlRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.20),transparent_40%),radial-gradient(ellipse_at_bottom_left,rgba(16,185,129,0.18),transparent_40%)] animate-[bgFloat_18s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute inset-0 -z-10 backdrop-blur-[1.5px]" />

      {/* Global styles for animations */}
      <style jsx global>{`
        @keyframes bgFloat {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(0,-8px,0) scale(1.02); }
        }
        @keyframes flipIn {
          0% { transform: rotateX(90deg); opacity: 0; }
          60% { transform: rotateX(-10deg); opacity: 1; }
          100% { transform: rotateX(0deg); }
        }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.35); }
          70% { box-shadow: 0 0 0 24px rgba(59,130,246,0); }
          100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>

      {/* Time */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 text-base sm:text-lg font-medium text-slate-600/90"
      >
        {dateTime}
      </div>

      {/* KMUTT Logo */}
      <Image
        src="/KMUTT_CI_Semi_Logo_en-full.png"
        alt="KMUTT Logo"
        width={200} // adjust as needed for display size
        height={80} // adjust as needed for display size
        className="absolute top-1 left-4 h-16 sm:h-20 w-auto opacity-80"
        priority
      />

      {/* Main content */}
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-16">
        {/* Title */}
        <div className="mb-4 text-slate-500">ขอเชิญหมายเลข</div>

        {/* Current Ticket with glow & flip animation */}
        <div className="relative mb-8 flex items-center justify-center">
          <div
            key={animateKey}
            className="select-none rounded-2xl bg-white/60 px-8 py-5 text-center shadow-sm ring-1 ring-slate-200 backdrop-blur-sm animate-[flipIn_700ms_cubic-bezier(.2,.7,.2,1)_both]"
            style={{ minWidth: "12ch" }}
          >
            <div className="absolute -inset-2 -z-10 rounded-3xl animate-[pulseRing_1800ms_ease-out]" />
            <div className="bg-gradient-to-b from-slate-900 to-slate-700 bg-clip-text text-8xl sm:text-9xl font-extrabold tracking-widest text-transparent">
              {currentTicket ? currentTicket : "--"}
            </div>
            <div className="mt-1 text-lg text-slate-600/90">{currentName || ""}</div>
          </div>
        </div>

        {/* Next Ticket */}
        <div className="mt-2 w-full max-w-2xl rounded-xl border border-slate-200 bg-white/70 p-4 text-center shadow-sm backdrop-blur-sm">
          <div className="text-sm text-slate-500">คิวถัดไป</div>
          <div className="relative mx-auto mt-1 w-full overflow-hidden">
            <div className="mx-auto inline-block min-w-[10ch] text-3xl font-semibold tracking-wider text-slate-800">
              {nextTicket ? (
                <span>
                  {nextTicket}
                  {nextName ? ` - ${nextName}` : ""}
                </span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Announce toggle */}
      <button
        onClick={() => {
          setAudioEnabled(true);
          // Try to unlock audio on mobile Safari/Chrome by playing a tiny silent sound
          try {
            if (audioRef.current) {
              const silentWav =
                "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
              audioRef.current.src = silentWav;
              audioRef.current.play().catch(() => {});
            }
          } catch {}
        }}
        disabled={audioEnabled}
        title={audioEnabled ? "พร้อมประกาศ" : "เปิดเสียงประกาศ"}
        className={`fixed bottom-5 right-5 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm shadow-sm backdrop-blur ${audioEnabled ? "cursor-default text-slate-500" : "hover:bg-white"}`}
      >
        {audioEnabled ? "🔊 พร้อมประกาศ" : "🔈 เปิดเสียงประกาศ"}
      </button>

      {/* Hidden audio element for announcements */}
      <audio ref={audioRef} preload="auto" className="hidden" />
    </div>
  );
};

export default DisplayPage;