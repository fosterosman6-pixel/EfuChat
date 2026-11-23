import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import { getStorage } from '@react-native-firebase/storage';

// React Native Firebase reads its config from google-services.json (Android)
// and GoogleService-Info.plist (iOS), set in app.json. No keys live in code.
export const auth = getAuth();
export const db = getFirestore();
export const storage = getStorage();
