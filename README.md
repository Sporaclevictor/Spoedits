# Spoedit: deploy on Vercel

## What is in this folder
- `index.html`: the public site (passport photo, blurry fix, iPhone look, poster, invoice and receipt, ID card, document editor)
- `admin.html`: your admin dashboard at `yoursite.com/admin`
- `api/`: the server code (credits, free trials, payments, bans, prices)
- `lib/core.js`, `vercel.json`, `package.json`: shared code and config

## Deploy (about 10 minutes)
1. Put this whole folder in a GitHub repo, then on vercel.com choose **Add New, Project** and import it.
   (Or run `npx vercel` inside the folder.) Leave every build setting empty.
2. In your Vercel project open **Storage**, then **Create Database**, then choose **Upstash Redis**
   (free plan is enough). Connect it to the project. Vercel adds the database variables for you.
3. Open **Settings, Environment Variables** and add:
   - `ADMIN_PASSWORD`: a long password only you know
   - `ADMIN_SECRET`: any long random text (used to sign admin sessions)
   - optional: `FREE_TRIALS` (default 2), `FREE_PER_IP` (default 10)
4. **Redeploy** (Deployments, the three dots, Redeploy) so the variables take effect.
5. Visit `/admin` and sign in.

## How payments work
1. A visitor uses a tool. After 2 free downloads (watermarked) the pay window opens.
2. They tap **Pay on WhatsApp**. The site creates a payment reference (e.g. SPO-1A2B3C) and opens
   WhatsApp to 09124154453 with that reference and the current price.
3. They pay you. In `/admin`, **Payments**, you tap **Confirm payment**. They get one clean download for that tool.
4. They tap **I've paid** on the site (it also checks automatically) and download without a watermark.

## Admin panels
- **Payments**: pending, confirmed and rejected payments, search, confirm or reject, revenue total.
- **Prices & users**: raise or lower each service's price (use −50 / +50 or type a number, then Save).
  Ban or unban users, and add or remove credits by hand (useful for refunds or gifts).
  New prices apply to new payment requests straight away.

## Know the limits
- Images and documents are processed in the visitor's browser. The server controls who may download
  and whether the watermark is applied, but a technically skilled person could still strip the watermark
  by editing the page code. For full protection you need server-side image processing.
- Users are identified by a browser ID (plus the WhatsApp number if they enter one). A banned person
  can switch browsers or clear their data. Bans on a phone number are harder to dodge.
- Always check that you received the money before you confirm. The admin page does not talk to your bank.
- ID card tool is for organisation, school, staff, member and event cards. It refuses government-style cards.
