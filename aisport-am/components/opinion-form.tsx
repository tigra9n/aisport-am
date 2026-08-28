"use client";

import { useState } from "react";

export function OpinionForm({ token }: { token: string }) {
  const [author, setAuthor] = useState("");
  const [role, setRole] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    try {
      const res = await fetch(`/api/opinions?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author, role, title, content }),
      });
      const data = await res.json() as { ok: boolean; slug?: string; reason?: string };
      if (data.ok) {
        setStatus("done");
        setMessage(`Հրապարակված է։ Slug՝ ${data.slug}`);
        setAuthor(""); setRole(""); setTitle(""); setContent("");
      } else {
        setStatus("error");
        setMessage(`Սխալ․ ${data.reason ?? "անհայտ"}`);
      }
    } catch (err) {
      setStatus("error");
      setMessage(`Ցանցի սխալ․ ${String(err)}`);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 14, maxWidth: 620 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Հեղինակի անուն
        <input value={author} onChange={(e) => setAuthor(e.target.value)} required
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff" }} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Դերը (օր․ Ֆուտբոլային մեկնաբան)
        <input value={role} onChange={(e) => setRole(e.target.value)} required
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff" }} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Վերնագիր
        <input value={title} onChange={(e) => setTitle(e.target.value)} required
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff" }} />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
        Բովանդակություն
        <textarea value={content} onChange={(e) => setContent(e.target.value)} required rows={10}
          style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #333", background: "#111", color: "#fff", fontFamily: "inherit" }} />
      </label>
      <button type="submit" disabled={status === "saving"}
        style={{ padding: "12px 20px", borderRadius: 8, border: "none", background: "#2f7d3c", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
        {status === "saving" ? "Հրապարակվում է..." : "Հրապարակել"}
      </button>
      {message && <p style={{ color: status === "error" ? "#e06060" : "#3fb950", fontSize: 13 }}>{message}</p>}
    </form>
  );
}
