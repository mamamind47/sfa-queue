// src/app/api/tickets/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { displayNo, todayRange } from "@/lib/format";
import { fetchStudentProfile } from "@/lib/university";
import crypto from "node:crypto";
import { emitServiceState } from "@/lib/events";


type Body = {
  serviceCode: string;
  mode: "guest" | "student";
  studentId?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { serviceCode, mode, studentId } = body;

    if (!serviceCode) {
      return NextResponse.json(
        { error: "serviceCode required" },
        { status: 400 }
      );
    }
    if (mode !== "guest" && mode !== "student") {
      return NextResponse.json(
        { error: "mode must be 'guest' or 'student'" },
        { status: 400 }
      );
    }

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
    });
    if (!service)
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    if (!service.isOpen)
      return NextResponse.json({ error: "Service closed" }, { status: 403 });

    // นับคิววันนี้ เพื่อออกหมายเลขถัดไป
    const { start, end } = todayRange();
    const countToday = await prisma.ticket.count({
      where: { serviceId: service.id, createdAt: { gte: start, lte: end } },
    });
    const nextNumber = countToday + 1;

    // กรณี student mode → ไปดึงชื่อจากระบบมหาลัย
    let name: string | undefined;
    let stdId: string | undefined;
    if (mode === "student") {
      if (!studentId) {
        return NextResponse.json(
          { error: "studentId required for student mode" },
          { status: 400 }
        );
      }
      try {
        const profile = await fetchStudentProfile(studentId);
        name = profile.name;
        stdId = profile.studentId;
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: errorMessage ?? "University API error" },
          { status: 502 }
        );
      }
    }

    const token = crypto.randomUUID();
    const ticket = await prisma.ticket.create({
      data: {
        serviceId: service.id,
        number: nextNumber,
        displayNo: displayNo(service.code, nextNumber),
        token,
        name,
        studentId: stdId,
      },
      select: { id: true, token: true, displayNo: true },
    });

    await emitServiceState(service.id);

    // เก็บ token ฝั่ง client เอง (localStorage/cookie) ที่หน้า UI
    return NextResponse.json(ticket);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: errorMessage ?? "Unknown error" },
      { status: 500 }
    );
  }
}