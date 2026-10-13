/**
 * The Workspace terms of service. One source for the public /terms page and
 * docs/TERMS_OF_SERVICE.md (npm run legal:md regenerates the Markdown).
 */
import type { PolicySection } from "@/lib/privacy-policy";

export const TERMS_UPDATED = "13 October 2026";

export function termsSections(contact: string): PolicySection[] {
  return [
    {
      title: "About these terms",
      body: [
        "These terms govern use of the Focus Realm Workspace (\"the Workspace\"), Focus Realm's internal tool for work, organisation and meetings, operated by Focus Realm (\"we\", \"us\"). By signing in you agree to them. They sit alongside your employment or internship agreement and Focus Realm's policies; if anything conflicts, those agreements prevail.",
      ],
    },
    {
      title: "Who may use it",
      list: [
        "Only Focus Realm founders, employees and interns with an account issued by Focus Realm (through the HR console or by a founder). There is no public sign-up.",
        "Access ends when your engagement ends or a founder deactivates your account.",
      ],
    },
    {
      title: "Your account",
      list: [
        "Sign in with your own employee ID and password. Don't share your password or let anyone else use your account — even if you share an email address with colleagues.",
        "You're responsible for what happens under your account. Tell a founder straight away if you think it has been misused; we can reset your password and sign you out everywhere.",
      ],
    },
    {
      title: "Acceptable use",
      body: ["Use the Workspace for Focus Realm work, honestly and respectfully. Do not:"],
      list: [
        "upload anything unlawful, harassing, discriminatory or that you don't have the right to share;",
        "submit work, proof or progress updates that misrepresent what was done;",
        "try to see work you haven't been cleared to see, get around permissions, or access other people's accounts;",
        "probe, scan, overload or interfere with the Workspace, or upload malware;",
        "copy or export company information outside Focus Realm except as your role requires.",
      ],
    },
    {
      title: "Content and confidentiality",
      list: [
        "Work, documents, comments and other content you create in the Workspace in the course of your role belong to Focus Realm as set out in your agreement with us.",
        "Everything in the Workspace is confidential company information. Keep it inside Focus Realm, during and after your time with us.",
        "Recognition, announcements and the people directory are visible company-wide; post accordingly.",
      ],
    },
    {
      title: "Google Calendar and Google Meet",
      body: [
        "If a founder connects a Google account, meetings arranged in the Workspace are created in Google Calendar with Google Meet links, and Google's own terms (https://policies.google.com/terms) apply to your use of those services. Founders can disconnect at any time. How we handle Google data is described in our Privacy Policy.",
      ],
    },
    {
      title: "Monitoring and records",
      body: [
        "The Workspace keeps records of work (tasks, deadlines, submissions, reviews, meetings) and of administrative changes, and founders can see work reports built from them. It does not track activity such as screen time, keystrokes or location. Details are in the Privacy Policy at /privacy.",
      ],
    },
    {
      title: "Availability and changes",
      list: [
        "We aim to keep the Workspace available and accurate but provide it as is, without guarantees of uninterrupted or error-free service. Keep your own judgment on deadlines and important decisions.",
        "We may change, suspend or retire features at any time, and update these terms; we'll note the date below and announce significant changes in the Workspace.",
      ],
    },
    {
      title: "Suspension",
      body: [
        "We may suspend or remove access, and remove content, if these terms or Focus Realm policies are breached, or to protect the Workspace, the company or other people.",
      ],
    },
    {
      title: "Liability",
      body: [
        "To the extent the law allows, Focus Realm is not liable for indirect or consequential losses arising from use of the Workspace or from outages of it or of third-party services such as Google. Nothing in these terms limits liability that cannot be limited by law.",
      ],
    },
    {
      title: "Governing law",
      body: ["These terms are governed by the laws of India, and the courts of India have jurisdiction, unless your agreement with Focus Realm says otherwise."],
    },
    {
      title: "Contact",
      body: [`Questions about these terms: ${contact}.`],
    },
  ];
}
