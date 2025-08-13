// src/app/api/service/[serviceId]/state/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ serviceId: string }> }
) {
  const { serviceId } = await ctx.params;
  const id = Number(serviceId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid serviceId" }, { status: 400 });
  }

  // ดึงข้อมูล service + current ticket
  const service = await prisma.service.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      isOpen: true,
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

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // คิวถัดไป (ตัวแรกที่ WAITING)
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

  // จำนวนที่ยังรอ (WAITING)
  const waiting = await prisma.ticket.count({
    where: { serviceId: id, status: "WAITING" },
  });

  return NextResponse.json(
    {
      service: {
        id: service.id,
        code: service.code,
        name: service.name,
        isOpen: service.isOpen,
      },
      current: service.currentTicket ?? null,
      next: next ?? null,
      waiting,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}