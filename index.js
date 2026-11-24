// Start-up: register the incoming-call ringer before the app loads. Guarded so it can never block start-up.
try {
  require('./src/lib/callRinger').registerCallRinger();
} catch {}
require('expo-router/entry');
