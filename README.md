# CRM-project

CRM for a window cleaning business. It's built with Expo (React Native) and Supabase.

- **Clients**: name, phone, email, address, notes, with search, tap to call/email, and directions in Maps
- **Quotes**: amount, description, status (draft / sent / accepted / declined), and a "schedule job from this quote" button
- **Schedule**: a month calendar with a dot for each job, the selected day's jobs with a day total, and one-off or repeating jobs (every 2/4/6/8/12 weeks)
- **Reminders**: local notifications on your phone. You set default lead times (e.g. 1 hour before, plus 6pm the evening before) and can override them per job. Tapping a reminder opens the job.

## Setup

### 1. Supabase

1. Create a project at <https://supabase.com/dashboard>.
2. Open **SQL Editor**, paste the contents of [`supabase/migrations/20261103000000_init.sql`](supabase/migrations/20261103000000_init.sql) and run it.
   If you use the Supabase CLI, you can instead run `npx supabase link` and then `npx supabase db push`.
3. Under **Authentication → Sign In / Providers → Email**, you can turn off "Confirm email" so you can sign in straight away.
4. Once you've created your own account in the app, turn off **Allow new users to sign up** so nobody else can register.

### 2. App config

```sh
cp .env.example .env.local
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from **Project Settings → API Keys**, and set `EXPO_PUBLIC_CURRENCY` (e.g. `GBP`, `USD`, `EUR`).

### 3. Run on your iPhone

```sh
npm install
npx expo start
```

Install **Expo Go** from the App Store, then scan the QR code with the iPhone Camera app. Your phone and PC need to be on the same Wi-Fi network. If they can't connect, use `npx expo start --tunnel`.

To install it as a standalone app (no Expo Go), build it with EAS: `npx eas-cli@latest build --platform ios`. That needs an Apple Developer account.

## How reminders work

Reminders are scheduled **on the phone itself**, so there's no server and no push service. Each time the app opens or comes back to the foreground, it:

1. tops up repeating jobs to about 6 months ahead (the `extend_job_series` database function), then
2. cancels all pending reminders and reschedules the soonest 60 of them. iOS allows at most 64 pending notifications per app.

So reminders stay accurate as long as you open the app now and then; with a typical round, opening it every week or two is plenty. Any change you make to a job reschedules its reminders immediately.

## Project layout

```
src/app/              screens (Expo Router: every file is a route)
  (tabs)/             Schedule, Clients, Quotes, Settings tabs
  clients/ quotes/ jobs/   detail, new and edit screens
  sign-in.tsx
src/components/       forms and shared UI
src/lib/
  api.ts              all Supabase queries
  reminders.ts        notification planning and scheduling
  supabase.ts         client setup (session stored with expo-sqlite)
  types.ts
supabase/migrations/  database schema, row-level security, recurring-job function
```

## Scripts

| Command             | What it does           |
| ------------------- | ---------------------- |
| `npm start`         | Start the dev server   |
| `npm run typecheck` | TypeScript check       |
| `npm run lint`      | ESLint (Expo config)   |
| `npm run format`    | Prettier on `src/`     |
