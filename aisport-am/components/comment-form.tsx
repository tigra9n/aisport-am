"use client";

import { FormEvent, useState } from "react";

export function CommentForm({ articleSlug }: { articleSlug: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setState("sending");
    setMessage("");
    const form = new FormData(formElement);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleSlug,
        author: form.get("author"),
        body: form.get("body"),
        website: form.get("website"),
      }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setState("error");
      setMessage(result.error ?? "Փորձեք կրկին։");
      return;
    }
    formElement.reset();
    setState("sent");
    setMessage("Մեկնաբանությունն ուղարկվել է և կհրապարակվի ստուգումից հետո։");
  }

  return <form className="comment-form" onSubmit={submit}>
    <label>Ձեր անունը<input name="author" minLength={2} maxLength={60} required placeholder="Անուն" /></label>
    <label>Մեկնաբանություն<textarea name="body" minLength={3} maxLength={800} required rows={5} placeholder="Գրեք ձեր կարծիքը…" /></label>
    <label className="comment-honeypot" aria-hidden="true">Կայք<input name="website" tabIndex={-1} autoComplete="off" /></label>
    <div><small className={state === "error" ? "error" : ""}>{message || "Մեկնաբանությունները հրապարակվում են ստուգումից հետո։"}</small><button type="submit" disabled={state === "sending"}>{state === "sending" ? "Ուղարկվում է…" : "Ուղարկել"}</button></div>
  </form>;
}
