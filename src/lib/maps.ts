import { Alert, Linking, Platform } from 'react-native';

/** Opens the address in Apple Maps (iOS) or Google Maps (elsewhere) with directions. */
export async function openDirections(address: string): Promise<void> {
  if (!address) {
    Alert.alert('No address', 'Add an address to this client first.');
    return;
  }
  const query = encodeURIComponent(address);
  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?daddr=${query}`
      : `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open maps');
  }
}
