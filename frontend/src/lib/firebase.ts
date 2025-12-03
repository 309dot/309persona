import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function initFirebaseApp() {
  if (!firebaseConfig.apiKey) {
    console.warn('Firebase API Key가 설정되지 않았습니다. 대시보드 인증이 비활성화됩니다.');
    return null;
  }

  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApp();
}

const app = initFirebaseApp();
export const auth = app ? getAuth(app) : null;

