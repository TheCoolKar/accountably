# Accountably

**Tagline:** Lock In Together

A private, mobile-first web app where squads of 2–5 friends lock in weekly goals, update progress in real time, see each other's progress, and review the week together.

**Core promise:** it's easier to follow through when someone you trust knows what you committed to.

**Audience (hypothesis):** students and young adults juggling school, exercise, applications, and career goals.

This file is the single source of truth for building the app. Build P0 first. Treat P1 and P2 as future work unless explicitly asked.

---

## 1. Product principles

Use these to settle design and scope questions.

1. **The weekly loop is the product.** Lock in, make progress, recap, lock in again. A feature that doesn't strengthen this loop doesn't ship.
2. **Squad over self.** The value is that someone else can see what you committed to. Solo use is not a supported mode.
3. **Small and private.** Squads of 2–5, invite-only. No public feed, profiles, or discoverability.
4. **Supportive, not shaming.** Shared consistency matters more than beating friends. No individual rankings, no punishment mechanics, no guilt copy.
5. **Minimal friction.** Adding a goal and logging progress each take one or two taps from the dashboard.
6. **Users own their goals.** Encourage specific, measurable goals, but never silently rewrite a user's goal or invent a target for them.
7. **Honest status.** Completed, in progress, unfinished, and "not locked in" are always distinguishable. Never show a misleading 100% or 0%. The percentage in between is deliberately encouraging (early goals count for more, see Progress maths), so the exact count ("2 of 4 done") is always shown with it.

**What it is not:** a to-do list, a daily habit tracker, a public social network, or a competitive leaderboard. Adjacent apps (Habitica, HabitShare, Focusmate, Accountability Games) already cover gamified tasks, shared habits, co-working, and group standings. The difference here is weekly commitments made to a few real friends plus a shared review.

---

## 2. Terminology

Use these words in code, UI, and copy.

- **Squad:** a private group of 2–5 friends sharing weekly commitments.
- **Lock-in:** confirming your goals for a week.
- **Goal:** a commitment owned by one member for one week. Either **one-time** or **counted**.
- **Nudge:** a gentle, rate-limited encouragement on a squadmate's unfinished goal. They get a notification that you're cheering them on.
- **Sunday prompt:** the notification on Sunday evening asking each member to lock in next week.
- **Recap:** the completed and unfinished goals for a finished week.
- **Squad streak:** consecutive weeks the whole squad delivers (P1, rule in section 10).

---

## 3. The weekly loop

Weeks run **Monday to Sunday** in the squad's time zone.

| Stage | When | What happens |
|---|---|---|
| Lock-in | Sunday (or any time before/during the week) | Each member sets about 3–5 goals for the week and taps `Lock in goals` |
| Progress | Monday–Sunday | Owners mark goals done or increment counts; the squad sees it live |
| Recap | After Sunday ends | The week closes; the recap shows each member's completed and unfinished goals and the squad result |
| Next week | From the recap | A button leads straight into locking in the new week |

Goals can be set up to two weeks ahead (this week, next week, the week after). On Sunday the dashboard shows the current week still in progress and prompts you to start planning next week. Whatever you didn't finish is offered again the following week (see Carry-over). The final recap is frozen from the week's last saved state when Sunday ends.

---

## 4. Scope

### P0: build first

| ID | Requirement | Behaviour |
|---|---|---|
| P0-01 | Account and profile | Sign up, sign in, set a display name |
| P0-02 | Create/join squad | One user creates a private squad; friends join by invite link or code |
| P0-03 | Squad dashboard | Current week, members, goals, and progress |
| P0-04 | Goal create/edit/delete | Each member manages their own goals for a week |
| P0-05 | Goal types | One-time (done / not done) or counted (0 of N) |
| P0-06 | Log progress | Owner marks done, undoes, or adds/removes a counted occurrence |
| P0-07 | Lock in | A `Lock in goals` action confirms the week's goals; edits stay possible and are visible to the squad |
| P0-08 | Realtime updates | Changes appear for other online members without a refresh |
| P0-09 | Progress | Individual progress and overall squad completion rate |
| P0-10 | Week history | Past weeks are preserved and read-only; a new week never erases anything |
| P0-11 | Weekly recap | Completed and unfinished goals per member, squad percentage, button to plan next week |
| P0-12 | Activity feed | Recent goal creations, edits, and progress within the squad (short list, not an infinite feed) |
| P0-13 | Mobile-first UI | Phone browsers first, responsive on desktop |

