#!/usr/bin/env node
// Copies games/mods listed in web-game-list.json into a web build's assets dir.
// Usage: node scripts/copy-web-games.cjs --dest=dist-web/assets [--premium] [--games=id1,id2]
//        node scripts/copy-web-games.cjs --dest=... --android-build=<build id>
// --premium additionally copies each game's premium_mods (for /play_premium).
// --games restricts the copy to the listed game ids (e.g. the itch.io bundle).
// --android-build reads the games/mods of one entry in android-build-list.json
//   (mods are explicit there; --premium/premium_mods do not apply).

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const destArg = args.find(a => a.startsWith('--dest='));
const premium = args.includes('--premium');
const gamesArg = args.find(a => a.startsWith('--games='));
const onlyGames = gamesArg ? gamesArg.slice('--games='.length).split(',').filter(Boolean) : null;
const androidBuildArg = args.find(a => a.startsWith('--android-build='));

if (!destArg) {
  console.error('Usage: node scripts/copy-web-games.cjs --dest=<assets dir> [--premium] [--games=id1,id2] [--android-build=<id>]');
  process.exit(1);
}
const destRoot = destArg.slice('--dest='.length);

let games;
if (androidBuildArg) {
  const buildId = androidBuildArg.slice('--android-build='.length);
  const builds = JSON.parse(fs.readFileSync('android-build-list.json', 'utf-8'));
  const build = builds.find(b => b.id === buildId);
  if (!build) {
    console.error(`Android build "${buildId}" not found in android-build-list.json`);
    process.exit(1);
  }
  games = build.games;
} else {
  games = JSON.parse(fs.readFileSync('web-game-list.json', 'utf-8'));
  if (onlyGames) games = games.filter(g => onlyGames.includes(g.id));
}

for (const game of games) {
  const mods = [...(game.mods || []), ...(premium ? game.premium_mods || [] : [])];
  if (!mods.length) continue;
  console.log('  Game: ' + game.id + ' (from ' + game.source + ') mods: ' + mods.join(', '));

  for (const mod of mods) {
    const srcFiles = path.join(game.source, 'games_files', game.id, mod);
    const destFiles = path.join(destRoot, 'games_files', game.id, mod);

    if (!fs.existsSync(srcFiles)) {
      console.warn('    WARNING: ' + srcFiles + ' not found, skipping');
      continue;
    }

    fs.cpSync(srcFiles, destFiles, { recursive: true });
    console.log('    Copied games_files/' + game.id + '/' + mod);

    const devSettingsPath = path.join(srcFiles, 'dev', 'dev_settings.json');
    if (fs.existsSync(devSettingsPath)) {
      const devSettings = JSON.parse(fs.readFileSync(devSettingsPath, 'utf-8'));
      const assetFolders = devSettings.asset_folders || [];

      for (const folder of assetFolders) {
        const srcAssets = path.join(game.source, 'games_assets', folder);
        const destAssets = path.join(destRoot, 'games_assets', folder);

        if (fs.existsSync(srcAssets)) {
          fs.cpSync(srcAssets, destAssets, { recursive: true });
          console.log('    Copied games_assets/' + folder);
        } else {
          console.warn('    WARNING: games_assets/' + folder + ' not found');
        }
      }
    }
  }
}

console.log('  Done');
