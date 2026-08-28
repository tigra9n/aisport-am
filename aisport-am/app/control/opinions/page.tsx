import type { Metadata } from "next";
import Link from "next/link";
import { OpinionForm } from "../../../components/opinion-form";
import { getOpinions } from "../../../lib/opinions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

async function checkAuth(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  return Boolean(runtime.MODERATION_TOKEN) && token === runtime.MODERATION_TOKEN;
}

export default async function OpinionsAdminPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!(await checkAuth(token))) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Հեղինակային նյութեր</h1>
        <p style={{ color: "#666", fontSize: 13 }}>Այս էջը պաշտպանված է։ Ավելացրու <code>?token=...</code> URL-ի վերջում։</p>
      </main>
    );
  }

  const existing = await getOpinions(50);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif", color: "#fff", background: "#0a0f0a", minHeight: "100vh" }}>
      <Link href={`/control?token=${token}`} style={{ color: "#3fb950", fontSize: 13 }}>← Կառավարման վահանակ</Link>
      <h1 style={{ fontSize: 26, margin: "16px 0 6px" }}>Նոր հեղինակային նյութ</h1>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 28 }}>Հրապարակվելուց հետո անմիջապես կերևա homepage-ում ու /opinions էջում։</p>
      <OpinionForm token={token as string} />

      {existing.length > 0 && (
        <>
          <h2 style={{ fontSize: 20, margin: "40px 0 16px" }}>Առկա նյութեր ({existing.length})</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {existing.map((opinion) => (
              <Link key={opinion.id} href={`/control/opinions/${opinion.id}?token=${token}`}
                style={{ display: "block", padding: "12px 14px", borderRadius: 8, border: "1px solid #222", color: "#fff", textDecoration: "none" }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{opinion.title}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{opinion.category} · {opinion.author} · {opinion.publishedAt}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
