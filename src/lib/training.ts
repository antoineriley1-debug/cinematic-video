// Training Center content — shared by the training page and the voice
// narration endpoint so narration always matches what's on screen.

export const WELCOME_SCRIPT = [
  "Welcome to Crothall Executive OS. I'm here to help you.",
  "I'm part of your daily operating environment — not another software system to maintain. My job is to organize your information, surface what matters, preserve context, connect your work, and reduce your administrative burden.",
  "Every morning I open with your personal briefing: what needs your attention, why it matters, what should happen next, and where each item came from. During the day, hand me the emails you choose to share, your meeting minutes, and your Plaud recordings — I'll turn them into connected intelligence across your sites, directors, vendors, and contracts. Nothing lives in a silo.",
  "Ask my Chief of Staff anything — the answer always comes from your own records, with sources you can open.",
].join(" ");

export const TRAINING_MODULES: { title: string; body: string; href: string; slug: string }[] = [
  { title: "Daily Briefing", slug: "daily-briefing", href: "/briefing", body: "Your day starts here. The briefing greets you with what needs attention, why it matters, and where it came from. Acknowledge items to clear them from your recurring briefing — the records themselves are never deleted, and other executives keep their own view." },
  { title: "Email Intelligence", slug: "email-intelligence", href: "/emails", body: "Drag emails in — the system never touches your inbox. Each email is analyzed for intent, urgency, actions, dates, and people, then connected (with your confirmation) to sites, directors, vendors, and contracts. The original is preserved verbatim." },
  { title: "Email Timeline", slug: "email-timeline", href: "/emails", body: "Upload several emails together and Executive OS orders them chronologically into an event timeline: who said what, when, what was decided, and what was committed. Export it when you need a report." },
  { title: "Site Visit", slug: "site-visit", href: "/sites", body: "Open a site and press Start Site Visit. Capture positives, improvement opportunities, training needs, critical matters, projects, and back-burner items as you walk. Completing the visit files a structured record and a calendar activity." },
  { title: "Director File", slug: "director-file", href: "/directors", body: "Every director has one connected file: recognition, coaching, correctives, infractions, training, and performance — each entry with its source. AI can recommend a classification, but only you can file an infraction." },
  { title: "Corrective Email", slug: "corrective-email", href: "/emails", body: "Open any email and choose the Corrective personality: it states the documented issue, the expected standard, the required correction, a completion date, and the follow-up — factually and professionally. Firm, Escalated, Coaching, and nine other styles are available." },
  { title: "Vendor Intelligence", slug: "vendor-intelligence", href: "/vendors", body: "Document vendor performance where it happens. When several sites independently record problems with the same vendor, Executive OS raises a pattern alert with the supporting evidence attached." },
  { title: "Contract Search", slug: "contract-search", href: "/contracts", body: "Contracts carry their full terms, so you can ask the Chief of Staff \"When can we terminate?\" and get an answer with the source. The renewal watch counts down 90-60-30 days, and your acknowledgements never silence anyone else's alerts." },
  { title: "Meeting Minutes", slug: "meeting-minutes", href: "/meetings", body: "Upload minutes and Executive OS extracts the summary, decisions, actions with owners, and unresolved matters. Anything uploaded since your last briefing appears in the next one, linked to the original record." },
  { title: "Notes & Public Notes", slug: "notes-public-notes", href: "/notes", body: "Notes are private by default. Make one public to open it to comments, threaded replies, and @mentions. Your private flags — Follow Up, Important, Review — stay yours alone." },
  { title: "@Mentions", slug: "mentions", href: "/notes", body: "Type @Name in any public note, comment, or message and that executive gets an immediate notification linking straight to the source object." },
  { title: "Messaging", slug: "messaging", href: "/messages", body: "Direct and group messages with unread indicators. Share a project, contract, or note straight into the conversation so the discussion keeps its context." },
  { title: "AI Chief of Staff", slug: "ai-chief-of-staff", href: "/chief", body: "Ask what needs your attention, what happened last week, or what a contract requires. Every answer is grounded in your authorized records and cites its sources — if the records don't say, the Chief of Staff says so." },
  { title: "Plaud", slug: "plaud", href: "/plaud", body: "Plaud is your recorder; Executive OS is where recordings become intelligence. Import a transcript and it's summarized, mined for decisions and commitments, and connectable to sites, directors, and projects." },
  { title: "Search", slug: "search", href: "/search", body: "One search box across everything you're authorized to see: sites, directors, vendors, contracts, emails, meetings, notes, actions, and your own activity history." },
  { title: "Memory", slug: "memory", href: "/memory", body: "Commit the context you want your assistant to keep — with provenance. You can inspect, edit, or delete every memory, and AI never writes memory silently." },
  { title: "Reports", slug: "reports", href: "/calendar", body: "Site reports, director histories, vendor reports, meeting reports, email chronologies, activity reports, and your daily briefing all export with source attribution preserved." },
];

export function narrationTextFor(slug: string): string | null {
  if (slug === "welcome") return WELCOME_SCRIPT;
  const module_ = TRAINING_MODULES.find((m) => m.slug === slug);
  return module_ ? `${module_.title}. ${module_.body}` : null;
}
