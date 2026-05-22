import { NextResponse } from "next/server";
import { getAccountIdentifierFromRequest } from "@/lib/accounts";
import { addBook, deleteBook, markBookFinished, markBookReading } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; author?: string };
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    return NextResponse.json(
      await addBook({
        accountIdentifier,
        title: body.title ?? "",
        author: body.author ?? "",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add book.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { bookId?: string; status?: string; finishedAt?: string };
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    if (body.status !== "finished" && body.status !== "reading") {
      return NextResponse.json({ error: "Unsupported book update." }, { status: 400 });
    }

    if (body.status === "reading") {
      return NextResponse.json(
        await markBookReading({
          accountIdentifier,
          bookId: body.bookId ?? "",
        }),
      );
    }

    return NextResponse.json(
      await markBookFinished({
        accountIdentifier,
        bookId: body.bookId ?? "",
        finishedAt: body.finishedAt ?? new Date().toISOString(),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update book.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { bookId?: string };
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    return NextResponse.json(
      await deleteBook({
        accountIdentifier,
        bookId: body.bookId ?? "",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete book.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
