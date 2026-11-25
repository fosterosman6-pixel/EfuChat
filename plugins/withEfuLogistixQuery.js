// Android 11+ only lets an app open another app it declares here. EfuChat opens EfuLogistix for "Book a matola".
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withEfuLogistixQuery(config, { packages = ['mw.efulogistix.efulogistix_fleet'] } = {}) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [{}];
    const q = manifest.queries[0];
    q.package = q.package || [];
    for (const name of packages) {
      if (!q.package.some((p) => p.$ && p.$['android:name'] === name)) q.package.push({ $: { 'android:name': name } });
    }
    return cfg;
  });
};
