import test from "node:test";
import assert from "node:assert/strict";
import { providerRefusal } from "../lib/api-sports.ts";

// The exact body the Worker was given on 6 September, which the site read
// as "this footballer does not exist" and answered 404 to.
test("a refusal that arrives as HTTP 200 is still a refusal", () => {
  assert.equal(
    providerRefusal({
      errors: { rateLimit: "Too many requests. You have exceeded the limit of requests per minute of your subscription." },
      results: 0,
      response: [],
    }),
    "rateLimit: Too many requests. You have exceeded the limit of requests per minute of your subscription.",
  );
});

// api-sports sends [] when nothing is wrong, so an empty answer is allowed
// to mean empty - a club with no squad published, a player with no season.
test("an empty answer with no errors is not a refusal", () => {
  assert.equal(providerRefusal({ errors: [], results: 0, response: [] }), null);
  assert.equal(providerRefusal({ errors: {}, results: 0, response: [] }), null);
  assert.equal(providerRefusal({ results: 2, response: [1, 2] }), null);
  assert.equal(providerRefusal(null), null);
});

test("a plan refusal is named too, not only the rate limit", () => {
  assert.equal(
    providerRefusal({ errors: { plan: "Free plans do not have access to this feature." } }),
    "plan: Free plans do not have access to this feature.",
  );
});
