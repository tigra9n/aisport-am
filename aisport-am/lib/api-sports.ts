// A refusal that arrives as a success.
//
// MEASURED on 6 September, from inside the Worker: when the per-minute
// limit is reached, api-sports answers
//
//   HTTP 200 { "errors": { "rateLimit": "Too many requests. You have
//              exceeded the limit of requests per minute of your
//              subscription." }, "results": 0, "response": [] }
//
// Not a 429. So `response.ok` is true, the parser sees an empty list, and
// every caller here concluded that the thing does not exist - which is how
// /player/497488 answered "Այս էջը չկա" about a footballer whose profile
// the same endpoint returns in full a second later. The site could not
// tell "refused this minute" from "not a thing".
//
// The difference matters everywhere: a refusal must fall through to the
// cache, to the stale row, to knownPlayer and knownTeam - the whole
// apparatus this codebase already has for a provider that is briefly
// unavailable - while an empty answer is allowed to mean empty.
//
// api-sports sends errors as [] when there is nothing wrong and as an
// object when there is, so an array is not an error however it is filled.
export function providerRefusal(json: unknown): string | null {
  const errors = (json as { errors?: unknown } | null)?.errors;
  if (!errors || Array.isArray(errors) || typeof errors !== "object") return null;
  const entries = Object.entries(errors as Record<string, unknown>);
  if (!entries.length) return null;
  return entries.map(([name, message]) => `${name}: ${String(message)}`).join("; ");
}
