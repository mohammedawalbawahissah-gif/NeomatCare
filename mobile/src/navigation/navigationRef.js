/**
 * src/navigation/navigationRef.js
 * ---------------------------------
 * Lets components rendered outside the navigator tree (NotificationBell,
 * push-notification tap handlers, etc.) still navigate. useNavigation()
 * only works inside a screen's NavigationContext — this ref, attached to
 * <NavigationContainer ref={navigationRef}> in App.jsx, works anywhere.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
