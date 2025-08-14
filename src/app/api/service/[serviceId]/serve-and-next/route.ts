import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitService } from "@/lib/events";
import { requireAuth } from "@/lib/auth-guard";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ serviceId: string }> }
) {
  const gate = await requireAuth(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  const { serviceId } = await ctx.params;
  const id = Number(serviceId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid serviceId" }, { status: 400 });
  }

  try {
    // อะตอมมิก: mark SERVED -> clear current -> pick next (ถ้ามี) -> mark CALLED
    const { served, current, next } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const svc = await tx.service.findUnique({
        where: { id },
        include: { currentTicket: true },
      });
      if (!svc?.currentTicket) throw new Error("No current ticket");

      const served = await tx.ticket.update({
        where: { id: svc.currentTicket.id },
        data: { status: "SERVED", servedAt: new Date() },
        select: {
          id: true,
          displayNo: true,
          name: true,
          serviceId: true,
          status: true,
          servedAt: true,
        },
      });

      // หาใบถัดไป
      const nextWaiting = await tx.ticket.findFirst({
        where: { serviceId: id, status: "WAITING" },
        orderBy: { createdAt: "asc" },
      });

      if (!nextWaiting) {
        await tx.service.update({
          where: { id },
          data: { currentTicketId: null },
        });
        return { served, current: null, next: null };
      }

      await tx.service.update({
        where: { id },
        data: { currentTicketId: nextWaiting.id },
      });
      const called = await tx.ticket.update({
        where: { id: nextWaiting.id },
        data: { status: "CALLED", calledAt: new Date() },
        select: {
          id: true,
          displayNo: true,
          name: true,
          serviceId: true,
          status: true,
          calledAt: true,
        },
      });

      const preview = await tx.ticket.findFirst({
        where: { serviceId: id, status: "WAITING" },
        orderBy: { createdAt: "asc" },
        select: { id: true, displayNo: true, serviceId: true, status: true },
      });

      return { served, current: called, next: preview };
    });

    // ส่งอีเวนต์เป็นลำดับ: แจ้งว่าเสิร์ฟเสร็จ แล้วค่อย NEXT ใบใหม่
    emitService(id, { type: "SERVED", served, next });
    if (current) {
      emitService(id, { type: "NEXT", current, next });
    }

    return NextResponse.json({ served, current, next });
  } catch (e) {
    // Prisma not-found during update
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Service or ticket not found" }, { status: 404 });
    }
    // Explicit no-current-ticket case thrown above
    if (e instanceof Error && e.message === "No current ticket") {
      return NextResponse.json({ error: "No current ticket" }, { status: 409 });
    }
    console.error("serve-and-next error", e);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}