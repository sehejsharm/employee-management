/**
 * Founders' "Before you meet me" notes — how they like meetings to run
 * (join two minutes early, camera on, bring a notebook…). Stored as plain
 * text, one point per line.
 */
export const MEETING_NOTES_MAX = 1500;

/** One point per line, without any bullet or number the founder typed. */
export function notePoints(notes: string | null | undefined): string[] {
  return (notes ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•·–]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** The notes as a block for a calendar invite or a message, or null when there are none. */
export function notesBlock(firstName: string, notes: string | null | undefined): string | null {
  const points = notePoints(notes);
  if (!points.length) return null;
  return [`Before you meet ${firstName}:`, ...points.map((p) => `• ${p}`)].join("\n");
}

/** Ideas a founder can add with one tap. */
export const NOTE_SUGGESTIONS = [
  "Join 2 minutes early",
  "Keep your camera on",
  "Bring a notebook and pen",
  "Share an agenda beforehand",
  "Be in a quiet place with good internet",
  "Come with your questions written down",
];
