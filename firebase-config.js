import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyC5EaHKHc4o3SG14KYHqiEu9NgQpIyhcB4",
  authDomain: "spoedits.firebaseapp.com",
  projectId: "spoedits",
  storageBucket: "spoedits.firebasestorage.app",
  messagingSenderId: "116524119512",
  appId: "1:116524119512:web:0a35b4604ee275c8dd2ead",
  measurementId: "G-Z874C18TVW"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = getAnalytics(app);
