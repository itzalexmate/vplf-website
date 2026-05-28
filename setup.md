# VPLF Ticket System Setup

This version is built for Vercel. It uses:

- Static frontend files at the project root.
- Vercel Node.js Functions in `/api`.
- Discord OAuth2 login.
- Staff access by Discord user ID.
- Postgres storage through Vercel Marketplace storage.

## 1. Install

```powershell
npm install
```

## 2. Create A Discord Application

1. Go to the Discord Developer Portal.
2. Create an application for `VPLF Ticket System`.
3. Open `OAuth2`.
4. Copy the `Client ID`.
5. Reset/copy the `Client Secret`.
6. Add these Redirects:

Local:

```text
http://localhost:3000/api/auth/callback
```

Production:

```text
https://your-domain.com/api/auth/callback
```

The app requests the `identify` scope so it can read the Discord user ID, username, and avatar.

## 3. Get Staff Discord IDs

1. In Discord, enable Developer Mode.
2. Right-click each staff member.
3. Click `Copy User ID`.
4. Put the IDs into `DISCORD_STAFF_IDS`, separated by commas.

Example:

```text
DISCORD_STAFF_IDS=123456789012345678,987654321098765432
```

Only those Discord accounts can open the League Console.

## 4. Local Environment

Create `.env.local` from `.env.example`.

```powershell
Copy-Item .env.example .env.local
```

Fill these values:

```text
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback
DISCORD_STAFF_IDS=your_discord_id_here
SESSION_SECRET=make_this_long_random_and_private
APP_URL=http://localhost:3000
POSTGRES_URL=
DATABASE_URL=
```

For local testing, `POSTGRES_URL` can be blank. The app will use `.local-data/tickets.json`.

## 5. Run Locally

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

If you change `.env.local` while the dev server is running, stop it and run `npm run dev` again.

## 6. Add Postgres On Vercel

For production, do not use local JSON or SQLite. Vercel serverless functions need an external database.

Recommended setup:

1. Open the Vercel project dashboard.
2. Go to `Storage` or `Marketplace`.
3. Add a Postgres provider such as Neon, Supabase, Prisma Postgres, or another Vercel Marketplace Postgres integration.
4. Connect it to this project.
5. Make sure Vercel injects a `POSTGRES_URL` environment variable. `DATABASE_URL` also works if your provider uses that name.

The app creates the `vplf_tickets` table automatically on first API use.

## 7. Vercel Environment Variables

In Vercel, open:

```text
Project > Settings > Environment Variables
```

Add these for Production and Preview:

```text
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
DISCORD_REDIRECT_URI=https://your-domain.com/api/auth/callback
DISCORD_STAFF_IDS=comma_separated_staff_discord_ids
SESSION_SECRET=make_this_long_random_and_private
APP_URL=https://your-domain.com
POSTGRES_URL=your_postgres_connection_string
DATABASE_URL=optional_if_your_provider_uses_this_instead
```

Use your Vercel preview URL for Preview redirects if you want Discord OAuth to work on preview deployments.

## 8. Deploy

```powershell
vercel
```

For production:

```powershell
vercel --prod
```

You can also deploy through GitHub by importing the repo into Vercel.

## 9. Domain Setup

1. Add your domain in Vercel.
2. Update `APP_URL` to the final domain.
3. Update `DISCORD_REDIRECT_URI` to:

```text
https://your-domain.com/api/auth/callback
```

4. Add the same redirect URL in the Discord Developer Portal.
5. Redeploy.

The redirect URI must end with `/api/auth/callback`. Do not use `/api/auth/discord`; that route only starts the login.

## 10. Useful Files

- `index.html` - app shell and onboarding/ticket/console views.
- `styles.css` - full esports UI system.
- `script.js` - frontend state, OAuth session checks, ticket rendering.
- `api/auth/discord.js` - starts Discord OAuth.
- `api/auth/callback.js` - handles Discord OAuth callback.
- `api/me.js` - returns the logged-in Discord user.
- `api/tickets/index.js` - create/list tickets.
- `api/tickets/[id].js` - approve/delete tickets.
- `lib/auth.js` - signed session cookies and staff checks.
- `lib/storage.js` - Postgres storage and local dev fallback.

## 11. References

- Discord OAuth2 docs: https://docs.discord.com/developers/topics/oauth2
- Discord OAuth2 and scopes: https://docs.discord.com/developers/platform/oauth2-and-permissions
- Vercel Functions docs: https://vercel.com/docs/functions/runtimes/node-js
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel Postgres storage: https://vercel.com/docs/storage/vercel-postgres
