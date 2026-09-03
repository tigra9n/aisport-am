"use client";

import { useState } from "react";

// A reader who arrives from Facebook and likes the article has no way to
// pass it on. For a site whose growth is meant to come from being shared,
// that is the cheapest traffic there is, left on the floor.
//
// No third-party widget: those load scripts, track the reader and slow the
// page. These are plain links to the two networks' own share endpoints,
// plus a copy button for everywhere else - the messaging apps people
// actually use are not reachable by any widget anyway.
export function ShareRow({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; leave the button as it was rather
      // than claiming a copy that did not happen.
    }
  };

  return (
    <div className="share-row">
      <span className="share-label">Կիսվել</span>
      <a
        className="share-button facebook"
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
      >Facebook</a>
      <a
        className="share-button telegram"
        href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`}
        target="_blank"
        rel="noopener noreferrer"
      >Telegram</a>
      <button className="share-button" type="button" onClick={copy}>
        {copied ? "Պատճենվեց ✓" : "Պատճենել հղումը"}
      </button>
    </div>
  );
}
