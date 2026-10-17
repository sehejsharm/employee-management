# Google Calendar & Google Meet

The Workspace talks to Google Calendar directly through Google's Calendar API
(OAuth 2.0). Nothing runs in the browser: tokens are encrypted in the database
(AES-256-GCM) and only the server calls Google.

## What it does

| | |
|---|---|
| **Founders' own calendars** | Each founder connects the Google account they actually use — e.g. the CEO's `sharmasehej2104@gmail.com`. These stay private: nobody else's meetings go on them and nobody sees what's in them. Anyone can **request a meeting** with a founder by suggesting a time; the founder **accepts, accepts at another time, or declines**. Accepted meetings go on the founder's own calendar with a Google Meet link (the requester gets a Google invite) **and** a copy goes on the shared team calendar, titled like *Saumitra Rao × Sehej Sharma — topic*. |
| **Founders' free time is private** | To see when a founder is free, a person **asks first**: "6 meetings of 30 min, for weekly reviews — can I see when you're free?" Only if the founder approves does that person see open slots (never the events themselves), for 14 days. |
| **One team calendar** | A shared "Focus Realm Team" calendar for everyone's work meetings. A founder connects it once with the Google account that should own it (a company account is best). **Schedule meeting** puts meetings there with a Meet link; Google emails every invitee. **Share with everyone** gives the whole team read access so they can add it in their own Google Calendar. |
| **Google Meet** | **Meet now** (Calendar page, and on every profile) starts an instant Meet call; the people you call get a notification with a *Join* button. Every scheduled meeting gets a Meet link too. |
| **Open Meet links** | Every Meet link the Workspace creates is set to **Open**: anyone who has the link joins straight away — no invitation, no "Ask to join", and no need to be signed in to the Google account the invite went to. Forward the link (or **Copy invite**) to any outside guest. |
| **Everywhere else** | Today's meetings appear in the daily summary; the Calendar page shows your meetings, requests waiting on you, and the next two weeks of the team calendar straight from Google. |

Personal calendar addresses: anyone can set **Settings → Calendar invites** to
the address they use for their calendar (a founder's is set automatically when
they connect).

## One-time setup (≈10 minutes)

1. **Create a Google Cloud project** at <https://console.cloud.google.com>
   (any name, e.g. "Focus Realm Workspace").
2. **Enable the APIs:** APIs & Services → Library →
   - **Google Calendar API** → Enable (meetings and their Meet links).
   - **Google Meet REST API** → Enable (makes the Meet links open to anyone with the link).
3. **OAuth consent screen** (APIs & Services → OAuth consent screen / "Google Auth Platform"):
   - User type **External** (needed for personal Gmail accounts like the CEO's).
   - App name "Focus Realm Workspace", support email, the Workspace domain under *Authorised domains*.
   - Privacy policy link: `https://<your workspace domain>/privacy`; terms of service link: `https://<your workspace domain>/terms`.
   - Scopes (Data access → Add or remove scopes; paste them under *Manually add scopes*):
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/meetings.space.settings`
   - **Publishing status → Publish app ("In production").** In *Testing* mode
     Google expires the connection every 7 days. Unverified production apps work
     fine for a handful of accounts: on the consent screen, click *Advanced →
     Go to Focus Realm Workspace (unsafe)* once. Apply for verification later if
     you want that screen gone.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   Authorised redirect URI — exactly:
   ```
   https://<your workspace domain>/api/google/callback
   ```
   (Locally: `http://localhost:3000/api/google/callback`.)
5. **Add to Vercel → Settings → Environment Variables** (Production), then redeploy:
   ```
   GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=…
   GOOGLE_TOKEN_KEY=<openssl rand -hex 32>
   ```
   `APP_URL` must be the same domain as the redirect URI.
6. **Connect in the Workspace** (founders): **Calendar** →
   - *Connect Google Calendar* — sign in with **your** calendar account (e.g. the personal Gmail).
   - *Connect team calendar* — sign in with the account that should own the shared calendar. The Workspace creates "Focus Realm Team" in it (or reuses one with that name).
   - *Share with everyone* — so the team can add it to their Google Calendar.

Each founder connects their own calendar the same way.

## Open meetings (anyone with the link can join)

Google normally lets only invited accounts straight into a meeting; everyone
else has to knock, and a guest signed in to a different Google account than the
one invited gets stuck. The Workspace turns that off for every Meet link it
creates — team meetings, Meet now calls, accepted founder meetings, each slot of
a multi-slot booking, and a link added when editing a meeting.

It needs the Google Meet REST API enabled and the
`meetings.space.settings` scope (steps 2 and 3 above). Calendars connected
before this was added must be **reconnected once** (Calendar → *Reconnect*);
the card under each calendar says *Reconnect to make Meet links open…* until
then. Reconnecting also opens the links of all upcoming meetings on that
calendar.

If Google refuses (for example the Meet API isn't enabled yet), the meeting is
still booked and the Calendar page shows the reason. Google decides what a
personal (@gmail.com) account may do; if a personal account's links still ask
guests to knock, connect the team calendar with a Google Workspace account, or
let guests in from the call.

## Notes

- **Disconnect** any time on the Calendar page; access is revoked at Google too.
  If Google revokes it (password change, removed access), the Calendar page says
  "Needs reconnecting".
- Rotating `GOOGLE_TOKEN_KEY` makes stored connections unreadable — founders just
  connect again.
- Shared mailboxes get one invite per address; everyone still gets their own
  in-app notification.
- `GOOGLE_TEAM_CALENDAR_NAME` renames the shared calendar (default "Focus Realm Team").
