import { NextResponse } from "next/server";
import { stopReading } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      bookId?: string;
      stoppedAt?: string;
      eventId?: string;
    };

    if (!body.bookId || !body.stoppedAt || !body.eventId) {
      return NextResponse.json({ error: "bookId, stoppedAt and eventId are required." }, { status: 400 });
    }

    return NextResponse.json(
      await stopReading({
        bookId: body.bookId,
        stoppedAt: body.stoppedAt,
        eventId: body.eventId,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stop reading.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
