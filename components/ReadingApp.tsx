"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveSessionView, BookView, DashboardView, OfflineEvent } from "@/lib/types";

type LocalActive = {
  bookId: string;
  startedAt: string;
  eventId: string;
};

const EVENT_QUEUE_KEY = "booktime.offlineEvents";
const ACTIVE_KEY = "booktime.activeSession";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function makeEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function secondsBetween(start: string | number, end: number): number {
  const startMs = typeof start === "string" ? new Date(start).getTime() : start;
  return Math.max(0, Math.floor((end - startMs) / 1000));
}

function formatShortTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatTimer(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, "0")).join(":");
}

function playIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" aria-hidden="true">
      <path
        d="M1.5 1.5L9.5 6L1.5 10.5V1.5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function pauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="3" height="8" rx="1" fill="currentColor" />
      <rect x="7" y="2" width="3" height="8" rx="1" fill="currentColor" />
    </svg>
  );
}

function stopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}

function bookIcon() {
  return (
    <svg className="player-cover-icon" width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="4" y="3" width="10" height="16" rx="2" stroke="rgba(255,248,242,0.7)" strokeWidth="1.5" />
      <path d="M7 7h4M7 10h6M7 13h3" stroke="rgba(255,248,242,0.5)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function plusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

async function postJson(url: string, body: unknown): Promise<DashboardView> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as DashboardView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Request failed.");
  }

  return payload as DashboardView;
}

async function fetchDashboard(): Promise<DashboardView> {
  const response = await fetch("/api/dashboard", { cache: "no-store" });
  const payload = (await response.json()) as DashboardView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Dashboard request failed.");
  }

  return payload as DashboardView;
}

