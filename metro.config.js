"use strict";

const { getDefaultConfig } = require('expo/metro-config');
const resolveFrom = require('resolve-from');

const config = getDefaultConfig(__dirname);

config.cacheVersion = "default-config";

// react-native-webrtc depends on event-target-shim@6, but React Native itself
// requires @5 — without this override, Metro resolves the wrong major version
// for react-native-webrtc's internal imports and the native module fails to
// load. This is react-native-webrtc's own documented fix, not a local hack.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('event-target-shim') && context.originModulePath.includes('react-native-webrtc')) {
    return context.resolveRequest(
      context,
      resolveFrom(context.originModulePath, 'event-target-shim'),
      platform
    );
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
