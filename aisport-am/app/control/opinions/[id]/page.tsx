import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OpinionEditForm } from "../../../../components/opinion-edit-form";
import { getOpinionById } from "../../../../lib/opinions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function checkAuth(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  return Boolean(runtime.MODERATION_TOKEN) && token === runtime.MODERATION_TOKEN;
}

export default async function OpinionEditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token } = await searchParams;
  if (!(await checkAuth(token))) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Հեղինակային նյութեր</h1>
        <p style={{ color: "#666", fontSize: 13 }}>Այս էջը պաշտպանված է։ Ավելացրու <code>?token=...</code> URL-ի վերջում։</p>
      </main>
    );
  }

  const opinionId = Number.parseInt(id, 10);
  if (!Number.isFinite(opinionId)) notFound();
  const opinion = await getOpinionById(opinionId);
  if (!opinion) notFound();

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif", color: "#fff", background: "#0a0f0a", minHeight: "100vh" }}>
      <Link href={`/control/opinions?token=${token}`} style={{ color: "#3fb950", fontSize: 13 }}>← Հեղինակային նյութեր</Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 28px" }}>Խմբագրել նյութը</h1>
      <OpinionEditForm token={token as string} opinion={opinion} />
    </main>
  );
}
