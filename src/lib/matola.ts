import { Linking } from 'react-native';
import { dialog } from '../components/Dialog';

/** EfuLogistix passenger app (Android id). Booking inside EfuChat comes later. */
export const EFULOGISTIX_APP = 'mw.efulogistix.efulogistix_fleet';

/** Opens the EfuLogistix app if it is installed, otherwise its store page. */
export async function openEfuLogistix() {
  try {
    const IntentLauncher = await import('expo-intent-launcher');
    IntentLauncher.openApplication(EFULOGISTIX_APP);
    return;
  } catch {}
  try {
    await Linking.openURL(`market://details?id=${EFULOGISTIX_APP}`);
    return;
  } catch {}
  try {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${EFULOGISTIX_APP}`);
  } catch {
    dialog('EfuLogistix not found', 'Install the EfuLogistix app to book a matola, send a parcel or hire a car.');
  }
}
