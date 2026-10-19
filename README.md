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

## Using the admin page
- **Payments:** pending payments appear live, marked "customer says paid" once the customer taps I've paid. Tap **Confirm payment** after the money reaches your account. The customer gets one clean download for that tool.
- **Prices & users:** change each service price (−50 / +50 or type it, then Save), turn bank transfer or WhatsApp on or off, edit the Kuda details and WhatsApp number, ban or unban users, add or remove credits by hand.

## Good to know
- Until `firebase-config.js` is filled in, the site still works: every tool runs and visitors get 2 free watermarked downloads on their own device. Payments, price changes and bans need Firebase.
- Photos and documents are processed in the visitor's phone, not on a server. A technical person could strip the watermark by editing the page. Full protection needs server-side processing (a paid Firebase plan).
- Each visitor is an anonymous Firebase user. Someone who clears their browser data can get a fresh 2 free trials.
- To change how many free trials new visitors get, change `free == 2` in `firestore.rules` and `free:2` in `index.html`.
- The ID card tool is for organisation, school, staff, member and event cards. It refuses government-style cards.
