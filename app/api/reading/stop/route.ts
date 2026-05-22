import { NextResponse } from "next/server";
import { getAccountIdentifierFromRequest } from "@/lib/accounts";
import { stopReading } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      bookId?: string;
      stoppedAt?: string;
      eventId?: string;
    };
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!body.bookId || !body.stoppedAt || !body.eventId) {
      return NextResponse.json({ error: "bookId, stoppedAt and eventId are required." }, { status: 400 });
    }

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    return NextResponse.json(
      await stopReading({
        accountIdentifier,
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
