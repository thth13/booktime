"use client";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ActiveSessionView, BookView, DashboardView, OfflineEvent, ReadingSessionView } from "@/lib/types";

type LocalActive = {
  bookId: string;
  startedAt: string;
  eventId: string;
};

type AuthState =
  | { status: "checking" }
  | { status: "signedOut" }
  | { status: "signedIn"; identifier: string };

const ACCOUNT_KEY = "booktime.accountIdentifier";

function getEventQueueKey(accountIdentifier: string): string {
  return `booktime.offlineEvents.${accountIdentifier}`;
}

function getActiveKey(accountIdentifier: string): string {
  return `booktime.activeSession.${accountIdentifier}`;
}

function normalizeAccountIdentifier(identifier: string): string {
  return identifier.trim().toUpperCase().replace(/\s+/g, "");
}

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

function formatSessionDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

function checkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M3 7.6L6.1 10.5L12 4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

function returnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M5.2 4.2H10a3 3 0 0 1 0 6H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.2 1.9L2.9 4.2l2.3 2.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

async function postJson(url: string, body: unknown, accountIdentifier: string): Promise<DashboardView> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-booktime-account": accountIdentifier,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as DashboardView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Request failed.");
  }

  return payload as DashboardView;
}

async function mutateJson(
  url: string,
  method: "PATCH" | "DELETE",
  body: unknown,
  accountIdentifier: string,
): Promise<DashboardView> {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-booktime-account": accountIdentifier,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as DashboardView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Request failed.");
  }

  return payload as DashboardView;
}

async function fetchDashboard(accountIdentifier: string): Promise<DashboardView> {
  const response = await fetch("/api/dashboard", {
    cache: "no-store",
    headers: { "x-booktime-account": accountIdentifier },
  });
  const payload = (await response.json()) as DashboardView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Dashboard request failed.");
  }

  return payload as DashboardView;
}

async function fetchBookSessions(bookId: string, accountIdentifier: string): Promise<ReadingSessionView[]> {
  const response = await fetch(`/api/sessions?bookId=${encodeURIComponent(bookId)}`, {
    cache: "no-store",
    headers: { "x-booktime-account": accountIdentifier },
  });
  const payload = (await response.json()) as { sessions?: ReadingSessionView[]; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Sessions request failed.");
  }

  return payload.sessions ?? [];
}

async function createAccount(): Promise<{ identifier: string }> {
  const response = await fetch("/api/accounts", { method: "POST" });
  const payload = (await response.json()) as { identifier?: string; error?: string };

  if (!response.ok || !payload.identifier) {
    throw new Error(payload.error ?? "Failed to create account.");
  }

  return { identifier: payload.identifier };
}

