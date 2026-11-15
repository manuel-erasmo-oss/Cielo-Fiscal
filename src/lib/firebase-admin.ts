import 'server-only'
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

// SDK de ADMIN — solo servidor (API routes). Salta las reglas de seguridad de
// Firestore/Storage, así que cada route que lo use DEBE verificar el ID token
// y comprobar a mano que el recurso pertenece a ese `contadorUid`.
// `import 'server-only'` hace fallar el build si algún componente de cliente
// llega a importar este archivo.

export class FirebaseAdminNoConfiguradoError extends Error {
  constructor() {
    super(
      'Firebase Admin no está configurado: faltan FIREBASE_ADMIN_PROJECT_ID, ' +
      'FIREBASE_ADMIN_CLIENT_EMAIL o FIREBASE_ADMIN_PRIVATE_KEY (ver .env.example).',
    )
    this.name = 'FirebaseAdminNoConfiguradoError'
  }
}

// Perezoso por la misma razón que el SDK de cliente: el build no debe fallar
// sin variables de entorno.
function getAdminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  // En .env la private key va en una sola línea con "\n" literales.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) throw new FirebaseAdminNoConfiguradoError()

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminDb() {
  return getFirestore(getAdminApp())
}

export function getAdminBucket() {
  return getStorage(getAdminApp()).bucket()
}
