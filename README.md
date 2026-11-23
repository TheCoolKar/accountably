# Accountably

Lock in together: weekly goals with a small squad of friends.

`CLAUDE.md` is the product and build spec. Start there.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. The live site is https://accountably-wine.vercel.app.

To run it locally, copy `.env.example` to `.env.local`, fill in your Supabase project values, and apply the schema with `supabase link` then `supabase db push`.

## Password reset

Sign in → **Forgot password?** sends a Supabase recovery email. Its link opens
`/auth/reset-password`, where the person can choose and confirm a new password
(at least 8 characters). Missing or expired sessions offer a fresh reset link.

In the hosted Supabase dashboard, open **Authentication → URL Configuration** and
add these **Redirect URLs**:

- `http://localhost:3000/auth/reset-password`
- `https://accountably-wine.vercel.app/auth/reset-password`
- `https://<your-custom-domain>/auth/reset-password` when using a custom domain

Use the standard recovery email template with `{{ .ConfirmationURL }}` so Supabase
verifies the link before redirecting back. Configure a production email sender
in Supabase for delivery to your users. Local Supabase captures recovery emails
at `http://127.0.0.1:54324`.

Do not run `supabase config push` against the hosted project; it overwrites Auth
settings with local defaults. Set hosted redirect URLs in the dashboard instead.
See [Supabase's password recovery guide](https://supabase.com/docs/guides/auth/passwords#resetting-a-password)
for the email and redirect configuration.