### Built ahead of P1 (asked for on 2026-11-15)

| ID | Requirement | Behaviour |
|---|---|---|
| N-01 | Add to home screen | The site installs as an app (manifest, icons, service worker). On iPhone this is what makes notifications possible |
| N-02 | Push notifications | Per device, opt-in from the dashboard card or settings. Sent when a squadmate adds a goal, finishes a goal, moves a counted goal forward, or nudges you, and for the Sunday prompt |
| N-03 | Nudges | Tap `Nudge` on a squadmate's unfinished goal. They are notified and see "… is cheering you on" on that goal |
| N-04 | The clock | Weeks roll over by date with no manual step; an open screen moves to the new week by itself; the Sunday prompt goes out at 18:00 squad time |
| N-05 | Plan three weeks | The dashboard switches between This week, Next week and Week after; goals can be set in any of them |
| N-06 | Carry-over | Unfinished goals from the week before are offered, prefilled, in the week being planned. Cross off any with one tap, add the rest with one button |
| N-07 | Sunday card | On Sunday, on This week, a card says "Start planning next week now" and jumps to Next week. It goes away once you have goals there |
| N-08 | Phone-friendly goal editor | Adding or editing a goal opens a panel at the top of the screen with Save in its header, so the keyboard never covers what you're typing |
| N-09 | Password reset | "Forgot password?" on sign-in emails a link; the link opens a page to set a new password |
| N-10 | Several squads | You can be in more than one squad. A back arrow on a squad opens "Your squads", where you switch squads or start/join another |
| N-11 | Dark mode | A toggle at the top right of every screen switches light/dark and is remembered on the device |

### P1: after the first working version

- Squad streak
- Optional daily check-ins (short update, optional blocker)
- Goal suggestions: examples that show how to make a vague goal concrete
- Free-form reflection on the recap
- Per-type notification choices (today notifications are simply on or off per device)

### P2: only after retention is tested

AI goal coach, personalised weekly summaries, badges or squad challenges, optional proof (photo/link), calendar integration, partner matching beyond friends, paid features.

### Out of scope

Public leaderboards, infinite social feed, financial penalties, habit trees, open matchmaking, mandatory proof, punitive streak mechanics, points/XP/avatars, squads larger than 5.

---

## 5. Functional rules

### Goals

- Each goal belongs to exactly one owner, squad, and week.
- Only the owner can change its title, target, or progress.
- One-time goals are `0/1` or `1/1`. Counted goals have `target_count >= 1` and `0 <= completed_count <= target_count`.
- A goal is complete when `completed_count == target_count`. Status is derived from the counts, not stored separately.
- The owner can undo a completion or decrement a count.
- Current-week goals can be edited after lock-in. Every edit creates an activity event the squad can see.
- 3–5 goals per week is guidance shown in the UI, not a hard limit.

### Carry-over

- When you look at a week you can still plan, your **unfinished** goals from the week before it are listed as suggestions: same wording, same type and target, count back at zero. Finished goals are not offered.
- A suggestion is left out if a goal with the same title (ignoring capitals and spaces) is already in the week being planned.
- Nothing is created until you tap the add button. This keeps "Users own their goals": the app prefills, it never commits on your behalf, and a member with only suggestions still shows as Not locked in.
- Each suggestion has an X. Crossing one off only hides that suggestion; it is remembered on the device (`accountably:carry-over-dismissed`), not in the database.
- Added goals are ordinary goals: the squad sees them in the feed, and you still tap `Lock in goals`.
- The rule is the same for every week: This week draws from last week, Next week from this week's unfinished goals so far, Week after from next week's list. Logic lives in `lib/domain/carry-over.ts`.

### Weeks

- A week starts Monday and ends Sunday in the squad's IANA time zone. Never use the device's time zone for boundaries.
- The squad time zone defaults from the creator's browser at creation and can be changed in settings; a change applies to future weeks only.
- Store timestamps in UTC and `week_start_date` as a date (the Monday).
- A week is closed as soon as its Sunday ends in squad time. Enforce this by date on the server; the `status` column is a convenience, not the check.
- Closed weeks are read-only. The recap reflects the final saved state.
- Goals can be created in the current week and the next two (`PLANNING_WEEKS_AHEAD` in `lib/domain/week.ts`, `v_weeks_ahead` in `ensure_week`; keep them equal). Never in a past week.

### Progress maths

