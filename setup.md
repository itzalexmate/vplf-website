# VPLF Ticket System Setup

This version is built for Vercel. It uses:

- Static frontend files at the project root.
- Vercel Node.js Functions in `/api`.
- Discord OAuth2 login.
- Staff access by Discord user ID.
- Postgres storage through Vercel Marketplace storage.
- Stored review history for approved, denied, and rejected tickets.
- Automatic daily batches plus staff-assigned manual batches.

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

The app creates and updates the `vplf_tickets` table automatically on first API use. Existing rows are kept; new columns for review history and batches are added without deleting tickets.

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
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_gmail_system_account@gmail.com
SMTP_PASS=your_16_character_google_app_password
SMTP_FROM=VPLF Ticket System <your_gmail_system_account@gmail.com>
DISCORD_BOT_TOKEN=your_discord_bot_token_for_optional_dms
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

## 10. OAuth Troubleshooting

If Discord login fails, the app now shows a dark error page instead of a blank white loading screen.

Check these first:

- `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` exist in the same Vercel environment you are testing.
- `DISCORD_REDIRECT_URI` exactly matches one Redirect in the Discord Developer Portal.
- The redirect uses your current domain and ends with `/api/auth/callback`.
- After changing Vercel environment variables, redeploy the project.

## 11. Optional Notifications

Players must explicitly opt in on each claim before any notice is sent.

Email notices:

1. Create or choose a Gmail system account.
2. Enable 2-Step Verification on that Google account.
3. Create a Google App Password for mail.
4. Put the app password in `SMTP_PASS`.
5. Use the Gmail address as `SMTP_USER` and `SMTP_FROM`.

Discord DM notices:

1. Create a Discord bot in the same Developer Portal application, or use a dedicated notification bot.
2. Copy the bot token into `DISCORD_BOT_TOKEN`.
3. Invite the bot to your league server.
4. The app only sends DMs to users who checked the Discord DM opt-in box.

This avoids selfbots and user-token automation. DMs can still fail if a user blocks the bot or has privacy settings that prevent the bot from creating a DM.

## 12. Useful Files

- `index.html` - app shell and home/ticket/console views.
- `styles.css` - full esports UI system.
- `script.js` - frontend state, OAuth session checks, ticket rendering.
- `api/auth/discord.js` - starts Discord OAuth.
- `api/auth/callback.js` - handles Discord OAuth callback.
- `api/me.js` - returns the logged-in Discord user.
- `api/tickets/index.js` - create/list tickets.
- `api/tickets/[id].js` - review tickets and move them between automatic/manual batches.
- `lib/auth.js` - signed session cookies and staff checks.
- `lib/storage.js` - Postgres storage and local dev fallback.

## 13. References

- Discord OAuth2 docs: https://docs.discord.com/developers/topics/oauth2
- Discord OAuth2 and scopes: https://docs.discord.com/developers/platform/oauth2-and-permissions
- Discord channel/message API docs: https://docs.discord.com/developers/resources/channel
- Nodemailer Gmail guide: https://nodemailer.com/guides/using-gmail
- Google app passwords help: https://support.google.com/mail/answer/185833
- Vercel Functions docs: https://vercel.com/docs/functions/runtimes/node-js
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel Postgres storage: https://vercel.com/docs/storage/vercel-postgres
