"use client";

import { useEffect, useState } from "react";

type PendingComment = {
  id: number;
  articleSlug: string;
  author: string;
  body: string;
  status: string;
  createdAt: string;
};

export default function ModeratePage() {
  const [token, setToken] = useState("");
  const [entered, setEntered] = useState(false);
  const [items, setItems] = useState<PendingComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(t: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/comments/moderate?token=${encodeURIComponent(t)}`);
      if (!res.ok) {
        setError(res.status === 401 ? "Սխալ token։" : "Չհաջողվեց բեռնել։");
        setLoading(false);
        return;
      }
      const data = await res.json() as { comments: PendingComment[] };
      setItems(data.comments);
      setEntered(true);
    } catch {
      setError("Ցանցի սխալ։");
    }
    setLoading(false);
  }

  async function act(id: number, action: "approve" | "reject") {
    setItems((prev) => prev.filter((c) => c.id !== id));
    await fetch("/api/comments/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, id, action }),
    });
  }

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("mod_token") : null;
    if (saved) {
      setToken(saved);
      load(saved);
    }
  }, []);

  if (!entered) {
    return (
      <div style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>Մեկնաբանությունների մոդերացիա</h1>
        <input
          type="password"
          placeholder="Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10, boxSizing: "border-box" }}
        />
        <button
          onClick={() => { window.sessionStorage.setItem("mod_token", token); load(token); }}
          disabled={loading || !token}
          style={{ width: "100%", padding: 10 }}
        >
          {loading ? "..." : "Մուտք"}
        </button>
        {error && <p style={{ color: "crimson", marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>Սպասող մեկնաբանություններ ({items.length})</h1>
      {items.length === 0 && <p>Ոչինչ չկա սպասող։</p>}
      {items.map((c) => (
        <div key={c.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>
            <strong>{c.author}</strong> · {c.articleSlug} · {new Date(c.createdAt + "Z").toLocaleString("hy-AM")}
          </div>
          <p style={{ marginBottom: 12, whiteSpace: "pre-wrap" }}>{c.body}</p>
          <button onClick={() => act(c.id, "approve")} style={{ marginRight: 8, padding: "6px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 4 }}>
            Հաստատել
          </button>
          <button onClick={() => act(c.id, "reject")} style={{ padding: "6px 14px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 4 }}>
            Մերժել
          </button>
        </div>
      ))}
    </div>
  );
}
