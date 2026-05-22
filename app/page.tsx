import ReadingApp from "@/components/ReadingApp";
import { getDashboard } from "@/lib/reading-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  try {
    const dashboard = await getDashboard();
    return <ReadingApp initialDashboard={dashboard} />;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown MongoDB connection error.";

    return (
      <main className="setup-error">
        <div className="logo">
          <div className="logo-mark" />
          <span className="logo-text">Folio</span>
        </div>
        <h1>MongoDB is not connected</h1>
        <p>{message}</p>
        <p>
          Create `.env.local` from `.env.example`, start MongoDB, then restart
          `npm run dev`.
        </p>
      </main>
    );
  }
}
