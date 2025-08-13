// src/app/api/services-list/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  // ดึง service ทั้งหมด + นับคิวที่กำลังรอของแต่ละ service (WAITING)
  const services = await prisma.service.findMany({
    orderBy: { id: "asc" },
    select: { id: true, code: true, name: true, isOpen: true },
  });

  // นับ WAITING ต่อ service แบบรวดเร็ว
  const waitingCounts = await prisma.ticket.groupBy({
    by: ["serviceId"],
    where: { status: "WAITING" },
    _count: { _all: true },
  });

  const waitingMap = new Map(
    waitingCounts.map((w) => [w.serviceId, w._count._all])
  );

  return NextResponse.json(
    services.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      isOpen: s.isOpen,
      waiting: waitingMap.get(s.id) ?? 0,
    }))
  );
}
