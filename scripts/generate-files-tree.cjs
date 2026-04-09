#!/usr/bin/env node

/**
 * Generates a nested files_tree.json by scanning directories.
 * Used by WebStorageService to implement read-only file operations
 * without filesystem access (web + Capacitor builds).
 *
 * Usage: node scripts/generate-files-tree.js --root=dist-web/assets --output=dist-web/assets/files_tree.json
 *
 * Output format (nested object, folders = objects, files = 1):
 * {
 *   "games_files": {
 *     "game1": {
 *       "_core": {
 *         "manifest.json": 1
 *       }
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

// Parse args
const args = {};
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.replace(/^--/, '').split('=');
  args[key] = value;
}

const rootDir = args.root;
const outputFile = args.output;
const dirs = (args.dirs || 'games_files,engine_files').split(',');

if (!rootDir || !outputFile) {
  console.error('Usage: node generate-files-tree.js --root=<path> --output=<path> [--dirs=games_files,engine_files]');
  process.exit(1);
}

function scanDir(dirPath) {
  const tree = {};

  if (!fs.existsSync(dirPath)) return tree;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) {
      tree[entry.name] = scanDir(path.join(dirPath, entry.name));
    } else if (entry.isFile()) {
      tree[entry.name] = 1;
    }
  }

  return tree;
}

// Build the tree
const tree = {};
for (const dir of dirs) {
  const fullPath = path.join(rootDir, dir);
  if (fs.existsSync(fullPath)) {
    tree[dir] = scanDir(fullPath);
    console.log(`  Scanned ${dir}/`);
  } else {
    console.warn(`  Warning: ${dir}/ not found in ${rootDir}`);
  }
}

// Count files
function countFiles(node) {
  let count = 0;
  for (const key in node) {
    if (node[key] === 1) count++;
    else count += countFiles(node[key]);
  }
  return count;
}

// Write output
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(tree));
console.log(`  Generated ${outputFile} (${countFiles(tree)} files)`);
