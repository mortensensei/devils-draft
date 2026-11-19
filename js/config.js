// ===== Devil's Draft configuration =====
// 1) Paste your Firebase web config below (see SETUP.md). Leave apiKey empty to run in demo mode.
export const FIREBASE = {
  apiKey: "AIzaSyAFrtMqFXhCcaAHHmNMUgJ4xnuNP4BMJ0s",
  authDomain: "devils-draft.firebaseapp.com",
  projectId: "devils-draft",
  storageBucket: "devils-draft.firebasestorage.app",
  messagingSenderId: "343280150372",
  appId: "1:343280150372:web:2d35bd8717faa6f87d7c71"
};

// 2) League settings
export const LEAGUE = {
  name: "Devil's Draft",
  season: "Devil's Plan: Dead Again",
  leagueId: "dead-again",          // Firestore document id: leagues/<leagueId>
  scoringStartEp: 2,               // the draft happens after Episode 1, so scoring starts with Episode 2
  tradeWindows: [4, 7, 10],        // trade windows open after these episodes
  managers: [
  {
    "id": "aaron",
    "name": "Aaron",
    "pinHash": "e199d1a5aa5b25ae879cb394126223aaeff8f06eaf3c1e54a4ce7b737e2315a3"
  },
  {
    "id": "alejandro",
    "name": "Alejandro",
    "pinHash": "8843de5ef1c8829276eec37da6ffb1e33c282535f6bbee35e040cbc2f9a19d41"
  },
  {
    "id": "ashley",
    "name": "Ashley",
    "pinHash": "34cedf3443ec126815420dfcb8f0fec76a195d56936be3355f649abe093775bd"
  },
  {
    "id": "belle",
    "name": "Belle",
    "pinHash": "bc6dd2300ec14f9a718635cf6736dc8cf27703b11eb7dc3f82a0317f5a3da598"
  },
  {
    "id": "blair",
    "name": "Blair",
    "pinHash": "fd01a64d653c5f230884a4ca8964342f93ca0698bcf7e13b883408b40edaa8a6"
  },
  {
    "id": "mahreen",
    "name": "Mahreen",
    "pinHash": "23990e4f1c8dbaea67fa72fb1a3ac2095bbf5a6de82dff8752e9f32e3ed19dd6"
  }
],
  // SHA-256 of "dd|admin|<password>". Change with the hash helper on the Admin page.
  adminHash: "6c1c072296b4216d56dd7f95840b5bb630c6f2a339a80b41a577c1ea39b7a8f1"
};
