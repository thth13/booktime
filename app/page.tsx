import ReadingApp from "@/components/ReadingApp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  return <ReadingApp initialDashboard={null} />;
}