export default function ReadingApp({ initialDashboard }: { initialDashboard: DashboardView | null }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [identifierInput, setIdentifierInput] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [localActive, setLocalActive] = useState<LocalActive | null>(null);
  const [isAddBookOpen, setIsAddBookOpen] = useState(false);
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookAuthor, setNewBookAuthor] = useState("");
  const [addBookError, setAddBookError] = useState<string | null>(null);
  const [addBookBusy, setAddBookBusy] = useState(false);
  const [openActionBookId, setOpenActionBookId] = useState<string | null>(null);
  const [pendingDeleteBook, setPendingDeleteBook] = useState<BookView | null>(null);
  const [bookActionError, setBookActionError] = useState<string | null>(null);
  const [bookActionBusy, setBookActionBusy] = useState(false);
  const [sessionBook, setSessionBook] = useState<BookView | null>(null);
  const [sessions, setSessions] = useState<ReadingSessionView[]>([]);
  const [sessionsBusy, setSessionsBusy] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const flushInProgress = useRef(false);
  const accountIdentifier = auth.status === "signedIn" ? auth.identifier : null;

  const loadAccount = useCallback(async (rawIdentifier: string) => {
    const identifier = normalizeAccountIdentifier(rawIdentifier);

    if (!identifier) {
      throw new Error("Enter your account identifier.");
    }

    setAuthBusy(true);

    try {
      const nextDashboard = await fetchDashboard(identifier);
      window.localStorage.setItem(ACCOUNT_KEY, identifier);
      setAuth({ status: "signedIn", identifier });
      setDashboard(nextDashboard);
      setLocalActive(readJson<LocalActive | null>(getActiveKey(identifier), null));
      setIdentifierInput(identifier);
      setAuthError(null);
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const appendEvent = useCallback(
    (event: OfflineEvent) => {
      if (!accountIdentifier) {
        return;
      }

      const key = getEventQueueKey(accountIdentifier);
      const queue = readJson<OfflineEvent[]>(key, []);
      writeJson(key, [...queue, event]);
    },
    [accountIdentifier],
  );

  const removeEvent = useCallback((accountIdentifier: string, eventId: string) => {
    const key = getEventQueueKey(accountIdentifier);
    const queue = readJson<OfflineEvent[]>(key, []);
    writeJson(
      key,
      queue.filter((event) => event.eventId !== eventId),
    );
  }, []);

  const applyDashboard = useCallback((nextDashboard: DashboardView) => {
    setDashboard(nextDashboard);
  }, []);

  const flushQueue = useCallback(async () => {
    if (!accountIdentifier) {
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    if (flushInProgress.current) {
      return;
    }

    flushInProgress.current = true;

    try {
      const queueKey = getEventQueueKey(accountIdentifier);
      const activeKey = getActiveKey(accountIdentifier);
      let queue = readJson<OfflineEvent[]>(queueKey, []);

      while (queue.length > 0) {
        const event = queue[0];
        const nextDashboard =
          event.type === "start"
            ? await postJson("/api/reading/start", {
                bookId: event.bookId,
                startedAt: event.occurredAt,
                eventId: event.eventId,
              }, accountIdentifier)
            : await postJson("/api/reading/stop", {
                bookId: event.bookId,
                stoppedAt: event.occurredAt,
                eventId: event.eventId,
              }, accountIdentifier);

        removeEvent(accountIdentifier, event.eventId);
        queue = readJson<OfflineEvent[]>(queueKey, []);

        const active = readJson<LocalActive | null>(activeKey, null);
        if (active?.eventId === event.eventId) {
          window.localStorage.removeItem(activeKey);
          setLocalActive(null);
        }

        applyDashboard(nextDashboard);
      }

      applyDashboard(await fetchDashboard(accountIdentifier));
    } catch {
      // Events stay queued in localStorage and will retry on the next online event.
    } finally {
      flushInProgress.current = false;
    }
  }, [accountIdentifier, applyDashboard, removeEvent]);

  useEffect(() => {
    const savedIdentifier = window.localStorage.getItem(ACCOUNT_KEY);

    if (!savedIdentifier) {
      setAuth({ status: "signedOut" });
      return;
    }

    void loadAccount(savedIdentifier).catch((error) => {
      window.localStorage.removeItem(ACCOUNT_KEY);
      setDashboard(null);
      setLocalActive(null);
      setAuth({ status: "signedOut" });
      setAuthError(error instanceof Error ? error.message : "Failed to sign in.");
    });
  }, [loadAccount]);

  useEffect(() => {
    if (!accountIdentifier) {
      return;
    }

    setLocalActive(readJson<LocalActive | null>(getActiveKey(accountIdentifier), null));

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
  }, [accountIdentifier, flushQueue]);

  async function registerAccount() {
    setAuthBusy(true);
    setAuthError(null);

    try {
      const account = await createAccount();
      await loadAccount(account.identifier);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to create account.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    try {
      await loadAccount(identifierInput);
    } catch (error) {
      setAuth({ status: "signedOut" });
      setDashboard(null);
      setLocalActive(null);
      setAuthError(error instanceof Error ? error.message : "Failed to sign in.");
    }
  }

  function copyIdentifier() {
    if (!accountIdentifier || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(accountIdentifier);
  }

  const activeSession: ActiveSessionView | LocalActive | null = dashboard
    ? localActive ?? dashboard.activeSession
    : null;

  const bookBaseSeconds = useCallback(
    (book: BookView): number => {
      if (!dashboard) {
        return book.totalSeconds;
      }

      const serverActiveSession = dashboard.activeSession;

      if (serverActiveSession?.bookId !== book.id) {
        return book.totalSeconds;
      }

      return Math.max(
        0,
        book.totalSeconds - secondsBetween(serverActiveSession.startedAt, new Date(dashboard.serverNow).getTime()),
      );
    },
    [dashboard],
  );

  const displayedWeekSeconds = useMemo(() => {
    if (!dashboard) {
      return 0;
    }

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
  }, [activeSession, dashboard, now]);

  const books = useMemo(() => {
    if (!dashboard) {
      return [];
    }

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
  }, [activeSession, bookBaseSeconds, dashboard, now]);

  const activeBook = books.find((book) => activeSession?.bookId === book.id) ?? null;
  const activeTimerSeconds = activeSession ? secondsBetween(activeSession.startedAt, now) : 0;

  function optimisticallyStopCurrent(stoppedAt: string) {
    const current = activeSession;
    if (!current) {
      return;
    }

    const stoppedAtMs = new Date(stoppedAt).getTime();
    const duration = secondsBetween(current.startedAt, stoppedAtMs);

    setDashboard((currentDashboard) => {
      if (!currentDashboard) {
        return currentDashboard;
      }

      return {
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
      };
    });
  }

  function startBook(bookId: string) {
    if (!accountIdentifier) {
      return;
    }

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
    writeJson(getActiveKey(accountIdentifier), nextActive);
    setLocalActive(nextActive);
    void flushQueue();
  }

  function stopBook() {
    if (!accountIdentifier || !activeSession) {
      return;
    }

    const occurredAt = new Date().toISOString();
    appendEvent({
      eventId: makeEventId(),
      type: "stop",
      bookId: activeSession.bookId,
      occurredAt,
    });
    window.localStorage.removeItem(getActiveKey(accountIdentifier));
    setLocalActive(null);
    optimisticallyStopCurrent(occurredAt);
    void flushQueue();
  }

  async function addBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accountIdentifier) {
      return;
    }

    const title = newBookTitle.trim();
    const author = newBookAuthor.trim();

    if (!title || !author) {
      setAddBookError("Title and author are required.");
      return;
    }

    setAddBookBusy(true);
    setAddBookError(null);

    try {
      applyDashboard(await postJson("/api/books", { title, author }, accountIdentifier));
      setNewBookTitle("");
      setNewBookAuthor("");
      setIsAddBookOpen(false);
    } catch (error) {
      setAddBookError(error instanceof Error ? error.message : "Failed to add book.");
    } finally {
      setAddBookBusy(false);
    }
  }

  function clearQueuedEventsForBook(bookId: string) {
    if (!accountIdentifier) {
      return;
    }

    const queueKey = getEventQueueKey(accountIdentifier);
    const queue = readJson<OfflineEvent[]>(queueKey, []);
    writeJson(
      queueKey,
      queue.filter((event) => event.bookId !== bookId),
    );

    const activeKey = getActiveKey(accountIdentifier);
    const active = readJson<LocalActive | null>(activeKey, null);
    if (active?.bookId === bookId) {
      window.localStorage.removeItem(activeKey);
      setLocalActive(null);
    }
  }

  async function markBookFinished(bookId: string) {
    if (!accountIdentifier) {
      return;
    }

    setBookActionBusy(true);
    setBookActionError(null);

    try {
      const finishedAt = new Date().toISOString();

      if (activeSession?.bookId === bookId) {
        appendEvent({
          eventId: makeEventId(),
          type: "stop",
          bookId,
          occurredAt: finishedAt,
        });
        window.localStorage.removeItem(getActiveKey(accountIdentifier));
        setLocalActive(null);
        optimisticallyStopCurrent(finishedAt);
      }

      await flushQueue();
      const nextDashboard = await mutateJson(
        "/api/books",
        "PATCH",
        { bookId, status: "finished", finishedAt },
        accountIdentifier,
      );

      const activeKey = getActiveKey(accountIdentifier);
      const active = readJson<LocalActive | null>(activeKey, null);
      if (active?.bookId === bookId) {
        window.localStorage.removeItem(activeKey);
        setLocalActive(null);
      }

      applyDashboard(nextDashboard);
      setOpenActionBookId(null);
    } catch (error) {
      setBookActionError(error instanceof Error ? error.message : "Failed to update book.");
    } finally {
      setBookActionBusy(false);
    }
  }

  async function markBookReading(bookId: string) {
    if (!accountIdentifier) {
      return;
    }

    setBookActionBusy(true);
    setBookActionError(null);

    try {
      const nextDashboard = await mutateJson("/api/books", "PATCH", { bookId, status: "reading" }, accountIdentifier);
      applyDashboard(nextDashboard);
      setOpenActionBookId(null);
    } catch (error) {
      setBookActionError(error instanceof Error ? error.message : "Failed to update book.");
    } finally {
      setBookActionBusy(false);
    }
  }

  async function confirmDeleteBook() {
    if (!accountIdentifier || !pendingDeleteBook) {
      return;
    }

    const bookId = pendingDeleteBook.id;
    setBookActionBusy(true);
    setBookActionError(null);

    try {
      const nextDashboard = await mutateJson("/api/books", "DELETE", { bookId }, accountIdentifier);
      clearQueuedEventsForBook(bookId);
      applyDashboard(nextDashboard);
      setPendingDeleteBook(null);
      setOpenActionBookId(null);
    } catch (error) {
      setBookActionError(error instanceof Error ? error.message : "Failed to delete book.");
    } finally {
      setBookActionBusy(false);
    }
  }

  async function openBookSessions(book: BookView) {
    if (!accountIdentifier) {
      return;
    }

    setSessionBook(book);
    setSessions([]);
    setSessionsError(null);
    setSessionsBusy(true);
    setOpenActionBookId(null);

    try {
      await flushQueue();
      setSessions(await fetchBookSessions(book.id, accountIdentifier));
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "Failed to load sessions.");
    } finally {
      setSessionsBusy(false);
    }
  }

  async function deleteSession(sessionId: string) {
    if (!accountIdentifier || !sessionBook) {
      return;
    }

    setDeletingSessionId(sessionId);
    setSessionsError(null);

    try {
      const nextDashboard = await mutateJson("/api/sessions", "DELETE", { sessionId }, accountIdentifier);
      applyDashboard(nextDashboard);
      setSessions(await fetchBookSessions(sessionBook.id, accountIdentifier));

      if (dashboard?.activeSession?.id === sessionId) {
        window.localStorage.removeItem(getActiveKey(accountIdentifier));
        setLocalActive(null);
      }
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "Failed to delete session.");
    } finally {
      setDeletingSessionId(null);
    }
  }

  const readingBooks = books.filter((book) => book.status === "reading");
  const finishedBooks = books.filter((book) => book.status === "finished");
  const visibleSessionBook = sessionBook ? books.find((book) => book.id === sessionBook.id) ?? sessionBook : null;

  if (auth.status !== "signedIn" || !accountIdentifier || !dashboard) {
    return (
      <>
        <header className="header">
          <div className="logo">
            <div className="logo-mark" />
            <span className="logo-text">BookTime</span>
          </div>
        </header>

        <main className="auth-panel" aria-label="Account access">
          <div className="auth-copy">
            <h1>Use your reading ID</h1>
            <p>Create an ID once, then enter it on any device to open the same library.</p>
          </div>

          <form className="auth-form" onSubmit={signIn}>
            <label className="auth-label" htmlFor="account-identifier">
              Account ID
            </label>
            <input
              id="account-identifier"
              className="auth-input"
              type="text"
              value={identifierInput}
              onChange={(event) => setIdentifierInput(event.target.value)}
              placeholder="BT-XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              disabled={authBusy || auth.status === "checking"}
            />

            {authError ? <p className="auth-error">{authError}</p> : null}

            <div className="auth-actions">
              <button className="btn-primary" type="submit" disabled={authBusy || auth.status === "checking"}>
                Sign in
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={registerAccount}
                disabled={authBusy || auth.status === "checking"}
              >
                Create account
              </button>
            </div>
          </form>
        </main>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <div className="logo">
          <div className="logo-mark" />
          <span className="logo-text">BookTime</span>
        </div>
        <div className="header-actions">
          <button className="account-chip" type="button" onClick={copyIdentifier} title="Copy account ID">
            {accountIdentifier}
          </button>
        </div>
      </header>

      {!activeBook ? (
        <button
          className="btn-add btn-add-floating"
          type="button"
          onClick={() => {
            setIsAddBookOpen((isOpen) => !isOpen);
            setAddBookError(null);
          }}
          aria-label="Add book"
          aria-expanded={isAddBookOpen}
          aria-controls="add-book-panel"
        >
          {plusIcon()}
        </button>
      ) : null}

      {isAddBookOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!addBookBusy) {
              setIsAddBookOpen(false);
              setAddBookError(null);
            }
          }}
        >
          <section
            className="add-book-modal"
            id="add-book-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Add book"
            onClick={(event) => event.stopPropagation()}
          >
            <form className="add-book-form" onSubmit={addBook}>
              <div className="add-book-field">
                <label className="auth-label" htmlFor="book-title">
                  Title
                </label>
                <input
                  id="book-title"
                  className="auth-input"
                  type="text"
                  value={newBookTitle}
                  onChange={(event) => setNewBookTitle(event.target.value)}
                  disabled={addBookBusy}
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <div className="add-book-field">
                <label className="auth-label" htmlFor="book-author">
                  Author
                </label>
                <input
                  id="book-author"
                  className="auth-input"
                  type="text"
                  value={newBookAuthor}
                  onChange={(event) => setNewBookAuthor(event.target.value)}
                  disabled={addBookBusy}
                  autoComplete="off"
                />
              </div>

              <div className="add-book-actions">
                <button className="btn-primary" type="submit" disabled={addBookBusy}>
                  Add
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setIsAddBookOpen(false);
                    setAddBookError(null);
                  }}
                  disabled={addBookBusy}
                >
                  Cancel
                </button>
              </div>

              {addBookError ? <p className="add-book-error">{addBookError}</p> : null}
            </form>
          </section>
        </div>
      ) : null}

      {pendingDeleteBook ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!bookActionBusy) {
              setPendingDeleteBook(null);
              setBookActionError(null);
            }
          }}
        >
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-book-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-book-title">Delete book?</h2>
            <p>
              This will remove <span>{pendingDeleteBook.title}</span> and its reading sessions.
            </p>
            {bookActionError ? <p className="book-action-error">{bookActionError}</p> : null}
            <div className="confirm-actions">
              <button className="btn-secondary" type="button" onClick={() => setPendingDeleteBook(null)} disabled={bookActionBusy}>
                Cancel
              </button>
              <button className="btn-danger" type="button" onClick={confirmDeleteBook} disabled={bookActionBusy}>
                Delete
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {visibleSessionBook ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!sessionsBusy && !deletingSessionId) {
              setSessionBook(null);
              setSessionsError(null);
            }
          }}
        >
          <section
            className="sessions-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sessions-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sessions-header">
              <div className={`book-cover ${visibleSessionBook.coverClass}`} aria-hidden="true">
                <div className="cover-line" />
                <div className="cover-line" />
              </div>
              <div className="sessions-heading">
                <h2 id="sessions-title">{visibleSessionBook.title}</h2>
                <p>{visibleSessionBook.sessionsCount} sessions</p>
              </div>
              <button
                className="session-close"
                type="button"
                onClick={() => {
                  setSessionBook(null);
                  setSessionsError(null);
                }}
                disabled={sessionsBusy || Boolean(deletingSessionId)}
                aria-label="Close sessions"
              >
                x
              </button>
            </div>

            {sessionsError ? <p className="book-action-error sessions-error">{sessionsError}</p> : null}

            <div className="sessions-list" aria-live="polite">
              {sessionsBusy ? (
                <div className="session-empty">Loading sessions...</div>
              ) : sessions.length > 0 ? (
                sessions.map((session) => {
                  const duration = session.isActive ? secondsBetween(session.startedAt, now) : session.durationSeconds;

                  return (
                    <div className="session-row" key={session.id}>
                      <div className="session-main">
                        <div className="session-date">
                          {formatSessionDate(session.startedAt)}
                          {session.isActive ? <span className="session-live">Active</span> : null}
                        </div>
                        <div className="session-duration">{formatTimer(duration)}</div>
                      </div>
                      <button
                        className="session-delete"
                        type="button"
                        onClick={() => deleteSession(session.id)}
                        disabled={Boolean(deletingSessionId)}
                        aria-label="Delete session"
                        title="Delete session"
                      >
                        {deletingSessionId === session.id ? "..." : trashIcon()}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="session-empty">No reading sessions yet.</div>
              )}
            </div>
          </section>
        </div>
      ) : null}

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

      {bookActionError && !pendingDeleteBook ? <p className="book-action-error inline-action-error">{bookActionError}</p> : null}

      <p className="section-label">Currently reading</p>
      <div className="book-list">
        {readingBooks.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            onStart={() => startBook(book.id)}
            onMarkFinished={() => markBookFinished(book.id)}
            onMarkReading={() => markBookReading(book.id)}
            onDeleteRequest={() => {
              setPendingDeleteBook(book);
              setBookActionError(null);
            }}
            onOpenSessions={() => openBookSessions(book)}
            isActionsOpen={openActionBookId === book.id}
            onActionsOpen={() => setOpenActionBookId(book.id)}
            onActionsClose={() => setOpenActionBookId(null)}
            actionsDisabled={bookActionBusy}
          />
        ))}
      </div>

      {finishedBooks.length > 0 ? (
        <>
          <div className="divider">
            <div className="divider-line" />
            <span className="divider-text">Finished</span>
            <div className="divider-line" />
          </div>

          <div className="book-list finished-list">
            {finishedBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onStart={() => startBook(book.id)}
                onMarkFinished={() => markBookFinished(book.id)}
                onMarkReading={() => markBookReading(book.id)}
                onDeleteRequest={() => {
                  setPendingDeleteBook(book);
                  setBookActionError(null);
                }}
                onOpenSessions={() => openBookSessions(book)}
                isActionsOpen={openActionBookId === book.id}
                onActionsOpen={() => setOpenActionBookId(book.id)}
                onActionsClose={() => setOpenActionBookId(null)}
                actionsDisabled={bookActionBusy}
                reread
              />
            ))}
          </div>
        </>
      ) : null}

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
  onMarkFinished,
  onMarkReading,
  onDeleteRequest,
  onOpenSessions,
  isActionsOpen,
  onActionsOpen,
  onActionsClose,
  actionsDisabled,
  reread = false,
}: {
  book: BookView & { displaySeconds: number };
  onStart: () => void;
  onMarkFinished: () => void;
  onMarkReading: () => void;
  onDeleteRequest: () => void;
  onOpenSessions: () => void;
  isActionsOpen: boolean;
  onActionsOpen: () => void;
  onActionsClose: () => void;
  actionsDisabled: boolean;
  reread?: boolean;
}) {
  const actionWidth = 184;
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const gesture = useRef<{ startX: number; startY: number; dragging: boolean } | null>(null);
  const suppressClick = useRef(false);
  const offset = dragOffset ?? (isActionsOpen ? -actionWidth : 0);
  const areActionsVisible = isActionsOpen || dragOffset !== null;

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
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

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
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
    const wasDragging = Boolean(gesture.current?.dragging);
    const shouldOpen = offset < -actionWidth / 2;
    gesture.current = null;
    setDragOffset(null);
    suppressClick.current = wasDragging;

    if (shouldOpen) {
      onActionsOpen();
    } else {
      onActionsClose();
    }
  }

  function handleCardClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }

    onOpenSessions();
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    onOpenSessions();
  }

  const swipeStyle = { "--swipe-offset": `${offset}px` } as CSSProperties;

  return (
    <div className="book-row" style={{ "--action-width": `${actionWidth}px` } as CSSProperties}>
      <div className={`book-actions${areActionsVisible ? " visible" : ""}`} aria-hidden={!areActionsVisible}>
        {book.status !== "finished" ? (
          <button
            className="book-action-btn action-finished"
            type="button"
            onClick={onMarkFinished}
            disabled={actionsDisabled}
            tabIndex={isActionsOpen ? 0 : -1}
          >
            {checkIcon()}
            Read
          </button>
        ) : (
          <button
            className="book-action-btn action-reading"
            type="button"
            onClick={onMarkReading}
            disabled={actionsDisabled}
            tabIndex={isActionsOpen ? 0 : -1}
          >
            {returnIcon()}
            Unread
          </button>
        )}
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

      <div
        className={`book-card swipe-card${book.isActive ? " active-card" : ""}${book.status === "finished" ? " finished-card" : ""}`}
        style={swipeStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Open reading sessions for ${book.title}`}
      >
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
        <button
          className={`btn-start${book.isActive ? " reading" : ""}${reread ? " reread" : ""}`}
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onStart();
          }}
          disabled={actionsDisabled}
        >
          {book.isActive ? pauseIcon() : playIcon()}
          {book.isActive ? "Reading" : reread ? "Re-read" : "Start"}
        </button>
      </div>
    </div>
  );
}
