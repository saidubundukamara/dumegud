# Google sign-in setup

DuMeGud's Google sign-in is already built (`auth.ts`, Auth.js v5). It switches on when both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set. Without them, only email + password sign-in is offered.

The address Google sends people back to after sign-in (the **redirect URI**) is always:

```
<origin>/api/auth/callback/google
```

## Part 1: Localhost

### 1. Pick the project

In [Google Cloud Console](https://console.cloud.google.com), choose **dumegud** from the project picker at the top.

### 2. Set up the OAuth consent screen

Go to **APIs & Services → OAuth consent screen**. In newer consoles it's called **Google Auth Platform → Branding**.

- **App name:** `DuMeGud`
- **User support email** and **developer contact:** your email
- **Audience / user type:** External
- **Scopes (Data Access):** add only these three. They're basic scopes, so Google doesn't need to review the app.
  - `openid`
  - `.../auth/userinfo.email`
  - `.../auth/userinfo.profile`
- **Publishing status:** leave it on **Testing**. Add your own Google account(s) under **Test users**, because only test users can sign in while the app is in Testing.
- **Authorized domains:** leave this empty for now. Google doesn't accept localhost there.

### 3. Create the OAuth client

Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, or **Google Auth Platform → Clients**.

| Field | Value |
| --- | --- |
| Application type | Web application |
| Name | `DuMeGud – local dev` |
| Authorized JavaScript origins | `http://localhost:3000` |
| Authorized redirect URIs | `http://localhost:3000/api/auth/callback/google` |

Click **Create**, then copy the **Client ID** and **Client secret**. Download the JSON as well, because the secret may only be shown once.

> Use `localhost`, not `127.0.0.1`, and open the app at exactly that address. If you run on a different port, add that origin and redirect URI too.

### 4. Add the keys to `.env.local`

```bash
AUTH_SECRET=...            # openssl rand -base64 32 (skip if already set)
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=xxxx.apps.googleusercontent.com
AUTH_GOOGLE_SECRET=xxxx
```

Restart `npm run dev`. The **Continue with Google** button only shows up once both Google values are set.

### 5. Test it

Open http://localhost:3000, go to sign in, choose **Continue with Google** and use a test-user account.

**Troubleshooting**

- **`redirect_uri_mismatch`:** the redirect URI in Google doesn't exactly match what the app sends. Check the port, http vs https, and any trailing slash.
- **`access_denied` / "app has not completed verification":** the Google account isn't listed under Test users.
- **Sign-in refused for an email that already has a password account:** this is intended. The app never links a Google login to an existing password account just because the email matches.

## Part 2: Production domain (later)

### 6. Create a second OAuth client for production

Keep it separate from the dev client, so you can change dev keys without breaking the live site.

| Field | Value |
| --- | --- |
| Name | `DuMeGud – production` |
| Authorized JavaScript origins | `https://dumegud.com` (plus `https://www.dumegud.com` if used) |
| Authorized redirect URIs | `https://dumegud.com/api/auth/callback/google` (plus the www version if used) |

> **Vercel preview deployments** get a new URL on each deploy, and Google doesn't accept wildcards. Either leave Google sign-in off on previews, or set up one fixed staging address and add it to the client.

### 7. Prepare the consent screen for launch

- Add `dumegud.com` under **Authorized domains**, and verify it in Google Search Console if asked.
- Add links to your homepage, privacy policy and terms pages.
- If you upload a logo, Google reviews your branding, which takes a few days.
- Click **Publish app** to move from Testing to In production. Until you do, only test users can sign in.

### 8. Add the production keys in Vercel

Under the **Production** environment only, set:

- `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` from the **production** client
- `AUTH_SECRET`, with a different value from your local one

Then redeploy.

## Checklist

- [ ] Consent screen set up (External, basic scopes, test users added)
- [ ] Dev OAuth client created with the localhost origin and redirect URI
- [ ] `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` in `.env.local`, dev server restarted
- [ ] Google sign-in works locally
- [ ] Production OAuth client created with the domain origin and redirect URI
- [ ] Authorized domain, policy links and terms added; app published
- [ ] Production keys set in Vercel and the site redeployed
- [ ] Google sign-in works on `https://dumegud.com` with an account that isn't a test user
