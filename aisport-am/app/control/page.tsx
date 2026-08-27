import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "../../db";
import { automationRuns, sources } from "../../db/schema";
import { configuredPlatforms } from "../../lib/automation";

export const metadata: Metadata = { robots: { index: false, follow: false } };

async function loadControlData() {
  try {
    const db = await getDb();
    const [sourceRows, runRows] = await Promise.all([
      db.select().from(sources),
      db.select().from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(6),
    ]);
    return { sourceRows, runRows };
  } catch {
    return { sourceRows: [], runRows: [] };
  }
}

// Was fully public (no auth at all) - an internal automation dashboard
// anyone could load. Doesn't render the raw feedUrl (so no direct key
// leak like /api/automation/status had), but pipeline status/source names
// shouldn't be open to random visitors either. Same token as moderation.
async function checkAuth(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  return Boolean(runtime.MODERATION_TOKEN) && token === runtime.MODERATION_TOKEN;
}

export default async function ControlPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!(await checkAuth(token))) {
    return (
      <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Կառավարման վահանակ</h1>
        <p style={{ color: "#666", fontSize: 13 }}>Այս էջը պաշտպանված է։ Ավելացրու <code>?token=...</code> URL-ի վերջում։</p>
      </main>
    );
  }
  const { sourceRows, runRows } = await loadControlData();
  const configured = await configuredPlatforms();
  const channels = [
    ["OpenAI", configured.openai, "Թարգմանություն և խմբագրում"],
    ["Facebook", configured.facebook, "Էջի գրառում և հղում"],
    ["Instagram", configured.instagram, "Նկարով հրապարակում"],
    ["Telegram", configured.telegram, "Ալիք՝ տեքստ կամ նկար"],
    ["Threads", configured.threads, "Տեքստ կամ նկար"],
  ] as const;

  return (
    <main className="control-page">
      <header className="control-header">
        <div className="shell control-nav">
          <Link className="brand" href="/"><span className="brand-mark">AI</span><span>AI<span className="brand-accent">Sport</span> · կառավարում</span></Link>
          <Link className="back-link" href="/">← Դիտել կայքը</Link>
        </div>
      </header>

      <div className="shell control-shell">
        <section className="control-intro">
          <div><span className="eyebrow">ԱՎՏՈՄԱՏ ՀՐԱՊԱՐԱԿՈՒՄ</span><h1>Լրատվական հոսքի կառավարում</h1></div>
          <div className={`system-state ${configured.openai && configured.trigger ? "ready" : "waiting"}`}>
            <span />{configured.openai && configured.trigger ? "Համակարգը պատրաստ է" : "Սպասում է միացման տվյալներին"}
          </div>
        </section>

        <section className="pipeline" aria-label="Ավտոմատացման փուլեր">
          {[
            ["01", "Աղբյուրներ", "RSS և պաշտոնական հոսքեր"],
            ["02", "Զտում", "Կրկնությունների ու ոչ սպորտային նյութերի հեռացում"],
            ["03", "Հայերեն մշակում", "Բնական թարգմանություն և վերնագիր"],
            ["04", "Հրապարակում", "Կայք և բոլոր միացված հարթակներ"],
          ].map(([number, title, text]) => (
            <div className="pipeline-step" key={number}>
              <span>{number}</span><h2>{title}</h2><p>{text}</p>
            </div>
          ))}
        </section>

        <div className="control-grid">
          <section className="control-card">
            <div className="control-card-head"><div><span className="eyebrow">ԿԱՊԵՐ</span><h2>Հրապարակման ալիքներ</h2></div><span>{channels.filter(([, ready]) => ready).length}/{channels.length}</span></div>
            <div className="channel-list">
              {channels.map(([name, ready, detail]) => (
                <div className="channel-row" key={name}>
                  <div className={`channel-logo ${name.toLowerCase()}`}>{name.slice(0, 2)}</div>
                  <div><strong>{name}</strong><small>{detail}</small></div>
                  <span className={`status-pill ${ready ? "connected" : "pending"}`}>{ready ? "Միացված" : "Միացնել"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="control-card">
            <div className="control-card-head"><div><span className="eyebrow">ԱՂԲՅՈՒՐՆԵՐ</span><h2>Վստահելի հոսքեր</h2></div><span>{sourceRows.length}</span></div>
            {sourceRows.length ? (
              <div className="source-list">{sourceRows.map((source) => <div key={source.id}><span className="source-dot" /><div><strong>{source.name}</strong><small>{source.language.toUpperCase()} · RSS</small></div><span>{source.enabled ? "Ակտիվ" : "Անջատված"}</span></div>)}</div>
            ) : (
              <div className="empty-state"><span>＋</span><h3>Աղբյուրներ դեռ չկան</h3><p>Ակտիվացնելուց առաջ կավելացվեն միայն ձեր հաստատած RSS կամ պաշտոնական API աղբյուրները։</p></div>
            )}
          </section>
        </div>

        <section className="control-card runs-card">
          <div className="control-card-head"><div><span className="eyebrow">ՊԱՏՄՈՒԹՅՈՒՆ</span><h2>Վերջին ավտոմատ գործարկումները</h2></div></div>
          {runRows.length ? (
            <div className="runs-table">
              {runRows.map((run) => <div key={run.id}><time>{run.startedAt}</time><strong>{run.status}</strong><span>{run.foundCount} գտնված</span><span>{run.publishedCount} հրապարակված</span></div>)}
            </div>
          ) : (
            <div className="empty-run">Առաջին գործարկումից հետո այստեղ կերևան գտնված և հրապարակված լուրերի թվերը։</div>
          )}
        </section>

        <aside className="safety-card">
          <strong>Ավտոմատ հրապարակման պաշտպանություն</strong>
          <p>Նույն հղումը երկրորդ անգամ չի հրապարակվում, աղբյուրի հղումը պահպանվում է, իսկ ոչ սպորտային կամ անբավարար նյութը մերժվում է։ Եթե որևէ սոցհարթակ սխալ է վերադարձնում, մյուս հարթակների հրապարակումները շարունակվում են և սխալը գրանցվում է։</p>
        </aside>
      </div>
    </main>
  );
}