- **Goal progress:** `completed_count / target_count`, clamped to 0–100%.
- **Member progress:** the mean of that member's goal progress for the week (equal weight per goal), then **front-loaded** so early goals count for more: `shown = 1 − (1 − share)²` (`boostProgress`, exponent `EARLY_PROGRESS_BOOST` in `lib/domain/progress.ts`). With 4 goals it reads 44%, 75%, 94%, 100% as goals are finished; with 3 goals 56%, 89%, 100%; with 5 goals 36%, 64%, 84%, 96%, 100%. Decided by the owner on 2026-11-16 to make the week feel within reach early.
- The weighting never touches the ends or the counts: nothing done is exactly 0%, only a fully finished week is 100%, and the "2 of 4 done" text beside the percentage is always the literal count. Don't apply the boost anywhere a literal figure is expected (the recap's completed-vs-committed lists, analytics).
- **Squad progress:** mean of participating members' (boosted) progress (equal weight per member).
- A member with no goals shows as **Not locked in** and is excluded from the squad percentage.
- If nobody has goals, show a neutral empty state, not 0%.
- Percentages and events are derived from stored data on the server. Never trust a client-supplied percentage.

### Nudges

- You can nudge any active squadmate's goal that is unfinished and in an open week. Never your own.
- Up to **3 nudges** per sender → recipient in any 24 hours, each on a **different goal** (a goal can be nudged once a day). After the third, the sender waits until the oldest of the three is a day old. The numbers live in `NUDGE_LIMIT` and `NUDGE_WINDOW_HOURS` (`lib/domain/nudge.ts`) and in `send_nudge` (SQL); keep them equal.
- A nudge is between two people: only the sender and the recipient can see it. It does not appear in the activity feed, so it can never read as public pressure.
- Wording is always encouragement ("Sam is cheering you on"), never a reminder of what's undone.

### Notifications

- Opt-in per device. Nothing is sent to someone who hasn't turned them on.
- Sent to the rest of the squad when a member **adds a goal**, **finishes a goal**, or **moves a counted goal forward** ("Sam is at 2 of 3 on …"); to the recipient of a **nudge**; and the **Sunday prompt**. Edits, a count taken back down, reopening and removals stay in the activity feed only. The rule for what counts as progress is the same as the green rule (`isProgressWin`).
- Every finished goal and every step forward is its own notification, every time, including a goal finished again after being reopened. Several goals added in a row replace one notification on the device instead of stacking. Each nudged goal is its own notification.
- `scripts/smoke-backend.mjs` checks this whole list (what notifies, what stays quiet, and that the person acting is never notified). Run it after touching `activity_notify` or `send_nudge`.
- Who is notified and the wording are decided in the database, never by a client. Clients cannot write to the outbox or call the sender.
- iPhone: notifications only work after Add to Home Screen (iOS 16.4+), opened from the home screen. The settings screen explains the steps. The home-screen app has its own sign-in, separate from Safari.
- Signing out turns notifications off for that device. A device a push service reports as gone is forgotten automatically.

### The clock

- Nothing "closes" a week: open or closed is always worked out from the date in the squad's zone, on the server and in the app.
- An open dashboard checks every 30 seconds and moves to the new week when Sunday ends.
- **Sunday prompt:** hourly job; for each squad where it is Sunday 18:00 or later in the squad's zone, once per squad per week, notify each member who has not yet set goals for the week starting tomorrow. Tapping it opens next week in that squad (`/squad?week=next&id=…`).
- People can still add goals at any point in the week; the prompt is a nudge to start, not a deadline.
- **Sunday card (in the app):** all day Sunday in the squad's zone, This week shows "Start planning next week now" with a button to Next week, until you have at least one goal there. It needs no notification permission.

### Squads and privacy

- Maximum 5 members, enforced on join. A squad with one member shows a "waiting for friends" state with the invite.
- Goals, progress, and activity are visible only to active members of the same squad.
- Invite codes are hard to guess, stored hashed, expire, and can be revoked or rotated.
- A member who leaves loses access immediately.
- Authorisation is enforced in the database (row-level security). Hiding buttons is not security.

### Several squads

