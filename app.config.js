// Adds the Google Maps key (from the build's GOOGLE_MAPS_ANDROID_KEY secret, never committed) for the
// map in shared locations. Without a key the app still builds; locations then show a pin card.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_KEY || '';
  return {
    ...config,
    plugins: [...(config.plugins || []), ['react-native-maps', key ? { androidGoogleMapsApiKey: key } : {}]],
    extra: { ...(config.extra || {}), mapsEnabled: !!key },
  };
};
