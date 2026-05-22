export type BookStatus = "reading" | "finished";

export type BookView = {
  id: string;
  title: string;
  author: string;
  coverClass: string;
  status: BookStatus;
  totalSeconds: number;
  sessionsCount: number;
  progress: number;
  isActive: boolean;
};

export type ActiveSessionView = {
  id: string;
  bookId: string;
  startedAt: string;
};

export type DashboardView = {
  books: BookView[];
  activeSession: ActiveSessionView | null;
  totalThisWeekSeconds: number;
  booksInProgress: number;
  serverNow: string;
};

export type OfflineEvent =
  | {
      eventId: string;
      type: "start";
      bookId: string;
      occurredAt: string;
    }
  | {
      eventId: string;
      type: "stop";
      bookId: string;
      occurredAt: string;
    };
