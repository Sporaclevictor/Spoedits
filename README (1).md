# Spoedit (Firebase version)

Files (all in the top level of your project, no folders needed):
- `index.html` the public site
- `admin.html` the admin page (`/admin`)
- `firebase-config.js` YOUR Firebase settings (you edit this one)
- `firestore.rules` the security rules (you paste these into Firebase)
- `vercel.json` Vercel settings

## Setup (about 15 minutes, works on a phone)

### A. Create the Firebase project
1. Go to console.firebase.google.com and sign in with Google. Tap **Create a project**, name it `spoedit`, turn Google Analytics off, tap Create.
2. **Authentication**: tap Build > Authentication > Get started > **Sign-in method**. Switch on **Email/Password** and **Anonymous**. Save both.
3. **Firestore**: tap Build > Firestore Database > Create database. Pick a location near Nigeria (europe-west is fine) and choose **Production mode**.
4. **Rules**: in Firestore open the **Rules** tab, delete everything, paste the full contents of `firestore.rules`, tap **Publish**.
5. **Web app settings**: tap the gear icon > Project settings > scroll to Your apps > tap the **</>** (web) icon, give it any name, tap Register app.
   Copy the four values: apiKey, authDomain, projectId, appId.

### B. Put your settings in the site
6. Open `firebase-config.js` (on GitHub: tap the file, then the pencil icon) and replace the four PASTE_... values with yours. Commit.
7. Upload/replace `index.html`, `admin.html`, `firebase-config.js`, `firestore.rules`, `vercel.json` in your GitHub repo. Delete the old `api` folder and `package.json` if they are still there. Vercel redeploys by itself.
8. If sign-in ever shows "unauthorized domain": Firebase > Authentication > Settings > Authorized domains > Add your `xxxx.vercel.app` domain.

### C. Create your admin account
9. Open `yoursite.vercel.app/admin`. You will see **Create your admin account**. Enter your email and a password (8+ characters).
   Do this right away. Only the first person to do it becomes admin, and nobody can create a second owner afterwards.
10. Forgot your password later? Tap "Forgot your password?" and Firebase emails you a reset link.

## Updating from the earlier version (do this once)
1. Replace all five files in your repo (keep your own `firebase-config.js` values).
2. In Firebase > Firestore > **Rules**, paste the NEW `firestore.rules` and tap **Publish**. The old rules will block units.
3. In Firestore > **Data**, delete the old `users` and `payments` collections (tap the three dots next to the name > Delete collection).
   They use the old format. Real customers sign up again and start fresh. Keep `admins`, `meta` and `settings`.

## How units work
- Everyone can try the tools with 2 free watermarked downloads. After that they **create an account** (name, email, password) and **buy units**.
- 1 unit costs the amount you set (default ₦100). Each tool costs a number of units that you set (default 5 per download). Units never expire.
- Buying: customer picks a pack or types a number, pays by Kuda bank transfer or WhatsApp, taps "I've paid". You confirm in `/admin`; the units appear on their account straight away.
- Forgot password: the customer taps "Forgot your password?" on the login form and Firebase emails a reset link.

## Using the admin page
- **Payments:** pending purchases appear live ("customer says paid"). Tap **Confirm payment** once the money is in your account; the customer gets the units.
- **Unit price:** change what one unit costs (−10 / +10 or type it, then Save).
- **Cost of each service (in units):** change what each tool costs, with −1 / +1. It shows the naira value next to it.
- **Payment options:** bank transfer and WhatsApp on or off, Kuda details, WhatsApp number.
- **Users:** search by name, email or phone, add or remove units, ban or unban.

## Receipts and invoices
Upload your company logo, seal or stamp, the owner's signature and the manager's signature (all optional), and type the manager's name.
The manager's name appears as "Issued by" and under the manager signature. Tip: sign on plain white paper, photograph it and upload it; the white paper disappears.
If you have no seal, tick "Add a round official stamp automatically". Receipts also carry a large PAID mark.

## If photo upload fails on your phone
- Tap **Choose File** and pick the photo. If the page refreshes by itself, a yellow notice explains that the phone ran low on memory. Close other browser tabs and try again.
- Use the small links under the button: **Choose from Files** or **Take a photo now**.

## Good to know
- Until `firebase-config.js` is filled in, the site still works: every tool runs and visitors get 2 free watermarked downloads on their own device. Payments, price changes and bans need Firebase.
- Photos and documents are processed in the visitor's phone, not on a server. A technical person could strip the watermark by editing the page. Full protection needs server-side processing (a paid Firebase plan).
- Each visitor starts as an anonymous Firebase user. Someone who clears their browser data can get a fresh 2 free trials, but units live on the account, so they are safe once the customer has signed up.
- To change how many free trials new visitors get, change `free == 2` in `firestore.rules` and `free:2` in `index.html`.
- Invoices and receipts hold up to 10 line items on one page.
- The ID card tool is for organisation, school, staff, member and event cards. It refuses government-style cards.
