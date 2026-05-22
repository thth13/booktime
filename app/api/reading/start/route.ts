import { NextResponse } from "next/server";
import { startReading } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      bookId?: string;
      startedAt?: string;
      eventId?: string;
    };

    if (!body.bookId || !body.startedAt || !body.eventId) {
      return NextResponse.json({ error: "bookId, startedAt and eventId are required." }, { status: 400 });
    }

    return NextResponse.json(
      await startReading({
        bookId: body.bookId,
        startedAt: body.startedAt,
        eventId: body.eventId,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start reading.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
