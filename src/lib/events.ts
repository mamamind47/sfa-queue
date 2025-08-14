// src/lib/events.ts
import { EventEmitter } from "events";
import { prisma } from "@/lib/prisma";

// Ensure a single EventEmitter instance across module reloads (Next.js dev/HMR)
declare global {
  var __SFA_EVENTS__: EventEmitter | undefined;
}

export const events: EventEmitter =
  globalThis.__SFA_EVENTS__ ?? (globalThis.__SFA_EVENTS__ = new EventEmitter());

events.setMaxListeners(2000);


export type TicketData = {
  id: number;
  displayNo: string;
  name?: string | null;
  serviceId: number;
  status: string;
  calledAt?: Date | null;
  servedAt?: Date | null;
  skippedAt?: Date | null;
};

type WithWaiting<T> = T & { waiting?: number };

export type ServiceEvent =
  | { type: "HELLO"; ts: number }
  | WithWaiting<{ type: "NEXT"; current: TicketData | null; next: TicketData | null }>
  | WithWaiting<{ type: "RECALL"; current: TicketData }>
  | WithWaiting<{ type: "SKIP"; current: TicketData }>
  | WithWaiting<{ type: "SERVED"; served: TicketData; next: TicketData | null }>
  | { type: "STATE"; current: TicketData | null; next: TicketData | null; waiting: number };

export function emitService(serviceId: number, payload: ServiceEvent) {
  // Emit HELLO as-is
  if (payload.type === "HELLO") {
    events.emit(`service:${serviceId}`, payload);
    return;
  }

  // First, count waiting and emit the original event enriched with waiting
  prisma.ticket
    .count({ where: { serviceId, status: "WAITING" } })
    .then(async (waiting: number) => {
      const enriched: ServiceEvent = { ...payload, waiting };
      events.emit(`service:${serviceId}`, enriched);

      // Then, fetch a fresh snapshot (current, next, waiting) and emit as STATE
      try {
        const svc = await prisma.service.findUnique({
          where: { id: serviceId },
          include: {
            currentTicket: {
              select: {
                id: true,
                displayNo: true,
                name: true,
                serviceId: true,
                status: true,
                calledAt: true,
                servedAt: true,
                skippedAt: true,
              },
            },
          },
        });

        const next = await prisma.ticket.findFirst({
          where: { serviceId, status: "WAITING" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            displayNo: true,
            name: true,
            serviceId: true,
            status: true,
            calledAt: true,
            servedAt: true,
            skippedAt: true,
          },
        });

        const latestWaiting = await prisma.ticket.count({ where: { serviceId, status: "WAITING" } });

        const snapshot: ServiceEvent = {
          type: "STATE",
          current: svc?.currentTicket ?? null,
          next: next ?? null,
          waiting: latestWaiting,
        };
        events.emit(`service:${serviceId}`, snapshot);
      } catch {
        // ignore snapshot errors
      }
    })
    .catch(() => {
      // Fallback: emit original payload if counting fails
      events.emit(`service:${serviceId}`, payload);
    });
}

export function onService(
  serviceId: number,
  cb: (payload: ServiceEvent) => void
) {
  events.on(`service:${serviceId}`, cb);
  return () => events.off(`service:${serviceId}`, cb);
}

// โปรดทราบ: ถ้า deploy หลายอินสแตนซ์ใน production ให้เปลี่ยนมาใช้ Redis Pub/Sub

// ยิง STATE snapshot ทันที (ใช้ตอน enqueue/cancel ฯลฯ)
export async function emitServiceState(serviceId: number) {
  try {
    const svc = await prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        currentTicket: {
          select: {
            id: true,
            displayNo: true,
            name: true,
            serviceId: true,
            status: true,
            calledAt: true,
            servedAt: true,
            skippedAt: true,
          },
        },
      },
    });

    const next = await prisma.ticket.findFirst({
      where: { serviceId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        displayNo: true,
        name: true,
        serviceId: true,
        status: true,
        calledAt: true,
        servedAt: true,
        skippedAt: true,
      },
    });

    const waiting = await prisma.ticket.count({
      where: { serviceId, status: "WAITING" },
    });

    events.emit(`service:${serviceId}`, {
      type: "STATE",
      current: svc?.currentTicket ?? null,
      next: next ?? null,
      waiting,
    });
  } catch {
    // เงียบไว้
  }
}