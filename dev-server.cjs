/**
 * Dryad Engine Development Server
 *
 * A standalone Node.js server that provides the file system API for local development.
 * Run with: node dev-server.js
 *
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// Optional dependencies (loaded on demand)
let sharp = null;
let google = null;
let OAuth2Client = null;

const app = express();
const PORT = 7000;
const OAUTH_SERVER_PORT = 3069;
const OAUTH_CALLBACK_PATH = '/oauth2callback';
const GOOGLE_REDIRECT_URI = `http://localhost:${OAUTH_SERVER_PORT}${OAUTH_CALLBACK_PATH}`;

// OAuth state
let oauth2Client = null;
let oauthHttpServer = null;
let pendingAuthResult = null; // Store OAuth callback result for polling
const ASSETS_PATH = path.join(__dirname, 'public', 'assets');

// Ensure assets path ends with separator
const assetsPath = ASSETS_PATH.endsWith(path.sep) ? ASSETS_PATH : ASSETS_PATH + path.sep;

console.log(`[Dev Server] Assets path: ${assetsPath}`);

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ============================================================================
// Security: Path Sandboxing
// ============================================================================

function getSafePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    relativePath = '.';
  }

  try {
    const absolutePath = path.resolve(assetsPath, relativePath);
    const baseWithoutSlash = assetsPath.slice(0, -1);

    if (!(absolutePath === baseWithoutSlash || absolutePath.startsWith(assetsPath))) {
      console.warn(`[Security] Path traversal blocked: ${relativePath} -> ${absolutePath}`);
      return null;
    }

    return absolutePath;
  } catch (error) {
    console.error(`[Security] Error resolving path ${relativePath}:`, error);
    return null;
  }
}

// ============================================================================
// Routes
// ============================================================================

// GET /engine/read?path=...
app.get('/engine/read', (req, res) => {
  const relativePath = req.query.path;

  if (!relativePath) {
    return res.status(400).json({ error: 'Missing "path" query parameter.' });
  }

  const safePath = getSafePath(relativePath);
  if (!safePath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    if (!fs.existsSync(safePath) || !fs.lstatSync(safePath).isFile()) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const data = fs.readFileSync(safePath, 'utf8');

    try {
      res.json(JSON.parse(data));
    } catch {
      res.type('text/plain').send(data);
    }
  } catch (e) {
    console.error(`[read] Error reading ${safePath}:`, e);
    res.status(500).json({ error: 'Error reading file.' });
  }
});

// POST /engine/write
app.post('/engine/write', (req, res) => {
  const { path: relativePath, data } = req.body;

  if (!relativePath) {
    return res.status(400).json({ error: 'Missing "path" in request body.' });
  }
  if (data === undefined) {
    return res.status(400).json({ error: 'Missing "data" in request body.' });
  }

  const safeFilePath = getSafePath(relativePath);
  if (!safeFilePath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    const dirPath = path.dirname(safeFilePath);
    if (!dirPath.startsWith(assetsPath.slice(0, -1))) {
      return res.status(400).json({ error: 'Invalid or forbidden path.' });
    }

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`[write] Created directory: ${dirPath}`);
    }

    if (fs.existsSync(safeFilePath) && fs.lstatSync(safeFilePath).isDirectory()) {
      return res.status(400).json({ error: 'Cannot overwrite a directory with a file.' });
    }

    fs.writeFileSync(safeFilePath, JSON.stringify(data, null, 2), 'utf8');
    res.json({ message: 'File written successfully.' });
  } catch (e) {
    console.error('[write] Error:', e);
    res.status(500).json({ error: 'Error writing file.' });
  }
});

// GET /engine/list-files?path=...
app.get('/engine/list-files', (req, res) => {
  const relativeDirPath = req.query.path;

  if (!relativeDirPath) {
    return res.status(400).json({ error: 'Missing "path" query parameter.' });
  }

  const safeDirPath = getSafePath(relativeDirPath);
  if (!safeDirPath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    if (!fs.existsSync(safeDirPath) || !fs.lstatSync(safeDirPath).isDirectory()) {
      return res.status(404).json({ error: 'Directory not found.' });
    }

    const dirents = fs.readdirSync(safeDirPath, { withFileTypes: true });
    const files = dirents.filter(d => d.isFile()).map(d => d.name);

    res.json({ files });
  } catch (e) {
    console.error(`[list-files] Error listing ${safeDirPath}:`, e);
    res.status(500).json({ error: 'Error listing files.' });
  }
});

// GET /engine/list-folders?path=...
app.get('/engine/list-folders', (req, res) => {
  const relativeDirPath = req.query.path;

  if (!relativeDirPath) {
    return res.status(400).json({ error: 'Missing "path" query parameter.' });
  }

  const safeDirPath = getSafePath(relativeDirPath);
  if (!safeDirPath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    if (!fs.existsSync(safeDirPath) || !fs.lstatSync(safeDirPath).isDirectory()) {
      return res.status(404).json({ error: 'Directory not found.' });
    }

    const dirents = fs.readdirSync(safeDirPath, { withFileTypes: true });
    const folders = dirents.filter(d => d.isDirectory()).map(d => d.name);

    res.json({ folders });
  } catch (e) {
    console.error(`[list-folders] Error listing ${safeDirPath}:`, e);
    res.status(500).json({ error: 'Error listing folders.' });
  }
});

// POST /engine/delete
app.post('/engine/delete', (req, res) => {
  const { path: relativeFilePath, recursive = false } = req.body;

  if (!relativeFilePath) {
    return res.status(400).json({ error: 'Missing "path" in request body.' });
  }

  const safeFilePath = getSafePath(relativeFilePath);
  if (!safeFilePath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    if (!fs.existsSync(safeFilePath)) {
      return res.status(404).json({ error: 'File or directory not found.' });
    }

    const isDirectory = fs.lstatSync(safeFilePath).isDirectory();

    if (isDirectory) {
      if (!recursive) {
        return res.status(400).json({ error: 'Path is a directory. Use recursive flag to delete directories.' });
      }
      fs.rmSync(safeFilePath, { recursive: true, force: true });
      res.json({ message: 'Directory deleted successfully.' });
    } else {
      fs.unlinkSync(safeFilePath);
      res.json({ message: 'File deleted successfully.' });
    }
  } catch (e) {
    console.error('[delete] Error:', e);
    res.status(500).json({ error: 'Error deleting file or directory.' });
  }
});

// GET /engine/exists?path=...
app.get('/engine/exists', (req, res) => {
  const relativeItemPath = req.query.path;

  if (!relativeItemPath) {
    return res.json({ exists: false });
  }

  const safeItemPath = getSafePath(relativeItemPath);
  if (!safeItemPath) {
    return res.json({ exists: false });
  }

  try {
    res.json({ exists: fs.existsSync(safeItemPath) });
  } catch (e) {
    console.error(`[exists] Error checking ${safeItemPath}:`, e);
    res.json({ exists: false });
  }
});

// POST /engine/create-dir
app.post('/engine/create-dir', (req, res) => {
  const { path: relativeDirPath } = req.body;

  if (!relativeDirPath) {
    return res.status(400).json({ error: 'Missing "path" in request body.' });
  }

  const safeDirPath = getSafePath(relativeDirPath);
  if (!safeDirPath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    if (fs.existsSync(safeDirPath)) {
      if (fs.lstatSync(safeDirPath).isDirectory()) {
        return res.json({ message: 'Directory already exists.' });
      } else {
        return res.status(400).json({ error: 'Path exists but is not a directory.' });
      }
    }

    fs.mkdirSync(safeDirPath, { recursive: true });
    res.status(201).json({ message: 'Directory created successfully.' });
  } catch (e) {
    console.error('[create-dir] Error:', e);
    res.status(500).json({ error: 'Error creating directory.' });
  }
});

// GET /engine/list-files-recursively?path=...&assetFolders=...&ignoreEngineAssets=...
app.get('/engine/list-files-recursively', (req, res) => {
  const relativeStartDirPath = req.query.path || '.';

  // Parse optional query params
  let assetFolders = null;
  if (req.query.assetFolders) {
    try {
      assetFolders = JSON.parse(req.query.assetFolders);
    } catch {
      // Ignore parse errors
    }
  }
  const ignoreEngineAssets = req.query.ignoreEngineAssets === 'true';

  const safeStartPath = getSafePath(relativeStartDirPath);
  if (!safeStartPath) {
    return res.status(400).json({ error: 'Invalid or forbidden starting path.' });
  }

  const allFiles = [];
  const ignoreFolders = ['engine_files', 'games_files'];

  function walkDir(currentAbsolutePath) {
    try {
      if (!fs.existsSync(currentAbsolutePath) || !fs.lstatSync(currentAbsolutePath).isDirectory()) {
        return;
      }

      const entries = fs.readdirSync(currentAbsolutePath, { withFileTypes: true });

      for (const entry of entries) {
        const fullAbsolutePath = path.join(currentAbsolutePath, entry.name);

        if (entry.isSymbolicLink()) continue;

        if (entry.isDirectory()) {
          // Skip ignored folders at root level
          if (path.dirname(fullAbsolutePath) === assetsPath.slice(0, -1) && ignoreFolders.includes(entry.name)) {
            continue;
          }
          // Skip engine_assets if ignoreEngineAssets is true
          if (ignoreEngineAssets && entry.name === 'engine_assets') {
            continue;
          }
          if (fullAbsolutePath.startsWith(assetsPath)) {
            walkDir(fullAbsolutePath);
          }
        } else if (entry.isFile()) {
          const relativeToAssets = path.relative(assetsPath, fullAbsolutePath);
          allFiles.push(relativeToAssets.split(path.sep).join('/'));
        }
      }
    } catch (err) {
      console.error(`[list-files-recursively] Error reading ${currentAbsolutePath}:`, err);
    }
  }

  try {
    if (!fs.existsSync(safeStartPath) || !fs.lstatSync(safeStartPath).isDirectory()) {
      return res.status(404).json({ error: 'Starting directory not found or is not a directory.' });
    }

    // If assetFolders is specified, only walk those folders
    if (assetFolders && Array.isArray(assetFolders) && assetFolders.length > 0) {
      for (const folder of assetFolders) {
        const folderPath = getSafePath(folder);
        if (folderPath && fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory()) {
          walkDir(folderPath);
        }
      }
    } else {
      walkDir(safeStartPath);
    }

    res.json({ files: allFiles });
  } catch (e) {
    console.error('[list-files-recursively] Error:', e);
    res.status(500).json({ error: 'Error listing files recursively.' });
  }
});

// POST /engine/fetch (Google Docs)
app.post('/engine/fetch', async (req, res) => {
  const { documentId, accessToken } = req.body;

  if (!documentId) {
    return res.status(400).json({ error: 'Document ID is required.' });
  }

  if (!accessToken) {
    return res.status(401).json({ error: 'Access token is required. Please authenticate first.' });
  }

  try {
    const { google } = require('googleapis');

    // Create OAuth2 client and set credentials from request
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials({ access_token: accessToken });

    const docs = google.docs({ version: 'v1', auth: oAuth2Client });
    const response = await docs.documents.get({ documentId });

    res.json({ document: response.data });
  } catch (e) {
    console.error('[fetch] Error fetching Google Doc:', e.message);
    res.status(500).json({ error: `Error fetching document: ${e.message}` });
  }
});

// GET /engine/search-docs?query=...&language=...&basePath=...
app.get('/engine/search-docs', (req, res) => {
  const searchQuery = req.query.query;
  const language = req.query.language || 'en';
  const basePath = req.query.basePath || 'engine_files/docs';

  if (!searchQuery || searchQuery.trim().length < 2) {
    return res.json({ results: [], error: 'Search query must be at least 2 characters' });
  }

  const query = normalizeForSearch(searchQuery.trim());
  const docsPath = getSafePath(`${basePath}/${language}`);

  if (!docsPath || !fs.existsSync(docsPath)) {
    return res.json({ results: [], error: `Documentation not found for language: ${language}` });
  }

  const results = [];
  const maxResults = 50;
  const contextLength = 150;

  function searchDir(dirPath, category = '') {
    if (results.length >= maxResults) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          searchDir(fullPath, category ? `${category}.${entry.name}` : entry.name);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            const titleLine = lines.find(line => line.startsWith('# '));
            const title = titleLine ? titleLine.replace(/^#\s+/, '') : entry.name.replace('.md', '');
            const normalizedContent = normalizeForSearch(content);
            const queryIndex = normalizedContent.indexOf(query);

            if (queryIndex !== -1) {
              const start = Math.max(0, queryIndex - contextLength);
              const end = Math.min(normalizedContent.length, queryIndex + query.length + contextLength);
              let context = normalizedContent.substring(start, end).replace(/\n+/g, ' ').trim();

              if (start > 0) context = '...' + context;
              if (end < normalizedContent.length) context = context + '...';

              const page = entry.name.replace('.md', '');
              const categoryPath = category || path.basename(path.dirname(fullPath));

              results.push({
                category: categoryPath,
                page,
                title,
                context,
                path: `${categoryPath}.${page}`
              });
            }
          } catch (readError) {
            console.error(`[search-docs] Error reading ${fullPath}:`, readError);
          }
        }
      }
    } catch (err) {
      console.error(`[search-docs] Error reading directory ${dirPath}:`, err);
    }
  }

  searchDir(docsPath);
  res.json({ results, total: results.length });
});

function normalizeForSearch(text) {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .toLowerCase();
}

// ============================================================================
// Image Tools API
// ============================================================================

// GET /engine/get-file-size?path=...
app.get('/engine/get-file-size', async (req, res) => {
  let relativePath = req.query.path;

  if (!relativePath) {
    return res.status(400).json({ error: 'Missing "path" query parameter.' });
  }

  // Strip 'assets/' prefix if present
  if (relativePath.startsWith('assets/')) {
    relativePath = relativePath.substring('assets/'.length);
  }

  const safePath = getSafePath(relativePath);
  if (!safePath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    const stats = await fs.promises.stat(safePath);
    res.json({ size: stats.size });
  } catch (e) {
    console.error(`[get-file-size] Error:`, e);
    res.status(500).json({ error: e.message });
  }
});

// POST /engine/convert-to-webp
app.post('/engine/convert-to-webp', async (req, res) => {
  const { pngPath, quality = 80, lossless = false } = req.body;

  if (!pngPath) {
    return res.status(400).json({ error: 'Missing "pngPath" in request body.' });
  }

  // Load sharp on demand
  if (!sharp) {
    try {
      sharp = require('sharp');
    } catch (e) {
      return res.status(500).json({ error: 'Sharp module not available. Run npm install.' });
    }
  }

  // Strip 'assets/' prefix if present
  let normalizedPath = pngPath;
  if (pngPath.startsWith('assets/')) {
    normalizedPath = pngPath.substring('assets/'.length);
  }

  const inputPath = getSafePath(normalizedPath);
  if (!inputPath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    // Generate output path
    const outputPath = inputPath.replace(/\.(png|jpe?g)$/i, '.webp');

    // Convert using Sharp
    await sharp(inputPath)
      .webp({
        quality: lossless ? 100 : quality,
        lossless: lossless,
        effort: 6
      })
      .toFile(outputPath);

    // Get sizes for reporting
    const originalStats = await fs.promises.stat(inputPath);
    const newStats = await fs.promises.stat(outputPath);

    // Return relative path with 'assets/' prefix
    const pathWithoutBase = outputPath.replace(assetsPath, '').split(path.sep).join('/');
    const relativePath = `assets/${pathWithoutBase}`;

    console.log(`[convert-to-webp] Converted ${pngPath} to ${relativePath}`);
    res.json({
      webpPath: relativePath,
      originalSize: originalStats.size,
      newSize: newStats.size
    });
  } catch (e) {
    console.error('[convert-to-webp] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /engine/backup-original-file
app.post('/engine/backup-original-file', async (req, res) => {
  const { path: relativePath } = req.body;

  if (!relativePath) {
    return res.status(400).json({ error: 'Missing "path" in request body.' });
  }

  // Strip 'assets/' prefix if present
  let normalizedPath = relativePath;
  if (relativePath.startsWith('assets/')) {
    normalizedPath = relativePath.substring('assets/'.length);
  }

  const sourcePath = getSafePath(normalizedPath);
  if (!sourcePath) {
    return res.status(400).json({ error: 'Invalid or forbidden source path.' });
  }

  try {
    // Create backup path: assets/backup/[original-path]
    const backupPath = getSafePath(path.join('backup', normalizedPath));
    if (!backupPath) {
      return res.status(400).json({ error: 'Invalid or forbidden backup path.' });
    }

    const backupDir = path.dirname(backupPath);

    // Ensure backup directory exists
    await fs.promises.mkdir(backupDir, { recursive: true });

    // Move file (rename is atomic and efficient)
    await fs.promises.rename(sourcePath, backupPath);

    const relativeBackupPath = `assets/backup/${normalizedPath}`;
    console.log(`[backup-original-file] Backed up ${relativePath} to ${relativeBackupPath}`);
    res.json({
      success: true,
      backupPath: relativeBackupPath
    });
  } catch (e) {
    console.error('[backup-original-file] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /engine/restore-from-backup
app.post('/engine/restore-from-backup', async (req, res) => {
  const { path: relativePath } = req.body;

  if (!relativePath) {
    return res.status(400).json({ error: 'Missing "path" in request body.' });
  }

  // Normalize the path for consistent backup naming
  const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const backupDir = path.join(__dirname, 'public', 'assets', 'backup');
  const backupPath = path.join(backupDir, normalizedPath);

  // Calculate the original file path in the assets folder
  const originalPath = getSafePath(relativePath);
  if (!originalPath) {
    return res.status(400).json({ error: 'Invalid or forbidden path.' });
  }

  try {
    // Check if backup exists
    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup file not found.' });
    }

    // Move backup back to original location
    const originalDir = path.dirname(originalPath);
    if (!fs.existsSync(originalDir)) {
      fs.mkdirSync(originalDir, { recursive: true });
    }

    await fs.promises.rename(backupPath, originalPath);

    console.log(`[restore-from-backup] Restored ${relativePath} from backup`);
    res.json({ success: true });
  } catch (e) {
    console.error('[restore-from-backup] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// Google Auth API
// ============================================================================

function getOAuth2Client(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Invalid credentials format: must be an object.');
  }

  let clientId, clientSecret;

  if (credentials.web) {
    clientId = credentials.web.client_id;
    clientSecret = credentials.web.client_secret;
  } else if (credentials.installed) {
    clientId = credentials.installed.client_id;
    clientSecret = credentials.installed.client_secret;
  } else {
    throw new Error('Credentials must be for a "web" or "installed" application type.');
  }

  if (!clientId || !clientSecret) {
    throw new Error('Credentials missing client_id or client_secret.');
  }

  // Load googleapis on demand
  if (!google) {
    const googleapis = require('googleapis');
    google = googleapis.google;
  }

  return new google.auth.OAuth2(clientId, clientSecret, GOOGLE_REDIRECT_URI);
}

// POST /engine/google-auth-start
app.post('/engine/google-auth-start', (req, res) => {
  const { clientSecret } = req.body;

  try {
    oauth2Client = getOAuth2Client(clientSecret);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/documents.readonly', 'https://www.googleapis.com/auth/userinfo.profile'],
      prompt: 'consent'
    });
    console.log('[google-auth-start] Generated Auth URL');
    res.json({ authUrl });
  } catch (e) {
    console.error('[google-auth-start] Error:', e);
    res.json({ error: e.message });
  }
});

// POST /engine/google-auth-token
app.post('/engine/google-auth-token', async (req, res) => {
  const { code } = req.body;

  if (!oauth2Client) {
    return res.json({ error: 'Authentication client not initialized. Call google-auth-start first.' });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Optionally fetch user profile
    let profileInfo = null;
    if (tokens.access_token) {
      try {
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        profileInfo = userInfo.data;
      } catch (profileError) {
        console.error('[google-auth-token] Error fetching profile:', profileError.message);
      }
    }

    // Save token to file for future use
    const tokenPath = path.join(__dirname, 'token.json');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
    console.log('[google-auth-token] Tokens saved to token.json');

    res.json({ tokens, profile: profileInfo });
  } catch (e) {
    console.error('[google-auth-token] Error:', e);
    res.json({ error: e.message });
  }
});

// POST /engine/google-auth-refresh-token
app.post('/engine/google-auth-refresh-token', async (req, res) => {
  const { refreshToken, clientSecret } = req.body;

  if (!refreshToken) {
    return res.json({ error: 'Refresh token is required.' });
  }

  if (!clientSecret) {
    return res.json({ error: 'Client credentials are required.' });
  }

  try {
    const refreshOAuthClient = getOAuth2Client(clientSecret);
    refreshOAuthClient.setCredentials({ refresh_token: refreshToken });

    console.log('[google-auth-refresh-token] Refreshing access token...');
    const { credentials } = await refreshOAuthClient.refreshAccessToken();

    console.log('[google-auth-refresh-token] Access token refreshed successfully.');
    res.json({ tokens: credentials });
  } catch (e) {
    console.error('[google-auth-refresh-token] Error:', e);
    res.json({ error: `Failed to refresh token: ${e.message}` });
  }
});

// POST /engine/start-oauth-server
app.post('/engine/start-oauth-server', (req, res) => {
  if (oauthHttpServer) {
    return res.json({ success: true, message: 'OAuth server already running.' });
  }

  oauthHttpServer = http.createServer((httpReq, httpRes) => {
    const parsedUrl = url.parse(httpReq.url, true);

    if (parsedUrl.pathname === OAUTH_CALLBACK_PATH) {
      const { code, error } = parsedUrl.query;

      if (error) {
        httpRes.writeHead(400, { 'Content-Type': 'text/html' });
        httpRes.end(`<html><body><h1>Authentication Failed</h1><p>${error}</p><p>You can close this window.</p></body></html>`);
        pendingAuthResult = { error: String(error) };
      } else if (code) {
        httpRes.writeHead(200, { 'Content-Type': 'text/html' });
        httpRes.end(`<html><body><h1>Authentication Successful!</h1><p>You can close this window and return to the application.</p></body></html>`);
        pendingAuthResult = { code: String(code) };
      } else {
        httpRes.writeHead(400, { 'Content-Type': 'text/html' });
        httpRes.end(`<html><body><h1>Invalid Callback</h1><p>No authorization code found.</p></body></html>`);
      }

      // Auto-close after callback
      setTimeout(() => {
        if (oauthHttpServer) {
          oauthHttpServer.close(() => {
            console.log('[OAuth Server] Auto-closed after callback.');
            oauthHttpServer = null;
          });
        }
      }, 1000);
    } else {
      httpRes.writeHead(404);
      httpRes.end('Not Found');
    }
  });

  oauthHttpServer.on('error', (e) => {
    console.error('[OAuth Server] Error:', e);
    oauthHttpServer = null;
    res.json({ success: false, error: e.message, code: e.code });
  });

  oauthHttpServer.listen(OAUTH_SERVER_PORT, 'localhost', () => {
    console.log(`[OAuth Server] Listening on http://localhost:${OAUTH_SERVER_PORT}${OAUTH_CALLBACK_PATH}`);
    res.json({ success: true, message: 'OAuth server started successfully.' });
  });
});

// POST /engine/stop-oauth-server
app.post('/engine/stop-oauth-server', (req, res) => {
  if (oauthHttpServer) {
    oauthHttpServer.close(() => {
      console.log('[OAuth Server] Stopped.');
      oauthHttpServer = null;
      res.json({ success: true, message: 'OAuth server stopped.' });
    });
  } else {
    res.json({ success: true, message: 'OAuth server was not running.' });
  }
});

// GET /engine/wait-for-auth-callback (polling endpoint - checks for stored result)
app.get('/engine/wait-for-auth-callback', (req, res) => {
  if (pendingAuthResult) {
    const result = pendingAuthResult;
    pendingAuthResult = null; // Clear after returning
    return res.json(result);
  }
  // No result yet, return empty object (client will keep polling)
  res.json({});
});

// ============================================================================
// Startup
// ============================================================================

if (!fs.existsSync(assetsPath)) {
  console.error(`[Error] Assets directory not found: ${assetsPath}`);
  console.error('[Error] Make sure you are running this server from the project root.');
  process.exit(1);
}

app.listen(PORT, 'localhost', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           Dryad Engine Development Server                    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Server running at: http://localhost:${PORT}                    ║`);
  console.log(`║  Assets path: ${assetsPath.substring(0, 44).padEnd(44)} ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  File Operations:                                            ║');
  console.log('║    GET  /engine/read, /engine/exists, /engine/list-*         ║');
  console.log('║    POST /engine/write, /engine/delete, /engine/create-dir    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Image Tools:                                                ║');
  console.log('║    GET  /engine/get-file-size                                ║');
  console.log('║    POST /engine/convert-to-webp, /engine/backup-original-file║');
  console.log('║    POST /engine/restore-from-backup                          ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Google Auth:                                                ║');
  console.log('║    POST /engine/google-auth-start, /engine/google-auth-token ║');
  console.log('║    POST /engine/start-oauth-server, /engine/stop-oauth-server║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Other:                                                      ║');
  console.log('║    POST /engine/fetch (Google Docs)                          ║');
  console.log('║    GET  /engine/search-docs                                  ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Press Ctrl+C to stop the server                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down... Goodbye!');
  process.exit(0);
});
