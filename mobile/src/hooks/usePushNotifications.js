import { useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { authApi } from '../api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

/**
 * Requests notification permission, obtains an Expo push token, and — once
 * `isAuthenticated` is true — registers it with the backend via
 * POST /api/auth/push-token/. Safe to call from a component that mounts
 * regardless of auth state; registration itself is gated internally.
 */
export const usePushNotifications = (isAuthenticated) => {
  const [expoPushToken, setExpoPushToken]   = useState(null);
  const [notification, setNotification]     = useState(null);
  const notificationListener                = useRef();
  const responseListener                    = useRef();
  const registeredRef                       = useRef(false);

  useEffect(() => {
    registerForPushNotifications().then((token) => setExpoPushToken(token));

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (n) => setNotification(n)
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (_response) => {
        // Handle tap on notification — extend here per use case
      }
    );

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // Only send the token to the backend once we have both a token and a
  // logged-in user — the endpoint requires auth, and re-sending on every
  // re-render/token-refresh would be wasteful, so it's a one-shot per token.
  useEffect(() => {
    if (!expoPushToken || !isAuthenticated || registeredRef.current) return;
    registeredRef.current = true;
    authApi.pushToken(expoPushToken).catch(() => {
      // Non-critical — failing to register a push token shouldn't disrupt
      // the app. Reset so a later re-render (e.g. after reconnecting) can retry.
      registeredRef.current = false;
    });
  }, [expoPushToken, isAuthenticated]);

  return { expoPushToken, notification };
};

async function registerForPushNotifications() {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0d9488',
      });
    }

    // projectId is required by getExpoPushTokenAsync() in EAS builds; Expo Go
    // can usually infer it. If it isn't configured yet (no `eas init` run),
    // skip token fetching rather than crash — the rest of the app works fine
    // without push notifications.
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    return token;
  } catch (err) {
    console.log('Could not obtain Expo push token:', err?.message || err);
    return null;
  }
}