- A person can be in any number of squads; each squad still holds 2–5 people and is private from the others.
- **Home rule (`/squad` with no squad chosen):** no squads → join/create; exactly one → that squad opens directly; two or more → the "Your squads" list, where you pick.
- A specific squad is `/squad?id=<squad id>`. The back arrow on a squad goes to `/squads`. Settings is `/squad/settings?id=…`.
- "Your squads" lists each squad with who's in it, plus `Start another squad` and `Join a squad with a code`.
- Goals, weeks, activity, nudges and the Sunday prompt are all per squad. A goal in one squad never appears in another; carry-over stays within a squad. Copying goals across (below) makes new, separate goals, though their progress then moves together (see "Progress follows you across squads").
- Notifications open the squad they are about (their link carries the squad id).
- **Copy goals from another squad:** in a week you can still plan, if you're in two or more squads, your card has `Copy goals from another squad`. Pick the squad (skipped when there's only one other), see your goals there for the same week (`week_start_date`), cross off any, then add the rest. Finished goals are offered too (it copies the plan, not the progress); counts start at zero; titles already here are left out. Nothing is created until you tap add, and added goals are ordinary goals here (feed, notifications, you still lock in). Logic: `importCandidates` in `lib/domain/carry-over.ts`; UI: `components/app/import-goals.tsx`.
- **Progress follows you across squads:** changing the count on one of your goals sets the same count on your goals in your other squads for the same week with the same title (ignoring capitals and spaces), type and target. Taking a count back down is copied too. Only open weeks, only squads you're still in, never anyone else's goal. Each squad gets its own activity event and notifications. Done in the database (`goals_sync_progress` trigger, `20261123000000_sync_progress_across_squads.sql`), mirrored by `isLinkedGoal` in `lib/domain/goal-sync.ts`; keep them equal. Goals with a different target or title stay independent.
- Leaving a squad returns you to home, which applies the home rule again.

### Password reset

- `Forgot password?` on the sign-in screen → `/auth/forgot-password` → Supabase emails a link → `/auth/reset-password` sets the new password (same 8-character minimum as sign-up, `PASSWORD_MIN` in `lib/domain/auth.ts`).
- The request screen always says "if there's an account…": it never reveals whether an email is registered.
- An expired or already-used link shows "request another link", never a blank or broken form.
- The link must come back to this site: the published address has to be the Site URL (or in Redirect URLs) under Supabase → Authentication → URL Configuration, otherwise Supabase sends people to the wrong place.
- Email delivery uses Supabase's built-in sender until a custom SMTP sender is set up. The built-in one is rate-limited to a few emails an hour and is meant for testing; set up SMTP before relying on it with friends.
- On iPhone the email link opens in Safari, not the home-screen app. Reset there, then sign in to the app with the new password.

### Resilience

- Every screen has loading, error, empty, and reconnecting states.
- A failed write must never look saved. Roll back optimistic updates and tell the user.
- Repeated taps must not create duplicate progress (make increments idempotent or debounce them).

---

## 6. User flows

**New squad:** sign up → set display name → create squad → share invite link/code → friend joins → both add goals → both see the dashboard.

**Lock-in:** open current or upcoming week → add one-time or counted goals (UI suggests 3–5) → review → `Lock in goals` → squad sees the commitments.

**Progress:** open own goal card → toggle a one-time goal, or +/- a counted goal (e.g. gym 2/3) → percentages update → activity feed shows it.

**Nudge:** see a squadmate's unfinished goal → tap `Nudge` → they get a notification and see you're cheering them on → that goal shows "Nudged". You can nudge up to three of their goals a day.

**Notifications:** add the site to the home screen (iPhone) → open it → turn notifications on in the dashboard card or settings → hear about goals added, goals finished and nudges → on Sunday evening, get the prompt and tap it to lock in next week.

**Recap:** open a finished week → see completed and unfinished goals per member and the squad percentage → tap through to plan next week. Earlier weeks stay browsable.

---

## 7. Screens

1. **Welcome / auth:** name, tagline, `Create Squad` and `Join Squad`, sign-up/sign-in, display name, `Forgot password?` with its two screens (request a link, set a new password).
2. **Squad dashboard (home):** squad name, Monday–Sunday date range, squad progress, member cards (name, percentage, goals), quick add-goal and log-progress on your own goals, `Nudge` on squadmates' unfinished goals, This week / Next week / Week after switch, the Sunday "Start planning next week now" card, carry-over suggestions inside your own card, a dismissible card to turn notifications on, recent activity, link to past weeks.
3. **Goal editor:** a panel that drops from the top of the screen: Cancel, title and Save/Add in its header; then title (required, focused straight away for a new goal, Enter saves), type (one-time or counted), target (integer ≥ 1) and unit label for counted goals, optional notes, the week, and remove.
4. **Weekly recap:** week dates, per-member completed vs committed, squad percentage, completed and unfinished lists, button to plan next week.
5. **Squad settings:** members, invite sharing, notifications for this device (with the iPhone home-screen steps), your name, squad name and time zone (owner), leave squad, sign out.
6. **Your squads:** every squad you're in (name and members), `Start another squad`, `Join a squad with a code`. Reached by the back arrow at the top left of a squad; it is home when you're in two or more.

