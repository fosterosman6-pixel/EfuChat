// Build-time settings on top of app.json. (The map preview for shared locations is switched off:
// the map library crashed the app at start-up, so locations show a pin card with the area name.)
module.exports = ({ config }) => ({
  ...config,
  extra: { ...(config.extra || {}), mapsEnabled: false },
});
