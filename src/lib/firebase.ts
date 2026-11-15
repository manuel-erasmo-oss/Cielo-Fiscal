import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

// SDK de CLIENTE. Todo acceso desde aquí está sujeto a las reglas de
// seguridad de Firestore/Storage (aislamiento por `contadorUid`) — que
// todavía NO están escritas (ver CLAUDE.md, "Lo que falta"). Las operaciones
// que requieren confianza del servidor usan `firebase-admin.ts`.

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// True solo cuando las variables de Firebase están presentes en build time.
export const FIREBASE_ENABLED = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY

// Patrón de multicuenta portado de Cielo Cloud Nómina (`src/lib/firebase.ts`
// de manuel-erasmo-oss/tyui): cada cuenta vinculada en el dispositivo vive en
// su propia instancia con nombre de Firebase App (mismo proyecto/config, pero
// Auth persiste la sesión por separado para cada nombre de app), así se
// puede tener más de una cuenta autenticada a la vez y cambiar entre ellas
// al instante.
export const DEFAULT_APP_NAME = '[DEFAULT]'

function getFirebaseAppNamed(appName: string): FirebaseApp {
  const existing = getApps().find(a => a.name === appName)
  return existing ?? (appName === DEFAULT_APP_NAME && getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig, appName))
}

// Getters perezosos — nunca se llaman a nivel de módulo, para que el build no
// falle sin variables de entorno. Solo corren en el navegador (dentro de
// useEffect / event handlers).
export function getFirebaseAuthNamed(appName: string) {
  return getAuth(getFirebaseAppNamed(appName))
}

export function getFirebaseAuth() {
  return getFirebaseAuthNamed(DEFAULT_APP_NAME)
}

// Firestore y Storage cuelgan de la misma app con nombre que la sesión de
// Auth, para que las reglas de seguridad vean el `request.auth.uid` de la
// cuenta activa y no el de otra cuenta vinculada.
export function getFirebaseDb(appName: string = DEFAULT_APP_NAME) {
  return getFirestore(getFirebaseAppNamed(appName))
}

export function getFirebaseStorage(appName: string = DEFAULT_APP_NAME) {
  return getStorage(getFirebaseAppNamed(appName))
}

export const googleProvider = new GoogleAuthProvider()
