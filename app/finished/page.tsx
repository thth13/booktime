"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FinishedBookView, FinishedBooksView } from "@/lib/types";

type AuthState =
  | { status: "checking" }
  | { status: "signedOut" }
  | { status: "signedIn"; identifier: string };

type FinishedBookGroup = {
  key: string;
  label: string;
  books: FinishedBookView[];
};

const ACCOUNT_KEY = "booktime.accountIdentifier";

function normalizeAccountIdentifier(identifier: string): string {
  return identifier.trim().toUpperCase().replace(/\s+/g, "");
}

function logoMark() {
  return (
    <svg className="logo-mark" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M6.8 10.05c0-.62.45-1.16 1.06-1.27 2.84-.54 5.56.03 8.14 1.71 2.58-1.68 5.3-2.25 8.14-1.71.61.11 1.06.65 1.06 1.27v13.28c0 .75-.67 1.32-1.41 1.18-2.43-.46-4.73.04-6.9 1.5-.54.36-1.24.36-1.78 0-2.17-1.46-4.47-1.96-6.9-1.5-.74.14-1.41-.43-1.41-1.18V10.05Z"
        fill="rgba(255,255,255,0.18)"
      />
      <path
        d="M8.95 9.95c2.3-.3 4.33.19 6.08 1.47.36.27.57.7.57 1.14v11.07c-1.96-1.39-4.18-1.94-6.65-1.65V9.95Z"
        fill="rgba(255,248,242,0.92)"
      />
      <path
        d="M23.05 9.95c-2.3-.3-4.33.19-6.08 1.47-.36.27-.57.7-.57 1.14v11.07c1.96-1.39 4.18-1.94 6.65-1.65V9.95Z"
        fill="rgba(255,248,242,0.84)"
      />
      <path d="M16 11.65v11.9" stroke="rgba(44,31,15,0.18)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.2 13.25h2.15M11.2 15.75h2.85M11.2 18.25h2.45" stroke="rgba(44,31,15,0.28)" strokeWidth="1.15" strokeLinecap="round" />
      <path
        d="M19.35 10.1v5.9l1.32-1.02L22 16v-5.78a8.4 8.4 0 0 0-2.65-.12Z"
        fill="rgba(160,98,42,0.72)"
      />
      <circle cx="20.68" cy="18.72" r="2.18" fill="rgba(255,248,242,0.96)" />
      <path d="M20.68 17.55v1.28l.88.58" stroke="rgba(160,98,42,0.9)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function editIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M3 10.8l-.4 1.7 1.7-.4 6.9-6.9-1.3-1.3L3 10.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M9.1 2.9l1-1c.4-.4 1-.4 1.4 0l.6.6c.4.4.4 1 0 1.4l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function trashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M3 4h9M6 4V2.8h3V4M5 6v5M10 6v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 4l.6 8.2c.1.7.6 1.1 1.3 1.1h3.2c.7 0 1.2-.4 1.3-1.1L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function formatShortTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
}

function formatMonthTitle(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function toDateInputValue(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInputToIso(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

function groupFinishedBooks(books: FinishedBookView[]): FinishedBookGroup[] {
  const groups = new Map<string, FinishedBookGroup>();

  for (const book of books) {
    const finishedAt = new Date(book.finishedAt);
    const key = monthKey(finishedAt);
    const group = groups.get(key);

    if (group) {
      group.books.push(book);
    } else {
      groups.set(key, {
        key,
        label: formatMonthTitle(finishedAt),
        books: [book],
      });
    }
  }

  return Array.from(groups.values()).sort((first, second) => second.key.localeCompare(first.key));
}

async function fetchFinishedBooks(accountIdentifier: string, signal: AbortSignal): Promise<FinishedBooksView> {
  const response = await fetch("/api/finished-books", {
    cache: "no-store",
    headers: { "x-booktime-account": accountIdentifier },
    signal,
  });
  const payload = (await response.json()) as FinishedBooksView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Finished books request failed.");
  }

  return payload as FinishedBooksView;
}

async function mutateFinishedBook(
  accountIdentifier: string,
  method: "PATCH" | "DELETE",
  body: unknown,
): Promise<FinishedBooksView> {
  const response = await fetch("/api/finished-books", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-booktime-account": accountIdentifier,
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as FinishedBooksView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Finished books request failed.");
  }

  return payload as FinishedBooksView;
}

export default function FinishedBooksPage() {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [books, setBooks] = useState<FinishedBookView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openActionBookId, setOpenActionBookId] = useState<string | null>(null);
  const [editingBook, setEditingBook] = useState<FinishedBookView | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAuthor, setEditAuthor] = useState("");
  const [editFinishedAt, setEditFinishedAt] = useState("");
  const [pendingDeleteBook, setPendingDeleteBook] = useState<FinishedBookView | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const accountIdentifier = auth.status === "signedIn" ? auth.identifier : null;
  const groups = useMemo(() => groupFinishedBooks(books), [books]);

  useEffect(() => {
    const savedIdentifier = normalizeAccountIdentifier(window.localStorage.getItem(ACCOUNT_KEY) ?? "");
    setAuth(savedIdentifier ? { status: "signedIn", identifier: savedIdentifier } : { status: "signedOut" });
  }, []);

  useEffect(() => {
    if (!accountIdentifier) {
      setBooks([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetchFinishedBooks(accountIdentifier, controller.signal)
      .then((payload) => setBooks(payload.books))
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setBooks([]);
        setError(loadError instanceof Error ? loadError.message : "Failed to load finished books.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [accountIdentifier]);

  function openEditBook(book: FinishedBookView) {
    setEditingBook(book);
    setEditTitle(book.title);
    setEditAuthor(book.author);
    setEditFinishedAt(toDateInputValue(book.finishedAt));
    setActionError(null);
    setOpenActionBookId(null);
  }

  async function submitEditBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accountIdentifier || !editingBook) {
      return;
    }

    const title = editTitle.trim();
    const author = editAuthor.trim();

    if (!title || !author || !editFinishedAt) {
      setActionError("Title, author, and finish date are required.");
      return;
    }

    setActionBusy(true);
    setActionError(null);

    try {
      const payload = await mutateFinishedBook(accountIdentifier, "PATCH", {
        bookId: editingBook.id,
        title,
        author,
        finishedAt: dateInputToIso(editFinishedAt),
      });
      setBooks(payload.books);
      setEditingBook(null);
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Failed to update finished book.");
    } finally {
      setActionBusy(false);
    }
  }

  async function confirmDeleteBook() {
    if (!accountIdentifier || !pendingDeleteBook) {
      return;
    }

    setActionBusy(true);
    setActionError(null);

    try {
      const payload = await mutateFinishedBook(accountIdentifier, "DELETE", { bookId: pendingDeleteBook.id });
      setBooks(payload.books);
      setPendingDeleteBook(null);
      setOpenActionBookId(null);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Failed to delete finished book.");
    } finally {
      setActionBusy(false);
    }
  }

  if (auth.status === "checking") {
    return (
      <main className="app-loading" aria-label="Loading finished books" aria-busy="true">
        <div className="app-loading-brand">
          {logoMark()}
          <span className="logo-text">BookTime</span>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="header">
        <Link className="logo" href="/" aria-label="Open library">
          {logoMark()}
          <span className="logo-text">BookTime</span>
        </Link>
        <div className="header-actions">
          <Link className="header-link" href="/statistics">
            Statistics
          </Link>
          <Link className="header-link" href="/">
            Library
          </Link>
        </div>
      </header>

      {editingBook ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!actionBusy) {
              setEditingBook(null);
              setActionError(null);
            }
          }}
        >
          <section
            className="edit-finished-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-finished-title"
            onClick={(event) => event.stopPropagation()}
          >
            <form className="add-book-form" onSubmit={submitEditBook}>
              <h2 id="edit-finished-title" className="modal-title">
                Edit book
              </h2>
              <div className="add-book-field">
                <label className="auth-label" htmlFor="finished-book-title">
                  Title
                </label>
                <input
                  id="finished-book-title"
                  className="auth-input"
                  type="text"
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  disabled={actionBusy}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <div className="add-book-field">
                <label className="auth-label" htmlFor="finished-book-author">
                  Author
                </label>
                <input
                  id="finished-book-author"
                  className="auth-input"
                  type="text"
                  value={editAuthor}
                  onChange={(event) => setEditAuthor(event.target.value)}
                  disabled={actionBusy}
                  autoComplete="off"
                />
              </div>
              <div className="add-book-field">
                <label className="auth-label" htmlFor="finished-book-date">
                  Finished date
                </label>
                <input
                  id="finished-book-date"
                  className="auth-input"
                  type="date"
                  value={editFinishedAt}
                  onChange={(event) => setEditFinishedAt(event.target.value)}
                  disabled={actionBusy}
                />
              </div>
              <div className="add-book-actions">
                <button className="btn-primary" type="submit" disabled={actionBusy}>
                  Save
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setEditingBook(null);
                    setActionError(null);
                  }}
                  disabled={actionBusy}
                >
                  Cancel
                </button>
              </div>
              {actionError ? <p className="add-book-error">{actionError}</p> : null}
            </form>
          </section>
        </div>
      ) : null}

      {pendingDeleteBook ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!actionBusy) {
              setPendingDeleteBook(null);
              setActionError(null);
            }
          }}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-finished-book-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-finished-book-title">Delete book?</h2>
            <p>
              This will remove <span>{pendingDeleteBook.title}</span> and its reading sessions.
            </p>
            {actionError ? <p className="book-action-error">{actionError}</p> : null}
            <div className="confirm-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setPendingDeleteBook(null);
                  setActionError(null);
                }}
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button className="btn-danger" type="button" onClick={confirmDeleteBook} disabled={actionBusy}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <main className="finished-page" aria-label="Finished books">
        {auth.status === "signedOut" || !accountIdentifier ? (
          <section className="statistics-empty">
            <h1>Finished books</h1>
            <p>Sign in on the library page to see books grouped by the month you finished them.</p>
            <Link className="btn-primary statistics-empty-link" href="/">
              Open library
            </Link>
          </section>
        ) : error ? (
          <p className="book-action-error">{error}</p>
        ) : groups.length > 0 ? (
          <div className={`finished-groups${loading ? " loading" : ""}`} aria-busy={loading}>
            {groups.map((group) => (
              <section className="finished-month" key={group.key}>
                <h1>{group.label}</h1>
                <div className="finished-book-list">
                  {group.books.map((book) => (
                    <FinishedBookRow
                      key={book.id}
                      book={book}
                      isActionsOpen={openActionBookId === book.id}
                      onActionsOpen={() => setOpenActionBookId(book.id)}
                      onActionsClose={() => setOpenActionBookId(null)}
                      onEdit={() => openEditBook(book)}
                      onDeleteRequest={() => {
                        setPendingDeleteBook(book);
                        setActionError(null);
                      }}
                      actionsDisabled={actionBusy}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="statistics-empty">
            <h1>Finished books</h1>
            <p>Books you mark as read will appear here grouped by month and year.</p>
          </section>
        )}
      </main>
    </>
  );
}

function FinishedBookRow({
  book,
  isActionsOpen,
  onActionsOpen,
  onActionsClose,
  onEdit,
  onDeleteRequest,
  actionsDisabled,
}: {
  book: FinishedBookView;
  isActionsOpen: boolean;
  onActionsOpen: () => void;
  onActionsClose: () => void;
  onEdit: () => void;
  onDeleteRequest: () => void;
  actionsDisabled: boolean;
}) {
  const actionWidth = 184;
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const gesture = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const offset = dragOffset ?? (isActionsOpen ? -actionWidth : 0);
  const areActionsVisible = isActionsOpen || dragOffset !== null;

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (actionsDisabled) {
      return;
    }

    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current) {
      return;
    }

    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;

    if (!current.dragging && Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) {
      return;
    }

    if (!current.dragging && Math.abs(deltaY) > Math.abs(deltaX)) {
      gesture.current = null;
      setDragOffset(null);
      return;
    }

    current.dragging = true;
    const baseOffset = isActionsOpen ? -actionWidth : 0;
    const nextOffset = Math.min(0, Math.max(-actionWidth, baseOffset + deltaX));
    setDragOffset(nextOffset);
  }

  function handlePointerEnd() {
    const shouldOpen = offset < -actionWidth / 2;
    gesture.current = null;
    setDragOffset(null);

    if (shouldOpen) {
      onActionsOpen();
    } else {
      onActionsClose();
    }
  }

  const swipeStyle = { "--swipe-offset": `${offset}px` } as CSSProperties;

  return (
    <div className="book-row" style={{ "--action-width": `${actionWidth}px` } as CSSProperties}>
      <div className={`book-actions${areActionsVisible ? " visible" : ""}`} aria-hidden={!areActionsVisible}>
        <button
          className="book-action-btn action-edit"
          type="button"
          onClick={onEdit}
          disabled={actionsDisabled}
          tabIndex={isActionsOpen ? 0 : -1}
        >
          {editIcon()}
          Edit
        </button>
        <button
          className="book-action-btn action-delete"
          type="button"
          onClick={onDeleteRequest}
          disabled={actionsDisabled}
          tabIndex={isActionsOpen ? 0 : -1}
        >
          {trashIcon()}
          Delete
        </button>
      </div>

      <article
        className="finished-book-row swipe-card"
        style={swipeStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className={`book-cover ${book.coverClass}`} aria-hidden="true">
          <div className="cover-line" />
          <div className="cover-line" />
        </div>
        <div className="finished-book-info">
          <h2>{book.title}</h2>
          <p>{book.author}</p>
        </div>
        <div className="finished-book-meta">
          <span>{formatShortTime(book.totalSeconds)}</span>
          <span>{book.sessionsCount} sessions</span>
        </div>
      </article>
    </div>
  );
}
