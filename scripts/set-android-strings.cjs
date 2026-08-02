// Rewrites android strings.xml for the current APK build (called by
// build-capacitor.sh with CAP_APP_ID / CAP_APP_NAME set). `cap sync` does not
// regenerate strings.xml, so multi-app builds from one android/ project must
// stamp the name/package per build. Apostrophes must be escaped for aapt.

const fs = require('fs');

const appId = process.env.CAP_APP_ID;
const appName = process.env.CAP_APP_NAME;
if (!appId || !appName) {
  console.error('CAP_APP_ID / CAP_APP_NAME env vars are required');
  process.exit(1);
}

const file = 'android/app/src/main/res/values/strings.xml';
const escaped = appName
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/'/g, "\\'");

let xml = fs.readFileSync(file, 'utf-8');
xml = xml.replace(/<string name="app_name">[\s\S]*?<\/string>/, `<string name="app_name">${escaped}</string>`);
xml = xml.replace(/<string name="title_activity_main">[\s\S]*?<\/string>/, `<string name="title_activity_main">${escaped}</string>`);
xml = xml.replace(/<string name="package_name">[\s\S]*?<\/string>/, `<string name="package_name">${appId}</string>`);
xml = xml.replace(/<string name="custom_url_scheme">[\s\S]*?<\/string>/, `<string name="custom_url_scheme">${appId}</string>`);
fs.writeFileSync(file, xml);
console.log(`strings.xml: app_name="${appName}", package=${appId}`);
