// src/app/api/stream/[serviceId]/route.ts
import { onService, type ServiceEvent } from "@/lib/events";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ serviceId: string }> }
) {
  const { serviceId } = await ctx.params;
  const id = Number(serviceId);
  if (!Number.isFinite(id)) {
    return new Response(JSON.stringify({ error: "Invalid serviceId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: ServiceEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const off = onService(id, send);
      // hello event
      send({ type: "HELLO", ts: Date.now() });

      ;(async () => {
        try {
          const svc = await prisma.service.findUnique({
            where: { id },
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

          const current = svc?.currentTicket ?? null;
          const next = await prisma.ticket.findFirst({
            where: { serviceId: id, status: "WAITING" },
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

          const waiting = await prisma.ticket.count({ where: { serviceId: id, status: "WAITING" } });

          send({ type: "STATE", current, next: next ?? null, waiting });
        } catch {
          // ignore initial snapshot errors
        }
      })();

      // heartbeat ป้องกัน proxy ปิดการเชื่อมต่อ
      const iv = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 25000);

      const abort = () => {
        clearInterval(iv);
        off();
        controller.close();
      };
      req.signal.addEventListener("abort", abort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}