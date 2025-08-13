// src/lib/university.ts

type UniversityApiResponse = {
  code?: string | number;
  message?: string;
  success?: boolean;
  data?: {
    studentCode?: string;
    firstnameTh?: string;
    lastnameTh?: string;
    // other fields are ignored
  } | null;
};

function joinUrlWithId(base: string, id: string): string {
  const clean = (base || "").replace(/\/+$/, "");
  return `${clean}/${encodeURIComponent(id)}`;
}

/**
 * Fetch student profile from University API using:
 *   GET {UNIVERSITY_API_URL}/{studentId}
 * with header:
 *   authKey: {UNIVERSITY_API_KEY}
 */
export async function fetchStudentProfile(studentId: string): Promise<{ studentId: string; name: string }> {
  const base = process.env.UNIVERSITY_API_URL ?? "";
  const key = process.env.UNIVERSITY_API_KEY ?? "";

  if (!base) throw new Error("UNIVERSITY_API_URL is not set");
  if (!key) throw new Error("UNIVERSITY_API_KEY is not set");

  const url = joinUrlWithId(base, studentId);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      authKey: key,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = "";
    try {
      const text = await res.text();
      detail = text ? ` - ${text.slice(0, 300)}` : "";
    } catch {
      // ignore
    }
    throw new Error(`University API error ${res.status}${detail}`);
  }

  const payload: UniversityApiResponse = await res.json();
  const data = payload?.data;

  if (!data) {
    throw new Error("Student not found");
  }

  const first = (data.firstnameTh ?? "").trim();
  const last = (data.lastnameTh ?? "").trim();
  if (!first || !last) {
    throw new Error("Missing firstnameTh/lastnameTh from University API");
  }

  const combinedName = `${first} ${last}`;
  const code = data.studentCode ?? studentId;

  return { studentId: code, name: combinedName };
}