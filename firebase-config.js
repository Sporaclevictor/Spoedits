// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC5EaHKHc4o3SG14KYHqiEu9NgQplyhcB4",
  authDomain: "spoedits.firebaseapp.com",
  projectId: "spoedits",
  storageBucket: "spoedits.firebasestorage.app",
  messagingSenderId: "116524119512",
  appId: "1:116524119512:web:0a35b4604ee275c8dd2ead",
  measurementId: "G-Z874C18TVW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
