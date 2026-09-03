// Facts about who runs the site, in one place.
//
// The about and contact pages, the article JSON-LD and the footer all need
// the same handful of details, and an ad network reads all of them looking
// for the same answer. Keeping them here means they cannot drift apart.

// The person behind the site. An ad network's reviewer, and a reader, both
// want a name rather than "our team" - and a made-up name is worse than
// none, so this is the real one.
export const FOUNDER_NAME = "Տիգրան";

// contact@aisport.am, not @aifootball.am: the aisport.am mailbox works
// today and the aifootball.am one is not routed yet. An address on the
// contact page that bounces is worse than no contact page at all.
export const CONTACT_EMAIL = "contact@aisport.am";
