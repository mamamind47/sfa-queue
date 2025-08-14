import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-guard";
import { emitService } from "@/lib/events";
import type { Prisma } from "@prisma/client";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ ticketId: string }> }
) {
  // Auth (รองรับ PIN header และ cookie session)
  const gate = await requireAuth(req);
  if (!gate.ok) {
    return NextResponse.json(gate.body, { status: gate.status });
  }

  const { ticketId } = await ctx.params;
  const id = Number(ticketId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid ticketId" }, { status: 400 });
  }

  // ดึงตั๋วมาก่อน
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, serviceId: true, status: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // อนุญาตให้ยกเลิกเฉพาะ WAITING / CALLED
  if (ticket.status !== "WAITING" && ticket.status !== "CALLED") {
    return NextResponse.json(
      { error: `Cannot cancel ticket in status ${ticket.status}` },
      { status: 400 }
    );
  }

  // ถ้าเป็นใบ current (CALLED) ให้เคลียร์ current ออกจาก service ด้วย
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // อัปเดตสถานะเป็น CANCELED
    const canceled = await tx.ticket.update({
      where: { id: ticket.id },
      data: { status: "CANCELED" }, // ถ้ามีคอลัมน์ canceledAt สามารถเพิ่มได้ภายหลัง
      select: {
        id: true,
        displayNo: true,
        name: true,
        serviceId: true,
        status: true,
      },
    });

    // ถ้ากำลังถูกเรียกอยู่ และเป็น current ของ service นั้น ให้เคลียร์ current
    if (ticket.status === "CALLED") {
      const svc = await tx.service.findUnique({
        where: { id: ticket.serviceId },
        select: { id: true, currentTicketId: true },
      });

      if (svc?.currentTicketId === ticket.id) {
        await tx.service.update({
          where: { id: ticket.serviceId },
          data: { currentTicketId: null },
        });
      }

      // แจ้งจอ/สตาฟผ่าน SSE ให้เคลียร์ current ออก
      // ใช้ event แบบเดียวกับที่เราใช้ตอน skip (เพื่อให้ Display เคลียร์เลขปัจจุบันได้)
      emitService(ticket.serviceId, { type: "SKIP", current: canceled });
    } else {
      // ถ้ายกเลิกใบที่อยู่ใน WAITING: ยังไม่จำเป็นต้อง emit อะไร
      // (Display แสดง current/next เท่านั้นอยู่แล้ว)
    }

    return canceled;
  });

  return NextResponse.json({ canceled: result });
}
