// src/lib/format.ts
export function pad3(n: number) {
  return n.toString().padStart(3, "0");
}
export function displayNo(code: string, number: number) {
  return `${code}${pad3(number)}`;
}

// ขอบเขตเวลา "วันนี้" ตามเวลาท้องถิ่น (Asia/Bangkok)
export function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}