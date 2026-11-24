import { getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

function adminApp() {
  // Against the emulator, the Admin SDK accepts the emulator's tokens when this is set. In production it checks
  // real Google-signed tokens for the project; no service-account key is needed just to verify ID tokens.
  if (process.env.VITE_USE_EMULATOR === 'true') process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
  return getApps()[0] ?? initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID })
}

/** Returns the user's uid, or throws if the token is missing, expired or not for this project. */
export async function verifyIdToken(token: string): Promise<string> {
  return (await getAuth(adminApp()).verifyIdToken(token)).uid
}
