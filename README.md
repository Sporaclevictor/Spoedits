# Spoedit: deploy on Vercel

## Upload and go
1. Put this whole folder in a GitHub repo (keep it **private**), then on vercel.com choose
   **Add New > Project** and import it. Leave all build settings empty. Click Deploy.
   (Or run `npx vercel` inside the folder.)
2. The site works straight away: all tools run, and every visitor gets 2 free watermarked downloads.
3. Admin page: `yoursite.com/admin`  Password: `Sirprof123...`

## Turn on payments, price changes and bans (2 minutes)
Without a database the site runs in trial-only mode. To switch on the full admin features:
1. In your Vercel project open **Storage > Create Database > Upstash Redis** (free plan) and connect it to the project.
2. Click **Redeploy** (Deployments > the three dots > Redeploy).
3. Open `/admin`. The yellow "Database not connected" notice disappears.

## Change the admin password
The password is set in `api/admin.js` as a default. To change it without editing code, add an environment
variable `ADMIN_PASSWORD` in Vercel (Settings > Environment Variables) and redeploy. Pick something longer
and harder to guess than the default.

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
