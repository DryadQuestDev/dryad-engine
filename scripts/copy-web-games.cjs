#!/usr/bin/env node
// Copies games/mods listed in web-game-list.json into a web build's assets dir.
// Usage: node scripts/copy-web-games.cjs --dest=dist-web/assets [--premium]
// --premium additionally copies each game's premium_mods (for /play_premium).

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const destArg = args.find(a => a.startsWith('--dest='));
const premium = args.includes('--premium');

if (!destArg) {
  console.error('Usage: node scripts/copy-web-games.cjs --dest=<assets dir> [--premium]');
  process.exit(1);
}
const destRoot = destArg.slice('--dest='.length);

const games = JSON.parse(fs.readFileSync('web-game-list.json', 'utf-8'));

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