**Every page starts with the same top bar** (`AppHeader` in the root layout, so new pages get it for free): the Accountably logo with its name at the top left, the light/dark toggle at the top right. Below it, the squad dashboard header reads, left to right: back arrow, squad name and week, settings.

### Visual direction

- Friendly, focused, energetic, minimal.
- **Built for phones.** Most people will use this on a phone, so design and check every screen at phone width first (320–430px): one column, thumb-reachable actions, tap targets at least 44px, bottom sheets instead of modals for things you only read or tap, 16px inputs so iOS doesn't zoom. **Anything you type into goes at the top of the screen, never in a bottom sheet:** the iPhone keyboard covers the bottom half and shoves bottom sheets around. The goal editor is the pattern to copy (`components/app/goal-editor.tsx`): fixed to the top, sized to the visible area above the keyboard, scrolls inside itself, primary action in the header. Desktop only needs to look tidy: the same column, centred.
- **Clean, not AI-looking.** Use the component library (shadcn/ui, see section 8) instead of hand-rolled widgets, restyled with our own tokens so it doesn't look like a stock template. No gradients, glows, glass effects, emoji as icons, or filler copy. Flat surfaces, hairline borders, hierarchy from type and spacing.
- Cards and large progress indicators.
- Clear difference between **my goals** (editable) and **friends' goals** (view only).
- Celebrate completion briefly; no distracting animation.
- Warm neutral interface with one accent colour: **cobalt blue** (`--primary` in `app/globals.css`). Light and dark themes.
- **Theming rule: never write a literal colour in a component.** Every colour is a CSS variable in `app/globals.css`, defined once under `:root` (light) and once under `.dark`. Use the token classes (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `bg-primary`, `bg-accent`, `text-success`, `text-destructive`) and both themes follow. Adding a colour means adding a token in both blocks. The whole mechanism is `lib/theme.ts` (a `dark` class on `<html>`, remembered in localStorage, set before first paint by an inline script in `app/layout.tsx`) plus `components/app/theme-toggle.tsx`. With nothing saved, the device's own setting decides.
- **Green means a win, and only that.** In the activity feed, a finished goal and a counted goal moving forward (a sub-goal done) are shown in green with a tick (`--success`), so progress stands out at a glance. A count taken back down, edits, removals and lock-ins stay neutral. Don't use green anywhere else. The rule is `isProgressWin` in `lib/domain/activity.ts`.
- Type: Bricolage Grotesque for headings and big numbers, Hanken Grotesk for body text.
- **Brand artwork** lives in `brand/` (supplied by the owner 2026-11-16): `icon.png` (the app icon), `logo-light.png` (icon + navy name, transparent, for light backgrounds) and `logo-dark.png` (icon + white name, transparent, for dark backgrounds). Never redraw or recolour the logo in code. `node scripts/make-icons.mjs` turns those three files into everything the app uses: the header logos in `public/brand/`, the home-screen and browser icons, and the notification badge. To rebrand, replace the files in `brand/` and run the script. The header shows both logo versions and CSS picks the one for the current theme (`Logo` in `components/app/bits.tsx`).

### Voice

- Warm, casual, direct: a friend, not a coach or a corporate tool.
- Celebrate squad wins; report misses neutrally ("2 of 4 done").
- Avoid "optimize", "KPIs", "performance", "users".

---

## 8. Tech stack

- **Frontend:** Next.js 16 (App Router) + TypeScript (strict). `cacheComponents` is off on purpose (see `next.config.ts`): with it on, Next.js keeps earlier pages mounted but hidden, which would hold a typed password or a previous account's squad in memory. Account changes (sign in, sign out, join, leave) use a full page load via `startFresh` in `lib/navigate.ts` for the same reason. This version differs from older Next.js: read the bundled docs in `node_modules/next/dist/docs/` before using a framework API (see `AGENTS.md`).
- **Styling:** Tailwind CSS v4
- **UI library:** shadcn/ui on Radix primitives (`components/ui/`), icons from lucide-react, bottom sheets from vaul, toasts from sonner. Add components with `npx shadcn@latest add <name>`. App-specific components live in `components/app/`. Use `size="touch"` on buttons for primary phone actions.
- **Backend:** Supabase: Auth, Postgres, row-level security, Realtime
- **Hosting:** Vercel
- **Tests:** Vitest for domain logic, Playwright for the two-user core loop
- **Analytics:** a few privacy-conscious product events only
- **Notifications:** Web Push. `public/sw.js` shows them; `lib/push.ts` signs a device up; the `push-dispatch` Supabase Edge Function (`supabase/functions/`) sends them; `pg_net` pings it from the database and `pg_cron` runs the hourly Sunday-prompt job. The VAPID private key lives only in Supabase secrets.
- **Install:** `app/manifest.ts` + icons (`node scripts/make-icons.mjs` regenerates them from `brand/`). iPhones keep the icon from the moment the site was added to the home screen; to get a new icon, remove it and add it again.
- **Later:** AI coaching

