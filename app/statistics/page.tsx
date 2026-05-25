"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReadingSessionView, ReadingStatisticsView } from "@/lib/types";

type AuthState =
  | { status: "checking" }
  | { status: "signedOut" }
  | { status: "signedIn"; identifier: string };

type DayCell = {
  key: string;
  date: Date;
  isCurrentMonth: boolean;
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

function arrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function arrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthRange(monthDate: Date) {
  const from = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const to = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  return { from, to };
}

function buildMonthCells(monthDate: Date): DayCell[] {
  const { from, to } = getMonthRange(monthDate);
  const firstWeekday = from.getDay();
  const leadingDays = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const gridStart = new Date(from);
  gridStart.setDate(from.getDate() - leadingDays);

  const lastVisible = new Date(to);
  const lastMonthDay = new Date(to);
  lastMonthDay.setDate(to.getDate() - 1);
  const trailingDays = lastMonthDay.getDay() === 0 ? 0 : 7 - lastMonthDay.getDay();
  lastVisible.setDate(to.getDate() + trailingDays);

  const cells: DayCell[] = [];
  for (const cursor = new Date(gridStart); cursor < lastVisible; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    cells.push({
      key: dateKey(date),
      date,
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
    });
  }

  return cells;
}

function formatMonthTitle(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function formatShortTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatCalendarTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function aggregateByDay(sessions: ReadingSessionView[], serverNow: string, from: Date, to: Date) {
  const totals = new Map<string, number>();
  const rangeStart = from.getTime();
  const rangeEnd = to.getTime();
  const nowMs = new Date(serverNow).getTime();

  for (const session of sessions) {
    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : nowMs;
    const overlapStart = Math.max(startedAt, rangeStart);
    const overlapEnd = Math.min(endedAt, rangeEnd);

    if (overlapEnd <= overlapStart) {
      continue;
    }

    let cursorMs = overlapStart;
    while (cursorMs < overlapEnd) {
      const cursor = new Date(cursorMs);
      const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1).getTime();
      const chunkEnd = Math.min(overlapEnd, nextDay);
      const key = dateKey(cursor);
      const seconds = Math.max(0, Math.floor((chunkEnd - cursorMs) / 1000));
      totals.set(key, (totals.get(key) ?? 0) + seconds);
      cursorMs = chunkEnd;
    }
  }

  return totals;
}

async function fetchStatistics(accountIdentifier: string, from: Date, to: Date, signal: AbortSignal) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const response = await fetch(`/api/statistics?${params.toString()}`, {
    cache: "no-store",
    headers: { "x-booktime-account": accountIdentifier },
    signal,
  });
  const payload = (await response.json()) as ReadingStatisticsView | { error?: string };

  if (!response.ok) {
    throw new Error("error" in payload && payload.error ? payload.error : "Statistics request failed.");
  }

  return payload as ReadingStatisticsView;
}

export default function ReadingStatisticsPage() {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [monthDate, setMonthDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [statistics, setStatistics] = useState<ReadingStatisticsView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountIdentifier = auth.status === "signedIn" ? auth.identifier : null;
  const monthRange = useMemo(() => getMonthRange(monthDate), [monthDate]);
  const cells = useMemo(() => buildMonthCells(monthDate), [monthDate]);
  const dailyTotals = useMemo(
    () =>
      statistics
        ? aggregateByDay(statistics.sessions, statistics.serverNow, monthRange.from, monthRange.to)
        : new Map<string, number>(),
    [monthRange.from, monthRange.to, statistics],
  );
  const totalSeconds = useMemo(
    () => Array.from(dailyTotals.values()).reduce((sum, seconds) => sum + seconds, 0),
    [dailyTotals],
  );
  const activeDays = useMemo(
    () => Array.from(dailyTotals.values()).filter((seconds) => seconds > 0).length,
    [dailyTotals],
  );

  useEffect(() => {
    const savedIdentifier = normalizeAccountIdentifier(window.localStorage.getItem(ACCOUNT_KEY) ?? "");
    setAuth(savedIdentifier ? { status: "signedIn", identifier: savedIdentifier } : { status: "signedOut" });
  }, []);

  useEffect(() => {
    if (!accountIdentifier) {
      setStatistics(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetchStatistics(accountIdentifier, monthRange.from, monthRange.to, controller.signal)
      .then(setStatistics)
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setStatistics(null);
        setError(loadError instanceof Error ? loadError.message : "Failed to load reading statistics.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [accountIdentifier, monthRange.from, monthRange.to]);

  function shiftMonth(delta: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  if (auth.status === "checking") {
    return (
      <main className="app-loading" aria-label="Loading statistics" aria-busy="true">
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
          <Link className="header-link" href="/finished">
            Finished
          </Link>
          <Link className="header-link" href="/">
            Library
          </Link>
        </div>
      </header>

      <main className="statistics-page" aria-label="Reading statistics">
        {auth.status === "signedOut" || !accountIdentifier ? (
          <section className="statistics-empty">
            <h1>Reading statistics</h1>
            <p>Sign in on the library page to see reading hours by date.</p>
            <Link className="btn-primary statistics-empty-link" href="/">
              Open library
            </Link>
          </section>
        ) : (
          <>
            <section className="statistics-toolbar" aria-label="Month controls">
              <button className="month-nav-btn" type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                {arrowLeftIcon()}
              </button>
              <div className="statistics-title">
                <h1>{formatMonthTitle(monthDate)}</h1>
                <p>
                  {formatShortTime(totalSeconds)} total · {activeDays} reading days
                </p>
              </div>
              <button className="month-nav-btn" type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
                {arrowRightIcon()}
              </button>
            </section>

            {error ? <p className="book-action-error statistics-error">{error}</p> : null}

            <section className={`month-calendar${loading ? " loading" : ""}`} aria-busy={loading}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
                <div className="weekday-cell" key={weekday}>
                  {weekday}
                </div>
              ))}

              {cells.map((cell) => {
                const seconds = dailyTotals.get(cell.key) ?? 0;
                const hasReading = seconds > 0;

                return (
                  <div
                    className={`day-cell${cell.isCurrentMonth ? "" : " outside-month"}${hasReading ? " has-reading" : ""}`}
                    key={cell.key}
                  >
                    <span className="day-number">{cell.date.getDate()}</span>
                    <span className="day-hours">{formatCalendarTime(seconds)}</span>
                    <span className="day-hours-label">time</span>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </main>
    </>
  );
}
