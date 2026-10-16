# File storage on Cloudflare R2 (free)

Documents people upload — proof of work, task files and announcement PDFs — are
stored in **Cloudflare R2** once it's connected. R2's free tier gives **10 GB of
storage**, and downloads are free (no bandwidth charges). Without R2, files are
kept in the Postgres database, which works but fills a free Supabase database
(500 MB) quickly.

The database itself (people, tasks, meetings…) stays on Supabase — only the
files move.

## 1. Create the bucket (5 minutes)

1. Sign in at <https://dash.cloudflare.com> (a free account is enough).
2. In the left menu open **R2 Object Storage**. The first time, Cloudflare asks
   you to add R2 to your plan — choose the free plan. It may ask for a card; the
   free tier isn't charged unless you go past it.
3. Click **Create bucket**, name it e.g. `focus-realm-files`, leave the location
   on *Automatic*, and create it. Leave **public access off** — the Workspace
   hands out short-lived private links itself.
4. Note your **Account ID** (shown on the R2 overview page, right-hand side).

## 2. Create an API token

1. On the R2 overview page click **Manage R2 API Tokens** → **Create API token**.
2. Permission: **Object Read & Write**. Scope it to the bucket you just made.
3. Create it, then copy the **Access Key ID** and **Secret Access Key** (the
   secret is shown only once).

## 3. Add four settings in Vercel

Vercel → your project → **Settings → Environment Variables**, for Production
(and Preview if you use it):

| Name | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | your Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | the token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the token's Secret Access Key |
| `R2_BUCKET` | the bucket name, e.g. `focus-realm-files` |

Then **redeploy** (Deployments → ⋯ → Redeploy) so the settings take effect.

## 4. Move the files you already have

Open the Workspace → **Workspace admin → File storage**. It should say
*Cloudflare R2 is connected* and show how many files are still in the database.
Click **Move 25 files to Cloudflare** until it reaches zero — or just wait: the
daily job moves 100 a day on its own.

Supabase keeps the freed space for reuse automatically. To shrink the database
right away, run `VACUUM FULL "FileBlob"; VACUUM FULL "Announcement";` in the
Supabase SQL editor at a quiet time.

## How it behaves

- New uploads go to R2 under `drive/<person>/…` (announcement PDFs under
  `announcements/…`). Removing an attachment or deleting an announcement removes
  the file too.
- Opening a file checks the viewer's access in the Workspace first, then sends
  them a private link that expires after 5 minutes.
- If the R2 settings are removed, new uploads go back to the database; files
  already in R2 need the settings to be opened.
- The per-file upload limit (4 MB on Vercel) is unchanged — it's set by Vercel,
  not by storage. Share bigger files as a Drive link.
