"use client";

import { useState } from "react";

/**
 * A list that starts folded.
 *
 * The league and category pages render thirty articles as full-width cards,
 * which on a phone is a thirteen-thousand-pixel page - a reader scrolls past
 * the fourth card and gives up. Folding it is done in CSS rather than by
 * rendering fewer children on purpose: the cards below the fold are still in
 * the HTML, so search engines and the browser's own find-in-page still see
 * every article. Only the display is withheld until it is asked for.
 */
export function RevealGrid({ className, total, children }: { className: string; total: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const hidden = total - 12;

  return (
    <>
      <section className={`${className}${open ? "" : " reveal-collapsed"}`}>{children}</section>
      {!open && hidden > 0 && (
        <button type="button" className="reveal-more" onClick={() => setOpen(true)}>
          Տեսնել ևս {hidden} նյութ
        </button>
      )}
    </>
  );
}
