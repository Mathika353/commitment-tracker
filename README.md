# Follow-Through Ledger — hosting it for the whole team

This is the same tool, rewired so it's a real hosted app instead of something that only works inside a Claude.ai chat.

**Stack:** Supabase (Postgres database, free tier) + GitHub (source control) + Vercel (hosting). Same combo you already used for the Client Memory Bank project, so most of this should feel familiar.

There's no backend server to write — the page talks to Supabase directly from the browser using their JS client, and Row Level Security on the table controls what it's allowed to do. Vercel just serves the static `index.html` file.

---

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Name it something like `td-commitment-ledger`, set a database password, pick a region close to the team, and create it.
3. Wait a minute or two while it provisions.

## 2. Create the table

1. In the Supabase dashboard, open **SQL Editor**.
2. Paste in the full contents of `schema.sql` (included alongside this file) and run it.
3. Check **Table Editor** → you should see a `commitments` table with the right columns.

## 3. Grab your API keys

1. **Project Settings → API**.
2. Copy the **Project URL** and the **anon public key**. You'll need both in the next step.

## 4. Point the app at your project

1. Open `index.html` in a text editor.
2. Near the top of the `<script>` tag, find:
   ```js
   var SUPABASE_URL = "YOUR_SUPABASE_URL";
   var SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```
3. Replace both placeholders with the values from step 3. Save the file.
4. Open `index.html` locally in a browser to sanity-check it connects (the setup banner should disappear and the ledger should load empty, with no console errors).

## 5. Push it to GitHub

From a terminal, in the folder with `index.html`, `schema.sql`, and this `README.md`:

```bash
git init
git add .
git commit -m "Follow-Through Ledger v1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/follow-through-ledger.git
git push -u origin main
```

(Create the empty repo on GitHub first — github.com → **New repository** — then use the URL it gives you above.)

## 6. Deploy on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo you just pushed.
2. Framework preset: **Other** — it's a static file, no build step needed.
3. Deploy.
4. Vercel gives you a live URL (something like `follow-through-ledger.vercel.app`). Share that with the team — that's the whole app.

Any time you edit `index.html` and push to `main`, Vercel redeploys automatically.

---

## 7. (Optional) Lock it down further

Right now, anyone with the link can read and write the ledger — the `anon full access` policy in `schema.sql` allows it. That's a reasonable default for a small internal team tool, but two ways to tighten it if you want:

- **Quick and blunt:** Vercel's built-in password protection (Vercel Pro plan) puts one shared password in front of the whole site.
- **Proper access control:** Add Supabase Auth (magic-link email login), then change the RLS policy to something like:
  ```sql
  using (auth.email() like '%@thrivingdentist.com')
  ```
  so only people who log in with a company email can read or write. This needs a small addition to `index.html` (a login screen) — happy to help build that next if you want it.

## Notes on how it behaves

- **Live updates:** the app subscribes to Supabase's realtime feed, so if one CSA logs a commitment, everyone else's open tab updates automatically — no need to refresh (the Refresh button is just a manual fallback).
- **"Your name" field:** remembered locally per browser (via `localStorage`) so each CSA doesn't have to retype it every time — this only works because the app is now a real hosted site; it wouldn't have worked inside the Claude.ai artifact version.
- If something breaks after deploying, the browser console (right-click → Inspect → Console) will usually show the Supabase error message — paste that back and it's easy to debug from there.
