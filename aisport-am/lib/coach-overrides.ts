// Clubs where API-Football's answer is out of date.
//
// The endpoint returns every coach who has managed a club, and the current
// one is inferred from a stint with no end date. That only works while the
// upstream data keeps up: for Manchester City it returns exactly one coach,
// Guardiola, with a stint open since 2016, and the site dutifully printed
// it. Tigran reports the manager is Enzo Maresca.
//
// So a club can be pinned here by name. The name is resolved to a real
// coach through the API's own search, which means the page still gets the
// photograph, the nationality, the age and the full career - everything a
// coach page shows - rather than a bare string with nothing behind it.
//
// This is a correction of the data, not of the rule: getCoach still picks
// the latest open stint everywhere else, and a club listed here should be
// taken out again once the upstream catches up.
export const COACH_OVERRIDES: Record<number, string> = {
  // Manchester City. API-Football still says Guardiola.
  50: "Maresca",
};