export default function ReadingApp({ initialDashboard }: { initialDashboard: DashboardView }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [localActive, setLocalActive] = useState<LocalActive | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const flushInProgress = useRef(false);

  const appendEvent = useCallback((event: OfflineEvent) => {
    const queue = readJson<OfflineEvent[]>(EVENT_QUEUE_KEY, []);
    writeJson(EVENT_QUEUE_KEY, [...queue, event]);
  }, []);

  const removeEvent = useCallback((eventId: string) => {
    const queue = readJson<OfflineEvent[]>(EVENT_QUEUE_KEY, []);
    writeJson(
      EVENT_QUEUE_KEY,
      queue.filter((event) => event.eventId !== eventId),
    );
  }, []);

  const applyDashboard = useCallback((nextDashboard: DashboardView) => {
    setDashboard(nextDashboard);
  }, []);

  const flushQueue = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    if (flushInProgress.current) {
      return;
    }

    flushInProgress.current = true;

    try {
      let queue = readJson<OfflineEvent[]>(EVENT_QUEUE_KEY, []);

      while (queue.length > 0) {
        const event = queue[0];
        const nextDashboard =
          event.type === "start"
            ? await postJson("/api/reading/start", {
                bookId: event.bookId,
                startedAt: event.occurredAt,
                eventId: event.eventId,
              })
            : await postJson("/api/reading/stop", {
                bookId: event.bookId,
                stoppedAt: event.occurredAt,
                eventId: event.eventId,
              });

        removeEvent(event.eventId);
        queue = readJson<OfflineEvent[]>(EVENT_QUEUE_KEY, []);

        const active = readJson<LocalActive | null>(ACTIVE_KEY, null);
        if (active?.eventId === event.eventId) {
          window.localStorage.removeItem(ACTIVE_KEY);
          setLocalActive(null);
        }

        applyDashboard(nextDashboard);
      }

      applyDashboard(await fetchDashboard());
    } catch {
      // Events stay queued in localStorage and will retry on the next online event.
    } finally {
      flushInProgress.current = false;
    }
  }, [applyDashboard, removeEvent]);

  useEffect(() => {
    setLocalActive(readJson<LocalActive | null>(ACTIVE_KEY, null));

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const handleOnline = () => {
      void flushQueue();
    };

    window.addEventListener("online", handleOnline);
    void flushQueue();

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
    };
  }, [flushQueue]);

  const activeSession: ActiveSessionView | LocalActive | null = localActive ?? dashboard.activeSession;

  const bookBaseSeconds = useCallback(
    (book: BookView): number => {
      const serverActiveSession = dashboard.activeSession;

      if (serverActiveSession?.bookId !== book.id) {
        return book.totalSeconds;
      }

      return Math.max(
        0,
        book.totalSeconds - secondsBetween(serverActiveSession.startedAt, new Date(dashboard.serverNow).getTime()),
      );
    },
    [dashboard.activeSession, dashboard.serverNow],
  );

  const displayedWeekSeconds = useMemo(() => {
    if (!activeSession) {
      return dashboard.totalThisWeekSeconds;
    }

    const serverActiveSession = dashboard.activeSession;
    const isSameServerSession =
      serverActiveSession?.bookId === activeSession.bookId &&
      serverActiveSession.startedAt === activeSession.startedAt;

    if (isSameServerSession) {
      return dashboard.totalThisWeekSeconds + secondsBetween(dashboard.serverNow, now);
    }

    return dashboard.totalThisWeekSeconds + secondsBetween(activeSession.startedAt, now);
  }, [activeSession, dashboard.activeSession, dashboard.serverNow, dashboard.totalThisWeekSeconds, now]);

  const books = useMemo(() => {
    return dashboard.books.map((book) => {
      if (activeSession?.bookId !== book.id) {
        return {
          ...book,
          displaySeconds: book.totalSeconds,
          isActive: false,
        };
      }

      return {
        ...book,
        displaySeconds: bookBaseSeconds(book) + secondsBetween(activeSession.startedAt, now),
        isActive: true,
      };
    });
  }, [activeSession, bookBaseSeconds, dashboard.books, now]);

  const activeBook = books.find((book) => activeSession?.bookId === book.id) ?? null;
  const activeTimerSeconds = activeSession ? secondsBetween(activeSession.startedAt, now) : 0;

  function optimisticallyStopCurrent(stoppedAt: string) {
    const current = activeSession;
    if (!current) {
      return;
    }

    const stoppedAtMs = new Date(stoppedAt).getTime();
    const duration = secondsBetween(current.startedAt, stoppedAtMs);

    setDashboard((currentDashboard) => ({
      ...currentDashboard,
      activeSession: null,
      books: currentDashboard.books.map((book) =>
        book.id === current.bookId
          ? {
              ...book,
              totalSeconds: bookBaseSeconds(book) + duration,
              sessionsCount: book.sessionsCount + 1,
              isActive: false,
            }
          : book,
      ),
    }));
  }

  function startBook(bookId: string) {
    if (activeSession?.bookId === bookId) {
      stopBook();
      return;
    }

    const occurredAt = new Date().toISOString();

    if (activeSession) {
      const stopEvent: OfflineEvent = {
        eventId: makeEventId(),
        type: "stop",
        bookId: activeSession.bookId,
        occurredAt,
      };
      appendEvent(stopEvent);
      optimisticallyStopCurrent(occurredAt);
    }

    const event: OfflineEvent = {
      eventId: makeEventId(),
      type: "start",
      bookId,
      occurredAt,
    };
    const nextActive: LocalActive = {
      bookId,
      startedAt: occurredAt,
      eventId: event.eventId,
    };

    appendEvent(event);
    writeJson(ACTIVE_KEY, nextActive);
    setLocalActive(nextActive);
    void flushQueue();
  }

  function stopBook() {
    if (!activeSession) {
      return;
    }

    const occurredAt = new Date().toISOString();
    appendEvent({
      eventId: makeEventId(),
      type: "stop",
      bookId: activeSession.bookId,
      occurredAt,
    });
    window.localStorage.removeItem(ACTIVE_KEY);
    setLocalActive(null);
    optimisticallyStopCurrent(occurredAt);
    void flushQueue();
  }

  async function addBookFromPrompt() {
    const title = window.prompt("Book title");
    if (!title) {
      return;
    }

    const author = window.prompt("Author");
    if (!author) {
      return;
    }

    try {
      applyDashboard(await postJson("/api/books", { title, author }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to add book.");
    }
  }

  const readingBooks = books.filter((book) => book.status === "reading");
  const finishedBooks = books.filter((book) => book.status === "finished");

  return (
    <>
      <header className="header">
        <div className="logo">
          <div className="logo-mark" />
          <span className="logo-text">BookTime</span>
        </div>
        <button className="btn-add" type="button" onClick={addBookFromPrompt}>
          {plusIcon()}
          Add book
        </button>
      </header>

      <section className="stats-row" aria-label="Reading summary">
        <div className="stat-item stat-time">
          <span className="stat-kicker">Total this week</span>
          <span className="stat-value">{formatShortTime(displayedWeekSeconds)}</span>
          <span className="stat-label">reading time</span>
        </div>
        <div className="stat-item stat-books">
          <span className="stat-kicker">Books in progress</span>
          <span className="stat-value">{dashboard.booksInProgress}</span>
          <span className="stat-label">active books</span>
        </div>
      </section>

      <p className="section-label">Currently reading</p>
      <div className="book-list">
        {readingBooks.map((book) => (
          <BookCard key={book.id} book={book} onStart={() => startBook(book.id)} />
        ))}
      </div>

      <div className="divider">
        <div className="divider-line" />
        <span className="divider-text">Finished</span>
        <div className="divider-line" />
      </div>

      <div className="book-list finished-list">
        {finishedBooks.map((book) => (
          <BookCard key={book.id} book={book} onStart={() => startBook(book.id)} reread />
        ))}
      </div>

      {activeBook ? (
        <div className="player-panel" role="status" aria-label="Reading session in progress">
          <div className="player-cover" aria-hidden="true">
            {bookIcon()}
          </div>

          <div className="player-body">
            <div className="player-book-title">{activeBook.title}</div>
            <div className="player-timer-row">
              <div className="player-timer">{formatTimer(activeTimerSeconds)}</div>
            </div>
            <div className="player-progress">
              <div className="player-progress-fill" />
            </div>
          </div>

          <div className="player-controls">
            <button className="btn-stop" type="button" onClick={stopBook}>
              {stopIcon()}
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BookCard({
  book,
  onStart,
  reread = false,
}: {
  book: BookView & { displaySeconds: number };
  onStart: () => void;
  reread?: boolean;
}) {
  return (
    <div className={`book-card${book.isActive ? " active-card" : ""}${book.status === "finished" ? " finished-card" : ""}`}>
      <div className={`book-cover ${book.coverClass}`}>
        <div className="cover-line" />
        <div className="cover-line" />
      </div>
      <div className="book-info">
        <div className="book-title">{book.title}</div>
        <div className="book-author">{book.author}</div>
        {book.isActive ? (
          <div className="active-badge">
            <span className="pulse-dot" />
            Reading now
          </div>
        ) : (
          <div className="book-sessions">
            {book.status === "finished" ? "Finished · " : ""}
            {book.sessionsCount} sessions
          </div>
        )}
      </div>
      <div className="book-time-wrap">
        <div className="book-time">{formatShortTime(book.displaySeconds)}</div>
        <div className="book-time-label">total time</div>
        <div className="progress-wrap">
          <div className="progress-bar" style={{ width: `${book.progress}%` }} />
        </div>
      </div>
      <button className={`btn-start${book.isActive ? " reading" : ""}${reread ? " reread" : ""}`} type="button" onClick={onStart}>
        {book.isActive ? pauseIcon() : playIcon()}
        {book.isActive ? "Reading" : reread ? "Re-read" : "Start"}
      </button>
    </div>
  );
}
