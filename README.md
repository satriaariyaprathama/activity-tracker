# Activity Planner

Personal task/activity tracker (Dashboard, Day, Week, Month, Kanban) with data
synced across every device through **Supabase** — sign in with the same email
on your phone and laptop and you see the same tasks, live.

## 1. Create a Supabase project (free)

1. Go to https://supabase.com → sign up / log in → **New project**.
2. Wait for it to finish provisioning (~2 minutes).
3. Open **SQL Editor** → **New query** → paste the contents of `schema.sql`
   (included in this folder) → **Run**. This creates the `tasks` table with
   row-level security, so each signed-in user only ever sees their own data.
4. Open **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.
5. In this project folder, copy `.env.example` to `.env` and paste those two
   values in:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
6. Open **Authentication → URL Configuration** in Supabase and add the URL(s)
   you'll open the app from (e.g. `http://localhost:5173` for local dev, and
   your live URL once deployed) to **Redirect URLs**. Otherwise the sign-in
   link will fail to redirect back into the app.

That's it on the Supabase side — email sign-in ("magic link") works out of
the box, no extra setup needed.

## 2. Run locally

```bash
npm install
npm run dev
```

Open the local URL, enter your email, and click the link Supabase emails you.
You'll land back in the app signed in.

## 3. Build for production

```bash
npm run build
```

Output goes to `dist/`.

## 4. Deploy (Vercel, Netlify, etc.)

Same as before — build and deploy the `dist/` folder, **but** also add your
two `VITE_SUPABASE_*` values as environment variables in your hosting
provider's dashboard (Vercel: Project Settings → Environment Variables;
Netlify: Site configuration → Environment variables), then rebuild. Also add
the deployed URL to Supabase's Redirect URLs (step 6 above) or sign-in will
fail on the live site.

## How the sync works

- Sign-in is passwordless: enter your email, Supabase sends a one-time link,
  clicking it signs you in on that device. Use the same email everywhere.
- Every task is stored in Supabase tied to your user ID (row-level security
  guarantees nobody else can read or write your rows).
- The app subscribes to Supabase Realtime, so a change made on your phone
  appears on your laptop within a second or two — no refresh needed.

## Next step: Google Calendar integration

Each task already carries a `calendar_event_id` column, reserved for linking
a task to a Google Calendar event. Once you're ready for that, the natural
path is a Supabase Edge Function (or a small server) that uses the Google
Calendar API with OAuth — happy to help build that when you get there.
