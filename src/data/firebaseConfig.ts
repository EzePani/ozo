/**
 * Configuración de Firebase (Project settings → Tus apps → Configuración de SDK).
 * Estos valores NO son secretos: la seguridad la dan las reglas de Firestore (firestore.rules) y el login con Google.
 * Mientras `apiKey` esté vacío la app funciona igual, solo en este dispositivo.
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBUdqSSZChj15HQSigQOdBqeeuhNbSVGIY',
  authDomain: 'ozo-app-bf277.firebaseapp.com',
  projectId: 'ozo-app-bf277',
  appId: '1:890013649871:web:f5421e7a35ccebc95020ba',
}
export const SYNC_CONFIGURED = !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.projectId
