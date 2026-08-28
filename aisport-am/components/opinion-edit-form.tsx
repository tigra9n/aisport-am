"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = ["Հայկական սպորտ", "Հայկական ֆուտբոլ"] as const;

export function OpinionEditForm({ token, opinion }: {
  token: string;
  opinion: { id: number; author: string; role: string; title: string; content: string; category: string; imageUrl: string | null; videoUrl: string | null };
}) {
  const router = useRouter();
  const [author, setAuthor] = useState(opinion.author);
  const [role, setRole] = useState(opinion.role);
  const [title, setTitle] = useState(opinion.title);
  const [content, setContent] = useState(opinion.content);
  const [category, setCategory] = useState<string>(opinion.category);
  const [imageUrl, setImageUrl] = useState(opinion.imageUrl ?? "");
  const [videoUrl, setVideoUrl] = useState(opinion.videoUrl ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error" | "deleting">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch(`/api/opinions?token=${encodeURIComponent(token)}&id=${opinion.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, role, title, content, category, imageUrl, videoUrl }),
      });
      const data = await res.json() as { ok: boolean; reason?: string };
      if (data.ok) {
        setStatus("done");
        setMessage("Պահպանված է։");
      } else {
        setStatus("error");
        setMessage(`Սխալ․ ${data.reason ?? "անհայտ"}`);
      }
    } catch (err) {
      setStatus("error");
      setMessage(`Ցանցի սխալ․ ${String(err)}`);
    }
  }

  async function remove() {
    if (!confirm("Վստա՞հ ես, որ ուզում ես ջնջել այս նյութը։ Այս գործողությունը հետ բերել հնարավոր չէ։")) return;
    setStatus("deleting");
    try {
      const res = await fetch(`/api/opinions?token=${encodeURIComponent(token)}&id=${opinion.id}`, { method: "DELETE" });
      const data = await res.json() as { ok: boolean; reason?: string };
      if (data.ok) {
        router.push(`/control/opinions?token=${token}`);
      } else {
        setStatus("error");
        setMessage(`Սխալ․ ${data.reason ?? "անհայտ"}`);
      }
    } catch (err) {
      setStatus("error");
      setMessage(`Ցանցի սխալ․ ${String(err)}`);
    }
  }

  const fieldStyle = { padding: "10px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontFamily: "inherit" };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 14, maxWidth: 620 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Կատեգորիա
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldStyle}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Հեղինակի անուն
        <input value={author} onChange={(e) => setAuthor(e.target.value)} required style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Դերը
        <input value={role} onChange={(e) => setRole(e.target.value)} required style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Վերնագիր
        <input value={title} onChange={(e) => setTitle(e.target.value)} required style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Նկարի հղում (ուղիղ URL, ոչ embed code — օր. ավարտվում է .jpg/.png-ով)
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Video հղում (YouTube)
        <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." style={fieldStyle} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Բովանդակություն (HTML-ն ընդունվում է. կարող ես ուղղակի գրել <code>&lt;a href="..."&gt;հղում&lt;/a&gt;</code>, <code>&lt;img src="..."&gt;</code>, կամ <code>&lt;iframe src="..."&gt;&lt;/iframe&gt;</code> video-ի համար, ուղիղ տեքստի մեջտեղում)
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={14} style={fieldStyle} />
      </label>
      <div style={{ display: "flex", gap: 12 }}>
        <button type="submit" disabled={status === "saving" || status === "deleting"}
          style={{ padding: "12px 20px", borderRadius: 8, border: "none", background: "#2f7d3c", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          {status === "saving" ? "Պահպանվում է..." : "Պահպանել"}
        </button>
        <button type="button" onClick={remove} disabled={status === "saving" || status === "deleting"}
          style={{ padding: "12px 20px", borderRadius: 8, border: "1px solid #a33", background: "transparent", color: "#e06060", fontWeight: 700, cursor: "pointer" }}>
          {status === "deleting" ? "Ջնջվում է..." : "Ջնջել"}
        </button>
      </div>
      {message && <p style={{ color: status === "error" ? "#e06060" : "#3fb950", fontSize: 13 }}>{message}</p>}
    </form>
  );
}
