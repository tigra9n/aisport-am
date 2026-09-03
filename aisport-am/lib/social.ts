// The site's social profiles, in one place.
//
// The footer promised "Follow us: Facebook, Instagram, Telegram, Threads"
// and the home page offered a "Join" button for a Telegram channel - all
// of it plain text and a dead button, because none of those accounts
// exist. A reader who clicked got nothing, which is worse than not making
// the offer.
//
// Anything with an empty address here is simply not shown. When the
// Facebook page is created, put its URL on this line and it appears in the
// footer and on every article's share row at once - one edit, no hunting
// through components.
export const SOCIAL = {
  // The page ID rather than a pretty name: Facebook does not hand a new
  // page a username until it has some content and activity behind it, and
  // this address works from the day the page exists. It is a one-line
  // change to facebook.com/aifootball.am once that is claimable.
  facebook: "https://www.facebook.com/1310712632124635",
  telegram: "",
  instagram: "",
  threads: "",
} as const;

export type SocialKey = keyof typeof SOCIAL;

const LABELS: Record<SocialKey, string> = {
  facebook: "Facebook",
  telegram: "Telegram",
  instagram: "Instagram",
  threads: "Threads",
};

export function activeProfiles(): { key: SocialKey; label: string; url: string }[] {
  return (Object.keys(SOCIAL) as SocialKey[])
    .filter((key) => SOCIAL[key].length > 0)
    .map((key) => ({ key, label: LABELS[key], url: SOCIAL[key] }));
}
