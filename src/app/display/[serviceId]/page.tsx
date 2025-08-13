"use client";

import React, { use, useEffect, useRef, useState, useCallback } from "react";
import type { FC } from "react";

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
            setNextTicket(data.nextTicketNo ?? null);
          } else if (data.type === "NEXT") {
            setCurrentTicket(data.ticketNo);
            setNextTicket(data.nextTicketNo ?? null);
            // ประกาศ
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
            setNextTicket(nxt);
            if (now) announce(`ขอเชิญหมายเลข ${now} `);
            break;
          }
          case "RECALL": {
            const now = ev.current?.displayNo ?? null;
            if (now) {
              setCurrentTicket(now);
              announce(`ขอเชิญหมายเลข ${now} `);
            }
            break;
          }
          case "SKIP": {
            // ถ้าข้าม current ให้เคลียร์เลขปัจจุบัน
            const curNo = ev.current?.displayNo ?? null;
            setCurrentTicket((prev) =>
              prev && curNo && prev === curNo ? null : prev
            );
            break;
          }
          case "SERVED": {
            // ถ้าให้บริการเสร็จ ใบปัจจุบันเคลียร์ และอัปเดต next (ถ้ามี)
            setCurrentTicket((prev) =>
              ev.served?.displayNo && prev === ev.served.displayNo ? null : prev
            );
            setNextTicket(ev.next?.displayNo ?? null);
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#f9fafb",
      }}
    >
      <button
        onClick={() => setAudioEnabled(true)}
        disabled={audioEnabled}
        style={{ position: "absolute", top: 16, right: 16, padding: "0.5rem 0.75rem", border: "1px solid #e5e7eb", borderRadius: 8, background: audioEnabled ? "#e5e7eb" : "white" }}
      >
        {audioEnabled ? "พร้อมประกาศ" : "เปิดเสียงประกาศ"}
      </button>
      <audio ref={audioRef} preload="auto" />
      <div
        style={{
          fontSize: "1.5rem",
          color: "#6b7280",
          fontWeight: "500",
          position: "absolute",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {dateTime}
      </div>
      <div
        style={{
          fontSize: "6rem",
          fontWeight: "bold",
          color: "#111827",
          marginBottom: "2rem",
          textAlign: "center",
        }}
      >
        {currentTicket ? currentTicket : "--"}
      </div>
      <div
        style={{
          fontSize: "2rem",
          color: "#374151",
          textAlign: "center",
        }}
      >
        {nextTicket ? `ถัดไป: ${nextTicket}` : ""}
      </div>
    </div>
  );
};

export default DisplayPage;