### Security

- An RLS policy on every private table. All squad reads require active membership.
- Goal writes require ownership and an open week.
- The Supabase service-role key never reaches client code.
- Rate-limit invite attempts and nudges.
- The push sender only runs when pinged by the database with a secret the database generated; strangers get a 401.

### Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run lint       # lint
npm run typecheck  # next typegen && tsc --noEmit
npm test           # unit tests (Vitest, lib/**/*.test.ts)
```

- `npm run e2e` (Playwright, two-user loop) is not set up yet; it needs the Supabase project first.
- On Windows, run Vitest from a path with an upper-case drive letter (`C:\...`, as PowerShell gives you). From `/c/...` in Git Bash every suite fails with "Cannot read properties of undefined (reading 'config')".
- Database: project ref `uyiawlmqzrgerhcfyjdi` (already linked). `supabase db push` applies `supabase/migrations/`. `supabase db query --linked "<sql>"` runs SQL.
- Edge function: `supabase functions deploy push-dispatch --no-verify-jwt --use-api`.
- **`supabase config push` applies without asking.** It overwrites the project's Auth and Storage settings with whatever is in `supabase/config.toml`. Since 2026-11-15 that file matches the live project, so a push only changes what you edit in it; get the owner's go-ahead first, change one thing at a time, read the diff it prints, and run it a second time to confirm "up to date". If in doubt, change the setting in the dashboard and mirror it in the file.
- Live backend check: `node scripts/smoke-backend.mjs` with `SUPABASE_SERVICE_ROLE_KEY` set in the shell. It creates throwaway accounts, checks sign-up, invites, privacy between accounts, goals, lock-in, activity, realtime, nudges and the push pipeline, then deletes them.
- When writing files from Git Bash, don't put backticks inside a double-quoted `node -e "..."`: the shell runs them as commands. Use the Edit/Write tools.

### Architecture

- Screens are client components that talk to the backend through one interface, `Store` in `lib/data/store.ts`. One implementation, `supabase-store.ts`. There is no demo mode (removed 2026-11-15): every screen needs a real account.
- The browser uses only the public Supabase key. Every rule that matters (membership, ownership, open week, 5-member cap, invite checks, activity events) is enforced in Postgres by RLS, triggers and security-definer functions in `supabase/migrations/`. The app reuses the same rules through `lib/domain/` for what it shows.
- Progress is saved as an absolute count after a short debounce, so repeated taps or retries can't double-count.
- Routes: `/` welcome, `/auth`, `/auth/forgot-password`, `/auth/reset-password`, `/join` (join or create; invite links are `/join?code=…`), `/squad` home (see the home rule), `/squad?id=…` a squad's dashboard, `/squad/settings?id=…`, `/squads` the list of your squads.

### Code conventions

- Domain logic (week boundaries, progress maths, limits, cooldowns) lives in pure functions under `lib/domain/` with unit tests. UI and server code call these; they don't reimplement them.
- Test week boundaries with explicit dates, including DST changes and members in different time zones.
- Test progress maths for partial, empty, and "not locked in" cases.
- Schema changes go in SQL migrations under `supabase/migrations/`, with RLS policies in the same migration as the table.
- No `any` without a comment explaining why.
- Lint, typecheck, and tests pass before a change is called done.
- Small commits that say what changed and why.

---

## 9. Data model

Conceptual; names can change during implementation.

**`profiles`**: `id` (auth user id, PK), `display_name`, `avatar_url?`, `created_at`

**`squads`**: `id`, `name`, `timezone` (IANA), `created_by` → profiles, `created_at`

**`squad_members`**: `squad_id`, `user_id`, `role` (`owner` | `member`), `joined_at`, `left_at?`; one active membership per squad + user

**`squad_invites`**: `id`, `squad_id`, `code_hash`, `expires_at`, `revoked_at?`, `created_at`

**`weeks`**: `id`, `squad_id`, `week_start_date` (Monday, squad time), `status` (`open` | `closed`); unique `(squad_id, week_start_date)`

**`goals`**: `id`, `week_id`, `squad_id`, `owner_id`, `title`, `description?`, `goal_type` (`one_time` | `counted`), `target_count` (≥ 1; 1 for one-time), `completed_count` (default 0), `unit_label?`, `locked_in_at?`, `created_at`, `updated_at`; check constraints on the counts

**`activity_events`**: `id`, `squad_id`, `actor_id`, `goal_id?`, `event_type` (`goal_created` | `goal_edited` | `goal_deleted` | `progress_updated` | `goal_completed` | `goal_reopened` | `locked_in`), `metadata` (small, non-sensitive JSON: `title`, `completed_count`, `target_count`, and on updates `previous_count`), `created_at`

**`nudges`**: `id`, `squad_id`, `goal_id`, `sender_id`, `recipient_id`, `created_at`; readable only by sender and recipient

**`push_subscriptions`**: `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent?`, `created_at`; one row per device with notifications on, readable only by its owner

**`notification_outbox`**: `id`, `user_id`, `title`, `body`, `url`, `tag?`, `created_at`, `claimed_at?`; no client access

**`weekly_prompts`**: `squad_id`, `week_start_date`, `sent_at`; stops the Sunday prompt going out twice

**`private.config`**: the push sender's URL and shared secret; not reachable through the API

**P1 tables:** `check_ins`, `notification_preferences`

### Example goals

For placeholders, tests and docs, use everyday examples such as: Gym · Meal prep · Read for seminar · Call the bank · Sort out my resume. Squad name example: "Sunday Lock-In Crew". Never use real people's names or initials. Goals people write are often vague; the app must not turn them into quantities on anyone's behalf.

---

## 10. Decisions

Defaults so building isn't blocked. Change them here if you decide otherwise.

| Question | Default |
|---|---|
| Squads per person | Any number (changed 2026-11-15). One squad opens directly; two or more show the chooser first |
| Theme | Light and dark, toggled per device; follows the device setting until chosen |
| Who can rename and manage invites | Owner renames and revokes; any member can share the invite |
| Edit goals after lock-in | Yes, with the edit visible in the activity feed |
| Daily check-in required | No |
| Proof of completion | No |
| Comments or reactions on goals | No comments or reactions. Nudges only |
| Notifications | Opt-in web push per device: goal added, goal finished, counted goal moved forward, nudge, Sunday prompt |
| Platform | Website that installs to the home screen. No app-store app |
| Squad streak rule (P1) | A week counts when every member locked in and completed all their goals. Confirm before building. |
| Nudge allowance | Three per sender → recipient per 24 hours, each on a different goal (changed 2026-11-16 from one) |
| Progress percentage | Front-loaded curve, exponent 2 (decided 2026-11-16); counts stay literal |
| Notify on counted-goal steps | Yes, every step forward (decided 2026-11-16) |
| Monetisation | Undecided; not a build concern |
| Sign-in | Email + password. "Confirm email" is turned off on the Supabase project (decided 2026-11-15) so sign-up signs you in at once. Turn it back on once there is a real URL and email sender; the app handles both |
| Sunday prompt time | 18:00 Sunday in the squad's zone (`v_prompt_hour` in the notifications migration) |
| Who gets the Sunday prompt | Only members with no goals yet for the coming week |
| Nudge visibility | Private to sender and recipient; not in the activity feed |
| Carry-over | Suggested, never automatic (decided 2026-11-15). One tap adds all, one tap drops one |
| How far ahead you can plan | This week plus two more |
| Where carry-over dismissals live | On the device only. Move to the database if people complain that a crossed-off goal reappears on another device |
| Accent colour | Cobalt blue |
| Invite codes | 10 characters, valid 7 days, stored hashed. Because a code can't be read back, sharing makes a fresh code; the owner can cancel all outstanding ones |
| Owner leaves | The longest-standing member becomes owner |
| `weeks.status` column | Dropped. Open/closed is always worked out from the date, so there is no stored flag to go stale. Each week row keeps the time zone it was created in |
| Extra activity types | `goal_deleted` and `locked_in` added to the list in section 9, so removals and lock-ins are visible to the squad |
| Demo mode | Removed (2026-11-15). The app is account-only |

---

## 11. Build plan

### Status (2026-11-15)

- **Working against the live Supabase project, checked in the browser with real accounts:** sign-up, sign-in, sign-out, create squad, invite link and code, join, goals (add, edit, remove, done, undo, count), lock-in, progress, activity feed, live updates between accounts, nudges with cooldown, settings, This week / Next week / Week after, carry-over, the Sunday card.
- **Checked by `scripts/smoke-backend.mjs` on the live project:** privacy between accounts (outsiders see nothing; squadmates can't edit each other's goals), owner-only actions, leaving, and the notification pipeline as far as a real push service.
- **Built but only provable on a real phone:** a notification actually appearing (needs the site on HTTPS and, on iPhone, Add to Home Screen), and the Sunday prompt arriving at 18:00.
- **Built 2026-11-20:** History (`/squad/history?id=…`, `&view=me` for Just me) and Week recap (`/squad/recap?id=…&week=YYYY-MM-DD`), reached by the clock icon on the dashboard. All maths in `lib/domain/history.ts`. Percentages there use the same boosted curve as the dashboard, so a week reads the same everywhere; counts stay literal. Checked in the browser with real data (first week, nothing closed yet) and with temporary in-browser sample weeks for the closed-week views.
- **Not built yet:** Playwright tests, squad streak, daily check-ins, per-type notification choices, a custom email sender (SMTP) for password-reset emails.

### Live site

- **https://accountably-wine.vercel.app** (Vercel project `accountably`, Hobby plan, account `karimazer`), first deployed 2026-11-15.
- Redeploy after changes: `npx vercel deploy --prod --yes`. There is no Git connection, so nothing deploys by itself.
- The three `NEXT_PUBLIC_…` values are set on the Vercel project for Production. `supabase/` and `scripts/` are left out of the upload (`.vercelignore`).

### Publishing checklist

1. Deploy to Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` from `.env.local`.
2. In Supabase → Authentication → URL Configuration, set Site URL to the published address. (Done 2026-11-15: Site URL is `https://accountably-wine.vercel.app`, and its `/auth/reset-password` plus the two localhost ones are allowed redirects. If the address ever changes, update both.)
3. On an iPhone: open the site in Safari, Add to Home Screen, open it from there, sign in, turn notifications on in settings. Then have a squadmate finish a goal.

