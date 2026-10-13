/**
 * The Workspace privacy policy. One source for the public /privacy page and
 * docs/PRIVACY_POLICY.md (npm run legal:md regenerates the Markdown).
 * Keep it true to what the code does — update it when data handling changes.
 */

export const POLICY_UPDATED = "13 October 2026";

export interface PolicySection {
  title: string;
  body?: string[];
  list?: string[];
}

export function policySections(contact: string): PolicySection[] {
  return [
    {
      title: "Who we are",
      body: [
        "The Focus Realm Workspace (\"the Workspace\") is Focus Realm's internal tool for assigning and tracking work, organising the team, and arranging meetings. It is operated by Focus Realm (\"we\", \"us\"). It is for Focus Realm founders, employees and interns only; there is no public sign-up.",
      ],
    },
    {
      title: "What we collect",
      list: [
        "Account details from HR: name, employee ID, work email (which colleagues may share), role, title, department, manager(s), phone, location, start date and last working day. These usually come from the Focus Realm HR console; founders can also add or edit them.",
        "Sign-in data: a salted, one-way hash of your password (never the password itself), active sessions with a coarse device label (e.g. \"Chrome on macOS\"), and failed sign-in counts used to lock an account after repeated wrong passwords.",
        "Work you do in the Workspace: tasks, deadlines, checklists, comments, progress updates, submitted work and the documents, links and notes attached to it, reviews, update requests, announcements, recognition (kudos, awards, cheers), meeting requests, and what you choose to share as your current focus and bio.",
        "Notifications we send you and whether you have read them.",
        "Work reports for founders: a summary of each person's tasks, deadlines met, review outcomes, recognition and meetings, generated from the work above. Saved copies are kept when someone leaves or on their last day.",
        "An administrative audit log of account and organisation changes (e.g. who changed a role, reset a password or moved someone on the org chart).",
        "Your time zone, read from your browser so deadlines show in your local time.",
      ],
    },
    {
      title: "What we do not collect",
      list: [
        "No activity tracking: no screenshots, keystrokes, \"last seen\", time-on-page or location tracking.",
        "No advertising, marketing or third-party analytics trackers.",
        "We never sell, rent or share your data for advertising.",
      ],
    },
    {
      title: "Google Calendar and Google Meet",
      body: [
        "Connecting Google is optional and limited to founders. A founder may connect their own Google Calendar, and one shared team calendar may be connected with a separate company Google account. We ask Google for the Calendar scope (https://www.googleapis.com/auth/calendar) and use it only to:",
      ],
      list: [
        "create, update and cancel events for meetings arranged in the Workspace, with Google Meet links, and send Google's invitations to the people involved;",
        "copy meetings a founder accepts onto the shared team calendar;",
        "read busy/free times on a founder's calendar to work out open slots — only for people that founder has approved, and only the open slot times are shown, never the founder's events;",
        "list the shared team calendar's upcoming events on the Calendar page, and share that calendar read-only with team members when a founder chooses to.",
      ],
    },
    {
      title: "Google user data",
      body: [
        "We do not read the content of founders' personal calendar events. Google access and refresh tokens are encrypted at rest (AES-256-GCM), used only by our server, and never sent to anyone's browser. Google user data is not used for advertising, is not sold, is not used to train AI or machine-learning models, and is not transferred to third parties except as needed to provide the features above or as required by law. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
        "A founder can disconnect at any time on the Calendar page, which deletes the stored tokens and revokes our access at Google; access can also be removed at https://myaccount.google.com/permissions.",
      ],
    },
    {
      title: "How we use information",
      list: [
        "To run the Workspace: sign you in, show you your work, deliver notifications and reminders, and arrange meetings.",
        "To let the right people see work: you see your own tasks; others see your work only if you share a task with them or a founder grants clearance (with your consent where requested). Founders' work is visible to founders only.",
        "To keep accounts secure and to audit administrative changes.",
        "To give founders work reports and the organisation's picture of who is doing what.",
      ],
    },
    {
      title: "Who can see what",
      list: [
        "Everyone in the company: names, titles, departments, the org chart, work emails and who shares them, announcements and recognition.",
        "Founders: all work, work reports and the audit log. Managers and others see more only when a founder grants it.",
        "Your password hash and Google tokens are never shown to anyone.",
      ],
    },
    {
      title: "Service providers",
      body: [
        "We use a small number of providers to host and run the Workspace, each processing data only on our instructions: Vercel (application hosting), our managed PostgreSQL database provider (data storage, in Singapore where available), and Google (Calendar and Meet, only when connected). Data may be processed outside your country by these providers under their own security and data-protection terms.",
      ],
    },
    {
      title: "How long we keep data",
      list: [
        "Account and work records are kept while you work with Focus Realm and afterwards for as long as needed for business, legal and record-keeping purposes; when someone leaves their account is deactivated, not deleted, so their work history stays intact.",
        "Sessions expire automatically; signing out or a password reset ends them.",
        "Google tokens are deleted as soon as a calendar is disconnected.",
        "Uploaded documents are kept with the task or submission they belong to until it is deleted.",
      ],
    },
    {
      title: "Security",
      body: [
        "Passwords are hashed with bcrypt; sessions use secure, HTTP-only cookies; Google tokens are encrypted; access to every page and action is checked on the server; repeated wrong passwords lock an account; and administrative changes are logged. No system is perfectly secure, so please keep your password private and tell a founder straight away if you think your account has been misused.",
      ],
    },
    {
      title: "Your choices and rights",
      body: [
        `You can update your own profile, focus and calendar invite address in Settings, and see and end your active sessions. To access, correct or delete your data, or to object to how it is used, contact ${contact}. We'll respond within a reasonable time and in line with applicable law, including India's Digital Personal Data Protection Act, 2023 where it applies.`,
      ],
    },
    {
      title: "Changes",
      body: [
        "We'll update this policy when how we handle data changes, and change the date below. Significant changes will be announced in the Workspace.",
      ],
    },
    {
      title: "Contact",
      body: [`Questions about this policy or your data: ${contact}.`],
    },
  ];
}

/** Markdown version of a legal page. */
export function legalMarkdown(title: string, updated: string, sections: PolicySection[]) {
  const out = [`# Focus Realm Workspace — ${title}`, "", `_Last updated: ${updated}_`, ""];
  for (const s of sections) {
    out.push(`## ${s.title}`, "");
    for (const p of s.body ?? []) out.push(p, "");
    for (const l of s.list ?? []) out.push(`- ${l}`);
    if (s.list) out.push("");
  }
  return out.join("\n");
}

/** Who to write to about privacy or the terms: PRIVACY_CONTACT_EMAIL, or the founders. */
export function legalContact() {
  return process.env.PRIVACY_CONTACT_EMAIL?.trim() || "the Focus Realm founders";
}
