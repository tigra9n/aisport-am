"use client";

import { lazy, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// The match modal is the largest thing the browser downloads that most
// visitors never use. It is 25 KB of source - two thirds of all the
// client-side components on the site put together - carrying the pitch
// diagram, seven tabs, the statistics bars and the head-to-head table,
// and it shipped in the first bundle of the home page and the live page
// to everyone, whether or not they ever opened a match.
//
// A dynamic import splits it into its own chunk, fetched the moment a
// match is actually opened. Everyone else never pays for it. The wrapper
// exists because the import has to happen from the browser, which means
// from a client component; the pages themselves render on the server.
const MatchModal = lazy(() => import("./match-modal").then((m) => ({ default: m.MatchModal })));

export function MatchModalLazy() {
  const searchParams = useSearchParams();
  if (!searchParams.get("match")) return null;
  return (
    <Suspense fallback={null}>
      <MatchModal />
    </Suspense>
  );
}
