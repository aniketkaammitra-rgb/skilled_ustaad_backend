import admin from "firebase-admin";

const getServiceAccount = () => {
  // Option 1: Use separate environment variables (Highly Recommended for Stability)
  if (process.env.FIREBASE_PRIVATE_KEY) {
    // console.log("Initializing Firebase with separate environment variables...");
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/\"/g, '').trim(),
    };
  }

  // Option 2: Fallback to single JSON variable
  const jsonKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (jsonKey) {
    // console.log("Initializing Firebase with JSON environment variable...");
    try {
      const parsed = JSON.parse(jsonKey.trim());
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n').replace(/\"/g, '').trim();
      }
      return parsed;
    } catch (err) {
      console.error("FATAL: Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON.");
      throw err;
    }
  }

  console.error("FATAL: No Firebase credentials found in environment variables.");
  throw new Error("No Firebase credentials found in environment variables.");
};

let adminInstance = admin;

if (!admin.apps.length) {
  try {
    const serviceAccount = getServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error("Firebase Admin Initialization Error:", err.message);
    adminInstance = new Proxy(admin, {
      get(target, prop) {
        if (prop === 'messaging') {
          return () => ({
            send: async (msg) => {
              console.log("[MOCK] Firebase admin.messaging().send() called with:", msg);
              return "mock-message-id";
            }
          });
        }
        return target[prop];
      }
    });
  }
}

export default adminInstance;