### Phase 1: vertical slice

1. Scaffold the project, auth, database, and RLS policies.
2. Create or join one private squad with an invite code.
3. ~~Seed/demo mode~~ (built, then removed on 2026-11-15).
4. Goal create, edit, delete, complete, count, and undo.
5. Shared squad dashboard with realtime updates.
6. Verify privacy across accounts and usability on a phone.

**Done when:** two people on separate devices can join one private squad, set goals, update progress independently, and see each other's changes correctly.

### Phase 2: weekly loop

1. Monday–Sunday weeks and week navigation.
2. Lock-in action and commitment state.
3. Member and squad progress calculations.
4. Activity feed and recap for finished weeks.
5. Error handling and edge-case tests.

**Done when:** the same squad can finish a week, see an accurate recap, and start a new week without losing history.

### Phase 3: retention experiments (P1)

Optional daily check-ins, squad streak once the rule is confirmed, per-type notification choices. (Nudges, notifications and the Sunday prompt are already built.)

---

## 12. MVP definition of done

- [ ] Create an account and sign in securely
- [ ] Create a squad and invite a second person
- [ ] Only squad members can access squad content
- [ ] Every member can create one-time and counted weekly goals
- [ ] Members can complete, increment, and undo their own goals
- [ ] Other members see updates on separate devices
- [ ] Member and squad progress are correct for partial and empty states
- [ ] Week transitions keep complete history
- [ ] The recap matches the week's final state
- [ ] Loading, error, empty, and slow-connection states are handled
- [ ] Layout works on common phone widths
- [ ] Two people can complete a full weekly cycle without developer help

---

## 13. Validation

**First test:** the first squad uses it for 4 consecutive weeks, then 3–5 more squads.

**North star:** weekly active squads with at least two members completing the lock-in → progress → recap cycle.

**Track:** activation (joined a squad and added a goal), weekly participation, week-2 and week-4 retention, goal completion rate, squads with 2+ active members after four weeks.

**Question to answer:** does a friend seeing your progress change follow-through compared with texts or notes?

---

## When in doubt

Ask whether the change makes the weekly lock-in and recap loop better for a small squad of friends. If it doesn't, leave it out.
