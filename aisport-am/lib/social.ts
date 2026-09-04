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
  // The username became claimable once the page had content behind it, so
  // this is now the readable address rather than profile.php?id=. The old
  // numeric one still resolves, and Facebook keeps redirecting it, so no
  // link posted anywhere before today is broken by this.
  facebook: "https://www.facebook.com/aifootball.am",
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
