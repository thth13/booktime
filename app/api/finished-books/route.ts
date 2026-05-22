import { NextResponse } from "next/server";
import { getAccountIdentifierFromRequest } from "@/lib/accounts";
import { deleteFinishedBook, getFinishedBooks, updateFinishedBook } from "@/lib/reading-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    return NextResponse.json(await getFinishedBooks(accountIdentifier));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load finished books.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      bookId?: string;
      title?: string;
      author?: string;
      finishedAt?: string;
    };
    const accountIdentifier = getAccountIdentifierFromRequest(request);

    if (!accountIdentifier) {
      return NextResponse.json({ error: "Account identifier is required." }, { status: 401 });
    }

    return NextResponse.json(
      await updateFinishedBook({
        accountIdentifier,
        bookId: body.bookId ?? "",
        title: body.title ?? "",
        author: body.author ?? "",
        finishedAt: body.finishedAt ?? "",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update finished book.";
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
      await deleteFinishedBook({
        accountIdentifier,
        bookId: body.bookId ?? "",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete finished book.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
