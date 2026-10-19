# Spoedit: deploy on Vercel

## Files in this project
```
index.html      the public site
admin.html      the admin page (/admin)
vercel.json     Vercel settings
package.json    Node version
api/server.js   the whole server in ONE file
```
`api/server.js` MUST sit inside a folder called `api` at the top level of the project.

## Upload and go
1. Put these files in a GitHub repo (keep it **private**), then on vercel.com choose **Add New > Project** and import it.
   Leave all build settings empty. Click Deploy. (Or run `npx vercel` inside the folder on a computer.)
2. **On a phone** you cannot upload folders. In GitHub use **Add file > Create new file**, type `api/server.js` as the file name
   (typing the `/` creates the folder), paste the contents of `server.js`, and commit. Upload the other four files normally.
3. The site works straight away: all tools run, and every visitor gets 2 free watermarked downloads.
4. Admin page: `yoursite.com/admin`. The first time you open it you create your admin account with your email and a password
   (needs the database below).

## Turn on payments, price changes and bans (2 minutes)
Without a database the site runs in trial-only mode. To switch on the full admin features:
1. In your Vercel project open **Storage > Create Database > Upstash Redis** (free plan) and connect it to the project.
2. Click **Redeploy** (Deployments > the three dots > Redeploy).
3. Open `/admin`. The yellow "Database not connected" notice disappears.

## Admin account
- **First time:** open `/admin`. If no admin exists yet you will see "Create your admin account". Enter your email and a password
  (8+ characters). Do this right after connecting the database, before sharing the link with anyone.
- **After that:** sign in with that email and password. In `/admin > Prices & users > Admin accounts` you can change your password
  or add another admin.
- **Forgot your password:** in Vercel add the environment variable `RESET_ADMIN` = `true`, redeploy, open `/admin` and create a new
  account. Then delete `RESET_ADMIN` and redeploy again.

## How payments work
Customers can pay two ways. You control both in `/admin > Prices & users > Payment options`.
- **Bank transfer (Kuda 2013463188):** the site shows the account number (with a Copy button), the amount and a reference.
  The customer transfers, then taps **I've paid**. The payment shows in `/admin > Payments` as "customer says paid".
- **WhatsApp:** opens a chat to your number with the reference and price.

When the money reaches your account, tap **Confirm payment**. The customer gets one clean download for that tool.
They tap **I've paid** again (it also checks automatically) and download without a watermark.

## Admin panels
- **Payments:** pending, confirmed and rejected payments, search, confirm or reject, revenue total.
- **Prices & users:** turn bank transfer or WhatsApp on or off, edit the bank name, account number, account name and WhatsApp number,
  change each service's price (−50 / +50 or type a number, then Save), ban or unban users,
  add or remove credits by hand.

## Good to know
- Photos and documents are processed in the visitor's browser. Very large phone photos are shrunk automatically
  so they upload and process smoothly.
- iPhone HEIC photos that a browser cannot open show a clear message asking for JPG or PNG.
- Always check you received the money before you confirm a payment.
- A determined technical user could strip the watermark by editing the page code. Full protection needs server-side processing.
- The ID card tool is for organisation, school, staff, member and event cards. It refuses government-style cards.

## If something does not work
Open `yoursite.vercel.app/api/server?route=health` in your browser. You should see `"version":"email-admin-v2"` and `"database":"connected"`.
- Page not found or "The server code was not found": `api/server.js` is missing or in the wrong place. It must be `api/server.js` at the top level, next to `index.html`. In Vercel, Settings > General > Root Directory must point at the folder that contains `index.html` and `api`.
- `database` says NOT connected or ERROR: connect the Upstash Redis database (Storage tab) to this project and redeploy.
- No `version` line: Vercel is still serving an old deployment. Deploy again and check the Deployments tab shows the new one as "Current".
