// src/app/api/tts/route.ts
import { NextResponse } from "next/server";
import textToSpeech from "@google-cloud/text-to-speech";

type GoogleServiceAccountCredentials = {
  type: "service_account";
  project_id: string;
  private_key: string;
  client_email: string;
} & Record<string, unknown>;

export const dynamic = "force-dynamic"; // กัน cache/edge ที่อาจค้าง

function preprocessTextForDigitByDigit(text: string): string {
  const thaiDigits = ["๐","๑","๒","๓","๔","๕","๖","๗","๘","๙"] as const;
  return text.replace(/\d+/g, (match) => match.split("").map((d) => thaiDigits[Number(d)]).join(" "));
}

function parseDigitFlag(input: string | null): boolean {
  if (input == null) return true; // default: enable
  const v = input.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

function loadGcpCredentials(): GoogleServiceAccountCredentials | undefined {
  const raw = process.env.GOOGLE_TTS_CREDENTIALS;
  if (raw) {
    try {
      // รองรับทั้ง JSON และ Base64 ของ JSON
      const str = raw.trim().startsWith("{")
        ? raw
        : Buffer.from(raw, "base64").toString("utf-8");
      return JSON.parse(str);
    } catch {
      // ถ้า parse ไม่ได้ จะไปพยายามวิธีไฟล์ด้านล่างต่อ
    }
  }
  return undefined;
}

function makeClient() {
  const creds = loadGcpCredentials();
  if (creds) {
    return new textToSpeech.TextToSpeechClient({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
    });
  }
  // ถ้าไม่ใส่ GOOGLE_TTS_CREDENTIALS จะให้ lib ใช้ GOOGLE_APPLICATION_CREDENTIALS (path) ตามค่า env ปกติ
  return new textToSpeech.TextToSpeechClient();
}

type TtsBody = {
  text?: string;
  voice?: string; // ตัวอย่าง: "th-TH-Neural2-A", "th-TH-Standard-A"
  speakingRate?: number; // 0.25..4.0 (1=ปกติ)
  pitch?: number; // -20..20 (semitones)
  digitByDigit?: boolean; // default: true (อ่านเลขทีละหลัก)
};

async function synthesizeSSML(
  text: string,
  voiceName?: string,
  speakingRate?: number,
  pitch?: number,
  digitByDigit: boolean = true
) {
  const client = makeClient();

  const processedText = digitByDigit ? preprocessTextForDigitByDigit(text) : text;

  // พยายามใช้ Neural ถ้าไม่เวิร์กให้ fallback เป็น Standard
  const voicesToTry = [voiceName || "th-TH-Neural2-A", "th-TH-Standard-A"];

  let audioContent: Uint8Array | null = null;
  let usedVoice = "";
  let lastError: unknown = null;

  for (const v of voicesToTry) {
    try {
      const [resp] = await client.synthesizeSpeech({
        input: { text: processedText },
        voice: {
          languageCode: "th-TH",
          name: v,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: speakingRate ?? 1.0,
          pitch: pitch ?? 0,
          // sampleRateHertz: 24000, // optional
        },
      });
      if (resp.audioContent) {
        audioContent = resp.audioContent as Uint8Array;
        usedVoice = v;
        break;
      }
    } catch (err) {
      lastError = err;
      // ลองตัวถัดไป
    }
  }

  if (!audioContent) {
    // โยน error ตัวสุดท้ายที่เจอ
    throw lastError || new Error("TTS failed");
  }

  return { audioContent, usedVoice };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const voice = searchParams.get("voice") || undefined;
  const rateParam = searchParams.get("rate");
  const pitchParam = searchParams.get("pitch");

  if (!q) {
    return NextResponse.json(
      { error: "Missing query param ?q=" },
      { status: 400 }
    );
  }

  const digitFlag = parseDigitFlag(searchParams.get("digit"));

  try {
    const { audioContent, usedVoice } = await synthesizeSSML(
      q,
      voice,
      rateParam ? Number(rateParam) : undefined,
      pitchParam ? Number(pitchParam) : undefined,
      digitFlag
    );

    return new NextResponse(Buffer.from(audioContent), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Voice-Used": usedVoice,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "TTS error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  let body: TtsBody = {};
  try {
    body = (await req.json()) as TtsBody;
  } catch {
    // ignore
  }
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "Missing 'text' in body" },
      { status: 400 }
    );
  }

  const digitByDigit = body.digitByDigit !== undefined ? Boolean(body.digitByDigit) : true;

  try {
    const { audioContent, usedVoice } = await synthesizeSSML(
      text,
      body.voice,
      body.speakingRate,
      body.pitch,
      digitByDigit
    );

    return new NextResponse(Buffer.from(audioContent), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Voice-Used": usedVoice,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "TTS error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}