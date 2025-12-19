const { app, BrowserWindow, Menu, ipcMain, dialog, shell, globalShortcut, screen } = require('electron');
const { OAuth2Client } = require('google-auth-library');
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

// Disable sandbox for unpacked app compatibility - Reverted, using env var instead
// app.commandLine.appendSwitch('no-sandbox');

const path = require("path");
const fs = require("fs");
const sharp = require('sharp');
const archiver = require('archiver');
const yauzl = require('yauzl');

let mainWindow;

// Load the index.html file directly from the file system
//const indexPath = path.join(__dirname, '../dist/dryad-engine/browser/index.html');
const indexPath = path.join(__dirname, '../../../index.html');
const assetsFolder = path.join(__dirname, '../../../assets');

// --- Google OAuth Configuration ---
const OAUTH_SERVER_PORT = 3069;
const OAUTH_CALLBACK_PATH = '/oauth2callback';
const GOOGLE_REDIRECT_URI = `http://localhost:${OAUTH_SERVER_PORT}${OAUTH_CALLBACK_PATH}`;
// We will create the OAuth2 client on demand when credentials are provided by the renderer.
let oauth2Client; // This will hold the configured OAuth2Client instance
let oauthHttpServer; // Added: To hold the HTTP server instance
// --- End Google OAuth Configuration ---

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // Don't show until maximized
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true, // false Explicitly disable renderer sandbox
      webSecurity: true,    // enforces CORS and other restrictions
    }
  });

  mainWindow.loadFile(indexPath);

  // Get screen dimensions and set bounds before showing to avoid resize animation
  mainWindow.once('ready-to-show', () => {
    const { bounds } = screen.getPrimaryDisplay();
    mainWindow.setBounds(bounds);
    mainWindow.show();
  });

  // Open DevTools for debugging (remove in production)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });


  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on("zoom-changed", (event, zoomDirection) => {

    let currentZoom = mainWindow.webContents.getZoomFactor();

    if (zoomDirection === "in") {
      currentZoom = currentZoom + 0.1;
    }
    if (zoomDirection === "out") {
      currentZoom = currentZoom - 0.1;
    }

    currentZoom = Math.max(0.25, Math.min(5, currentZoom));
    mainWindow.webContents.zoomFactor = currentZoom;

  })


  // menu
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
        { role: 'quit' }, // Adds an option to quit the app
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=', },
        { role: 'zoomOut' },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen(F11)',
          accelerator: 'F11',
          click: () => {
            toggleFullscreen();
          }
        },
        { role: 'minimize' },
      ],
    },
    {
      label: 'Community',
      // TODO: UPDATE THIS
      submenu: [
        {
          label: 'Discord',
          click: async () => {
            await shell.openExternal('https://discord.gg/Q5JJnQRVcB');
          },
        },
        {
          label: 'Reddit',
          click: async () => {
            await shell.openExternal('https://www.reddit.com/r/dryadquest/');
          },
        },
        {
          label: 'Help',
          click: async () => {
            await shell.openExternal('https://docs.google.com/document/d/1vekjx2oc0KXf7ZXM5spIvg2mFZGqhQNKujBv7x7i6w4');
          },
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);

  mainWindow.on('close', () => {
    globalShortcut.unregisterAll();
  });

  globalShortcut.register('F11', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      toggleFullscreen();
    }
  });

  mainWindow.setMenuBarVisibility(true);



}
function toggleFullscreen() {
  if (mainWindow) {
    const barVisibility = !mainWindow.isMenuBarVisible()
    const isFullScreen = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFullScreen);
    mainWindow.setMenuBarVisibility(barVisibility);
  }
}
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});


// --- Google Auth IPC Handlers ---

// Helper to get or create OAuth2 client
function getOAuth2Client(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error("Invalid credentials format: must be an object.");
  }

  let clientId, clientSecret;

  if (credentials.web) {
    if (!credentials.web.client_id || !credentials.web.client_secret) {
      throw new Error("Web credentials missing client_id or client_secret.");
    }
    clientId = credentials.web.client_id;
    clientSecret = credentials.web.client_secret;
  } else if (credentials.installed) {
    if (!credentials.installed.client_id || !credentials.installed.client_secret) {
      throw new Error("Installed credentials missing client_id or client_secret.");
    }
    clientId = credentials.installed.client_id;
    clientSecret = credentials.installed.client_secret;
  } else {
    throw new Error("Credentials must be for a 'web' or 'installed' application type, and contain client_id and client_secret.");
  }

  // --- Start: Simplified Redirect URI Logic ---
  const appSpecificRedirectUri = GOOGLE_REDIRECT_URI; // Use the app's fixed URI.
  console.log(`[getOAuth2Client] Using application's fixed redirect URI: ${appSpecificRedirectUri}.`);
  console.log(`[getOAuth2Client] IMPORTANT: Ensure '${appSpecificRedirectUri}' is listed as an Authorized redirect URI in your Google Cloud Console for the OAuth 2.0 Client ID.`);
  console.log(`[getOAuth2Client] Any redirect_uris present in the provided JSON credentials will be ignored by this application.`);
  // --- End: Simplified Redirect URI Logic ---

  return new OAuth2Client(clientId, clientSecret, appSpecificRedirectUri);
}


ipcMain.handle("google-auth-start", async (_, clientSecretJsonContent) => {
  try {
    // console.log("[IPC google-auth-start] Received clientSecretJsonContent:", clientSecretJsonContent);
    if (typeof clientSecretJsonContent !== 'object' || clientSecretJsonContent === null) {
      // console.error("[IPC google-auth-start] clientSecretJsonContent is not an object or is null.");
      throw new Error("Provided credentials content is not a valid object.");
    }
    oauth2Client = getOAuth2Client(clientSecretJsonContent); // Initialize/re-initialize with provided credentials
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Important for getting a refresh token
      scope: ['https://www.googleapis.com/auth/documents.readonly', 'https://www.googleapis.com/auth/userinfo.profile'], // profile to verify
      prompt: 'consent' // Ensures refresh token is provided every time, good for dev/testing
    });
    // console.log("[IPC google-auth-start] Generated Auth URL:", authUrl);
    return { authUrl };
  } catch (error) {
    console.error("Error starting Google Auth:", error);
    //dialog.showErrorBox("Google Auth Error", `Failed to start Google authentication: ${error.message}`);
    return { error: error.message };
  }
});

ipcMain.handle("google-auth-token", async (_, authorizationCode) => {
  if (!oauth2Client) {
    // console.error("[IPC google-auth-token] oauth2Client not initialized. Call google-auth-start first.");
    // dialog.showErrorBox("Google Auth Error", "Authentication client not initialized. Please start the authentication process first.");
    return { error: "Authentication client not initialized." };
  }
  try {
    // console.log("[IPC google-auth-token] Received authorizationCode:", authorizationCode);
    const { tokens } = await oauth2Client.getToken(authorizationCode);
    // console.log("[IPC google-auth-token] Tokens received:", tokens);
    // IMPORTANT: oauth2Client now contains the tokens.
    // The `tokens` object includes access_token, refresh_token (if requested and granted), scope, token_type, expiry_date.
    // The renderer should store these securely.
    // For subsequent API calls, the renderer can pass the access_token, or we can keep the oauth2Client configured here.
    // For simplicity in this step, we return the tokens to the renderer.
    // Later, we might want the main process to manage the client and tokens more directly.
    oauth2Client.setCredentials(tokens); // Configure the client with the new tokens

    // Optionally, verify the token by fetching user profile (if scope allows)
    // This is a good check to ensure the token works and to get user info.
    let profileInfo = null;
    if (tokens.access_token) {
      try {
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        // console.log("[IPC google-auth-token] User info:", userInfo.data);
        profileInfo = userInfo.data;
      } catch (profileError) {
        console.error("[IPC google-auth-token] Error fetching user profile:", profileError);
        // Not a fatal error for token exchange itself, but good to log.
      }
    }

    return { tokens, profile: profileInfo };

  } catch (error) {
    console.error("Error exchanging Google Auth code for tokens:", error);
    //dialog.showErrorBox("Google Token Error", `Failed to get tokens: ${error.message}`);
    return { error: error.message };
  }
});

ipcMain.handle("google-auth-refresh-token", async (_, { refreshToken, clientSecretJsonContent }) => {
  try {
    if (!refreshToken) {
      console.error("[IPC google-auth-refresh-token] Missing refresh token.");
      return { error: "Refresh token is required." };
    }

    if (!clientSecretJsonContent || typeof clientSecretJsonContent !== 'object') {
      console.error("[IPC google-auth-refresh-token] Invalid client credentials.");
      return { error: "Valid OAuth client credentials are required." };
    }

    // Create OAuth client with the provided credentials
    const refreshOAuthClient = getOAuth2Client(clientSecretJsonContent);

    // Set the refresh token
    refreshOAuthClient.setCredentials({ refresh_token: refreshToken });

    // Request new access token
    console.log("[IPC google-auth-refresh-token] Refreshing access token...");
    const { credentials } = await refreshOAuthClient.refreshAccessToken();

    console.log("[IPC google-auth-refresh-token] Access token refreshed successfully.");
    // credentials contains: access_token, expiry_date, scope, token_type
    // Note: refresh_token is typically NOT returned again, so we need to preserve the original one
    return { tokens: credentials };

  } catch (error) {
    console.error("Error refreshing Google access token:", error);
    const errorMessage = error.response && error.response.data && error.response.data.error ?
      `${error.response.data.error.message} (Status: ${error.response.data.error.code})` :
      error.message;
    // Don't show dialog for refresh errors - let the app handle it gracefully
    return { error: `Failed to refresh token: ${errorMessage}` };
  }
});

ipcMain.handle("google-docs-get", async (_, { accessToken, documentId }) => {
  // For this handler, we'll create a temporary client with the provided access token.
  // This assumes the renderer manages the access token.
  // An alternative would be to use the `oauth2Client` if it's kept alive and configured in the main process.
  if (!accessToken || !documentId) {
    console.error("[IPC google-docs-get] Missing accessToken or documentId.");
    return { error: "Access token and Document ID are required." };
  }

  try {
    // Create a temporary OAuth2 client instance just for this API call
    // We don't have the original client_secret here, but googleapis allows setting accessToken directly
    const tempClient = new OAuth2Client(); // Basic client
    tempClient.setCredentials({ access_token: accessToken });

    const docs = google.docs({ version: 'v1', auth: tempClient });
    // console.log(`[IPC google-docs-get] Fetching document with ID: ${documentId}`);
    const response = await docs.documents.get({
      documentId: documentId,
    });
    // console.log(`[IPC google-docs-get] Document fetched successfully: ${response.data.title}`);
    return { document: response.data };
  } catch (error) {
    console.error(`Error fetching Google Document ${documentId}:`, error);
    // Try to provide a more specific error message if available
    const errorMessage = error.response && error.response.data && error.response.data.error ?
      `${error.response.data.error.message} (Status: ${error.response.data.error.code})` :
      error.message;
    //dialog.showErrorBox("Google Docs Error", `Failed to fetch document: ${errorMessage}`);
    return { error: `Failed to fetch document: ${errorMessage}` };
  }
});

// IPC Handler to open URL in default system browser
ipcMain.handle("open-external-url", async (event, url) => {
  try {
    // Basic validation for the URL
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return { success: true };
    } else {
      console.warn(`[IPC open-external-url] Attempted to open invalid URL: ${url}`);
      return { success: false, error: "Invalid URL format. Must start with http:// or https://" };
    }
  } catch (error) {
    console.error(`[IPC open-external-url] Error opening URL ${url}:`, error);
    dialog.showErrorBox("Error Opening URL", `Failed to open URL: ${error.message}`);
    return { success: false, error: error.message };
  }
});

// IPC Handler to show file in system file browser
ipcMain.handle("show-file-in-folder", async (event, filePath) => {
  const safePath = getSafeAbsolutePath(filePath);
  if (!safePath) {
    console.warn(`[IPC show-file-in-folder] Invalid or unsafe path: ${filePath}`);
    return { success: false, error: 'Invalid or unsafe file path.' };
  }

  try {
    if (fs.existsSync(safePath)) {
      // File exists - show it in folder
      shell.showItemInFolder(safePath);
      return { success: true };
    } else {
      // File doesn't exist - open the parent folder
      const parentDir = path.dirname(safePath);
      const safeParentDir = getSafeAbsolutePath(parentDir);

      if (!safeParentDir || !fs.existsSync(safeParentDir)) {
        console.warn(`[IPC show-file-in-folder] Parent directory does not exist: ${parentDir}`);
        return { success: false, error: 'Parent directory does not exist.' };
      }

      // Open the parent folder
      await shell.openPath(safeParentDir);
      return { success: true };
    }
  } catch (error) {
    console.error(`[IPC show-file-in-folder] Error showing file/folder ${safePath}:`, error);
    return { success: false, error: error.message };
  }
});

// --- End Google Auth IPC Handlers ---

// 🔍 Search Documentation Files (Electron IPC)
ipcMain.handle("search-docs", async (_, searchQuery, language = 'en') => {
  try {
    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length < 2) {
      return { results: [], error: 'Search query must be at least 2 characters' };
    }

    const query = searchQuery.toLowerCase().trim();

    // Use sandboxed path resolution
    const docsPath = getSafeAbsolutePath(`engine_files/docs/${language}`);
    if (!docsPath) {
      return { results: [], error: 'Invalid documentation path' };
    }

    if (!fs.existsSync(docsPath)) {
      return { results: [], error: `Documentation not found for language: ${language}` };
    }

    const results = [];
    const maxResults = 50;
    const contextLength = 150; // Characters of context around match

    // Recursively search through docs directory
    function searchDir(dirPath, category = '') {
      if (results.length >= maxResults) return;

      try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxResults) break;

          const fullPath = path.join(dirPath, entry.name);

          if (entry.isDirectory()) {
            // Recurse into subdirectories
            const subCategory = category ? `${category}.${entry.name}` : entry.name;
            searchDir(fullPath, subCategory);
          } else if (entry.isFile() && entry.name.endsWith('.md')) {
            // Search markdown file
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');

              // Extract title from first heading
              const titleLine = lines.find(line => line.startsWith('# '));
              const title = titleLine ? titleLine.replace(/^#\s+/, '') : entry.name.replace('.md', '');

              // Search through content
              const lowerContent = content.toLowerCase();
              const queryIndex = lowerContent.indexOf(query);

              if (queryIndex !== -1) {
                // Find which line contains the match
                let charCount = 0;
                let matchLine = 0;
                for (let i = 0; i < lines.length; i++) {
                  charCount += lines[i].length + 1; // +1 for newline
                  if (charCount > queryIndex) {
                    matchLine = i + 1;
                    break;
                  }
                }

                // Extract context around the match
                const start = Math.max(0, queryIndex - contextLength);
                const end = Math.min(content.length, queryIndex + query.length + contextLength);
                let context = content.substring(start, end);

                // Clean up context (remove markdown syntax for display)
                context = context
                  .replace(/#{1,6}\s/g, '') // Remove heading markers
                  .replace(/\*\*/g, '') // Remove bold
                  .replace(/\*/g, '') // Remove italic
                  .replace(/`/g, '') // Remove code markers
                  .replace(/\n+/g, ' ') // Replace newlines with spaces
                  .trim();

                // Add ellipsis if context was truncated
                if (start > 0) context = '...' + context;
                if (end < content.length) context = context + '...';

                const page = entry.name.replace('.md', '');
                const categoryPath = category || path.basename(path.dirname(fullPath));

                results.push({
                  category: categoryPath,
                  page: page,
                  title: title,
                  context: context,
                  line: matchLine,
                  path: `${categoryPath}.${page}`
                });
              }
            } catch (readError) {
              console.error(`[IPC search-docs] Error reading file ${fullPath}:`, readError);
            }
          }
        }
      } catch (err) {
        console.error(`[IPC search-docs] Error reading directory ${dirPath}:`, err);
      }
    }

    searchDir(docsPath);

    console.log(`[IPC search-docs] Found ${results.length} results for query: "${searchQuery}"`);
    return { results, total: results.length };

  } catch (error) {
    console.error('[IPC search-docs] Error searching docs:', error);
    return { results: [], error: error.message };
  }
});

// --- End Docs Search IPC Handler ---

// 📖 Read Documentation File (Electron IPC)
ipcMain.handle("read-doc-file", async (_, category, page, language = 'en') => {
  try {
    if (!category || !page) {
      return { error: 'Category and page are required' };
    }

    // Use sandboxed path resolution
    const docPath = getSafeAbsolutePath(`engine_files/docs/${language}/${category}/${page}.md`);
    if (!docPath) {
      return { error: 'Invalid documentation path' };
    }

    if (!fs.existsSync(docPath)) {
      return { error: `Documentation file not found: ${category}/${page}.md` };
    }

    const content = fs.readFileSync(docPath, 'utf-8');
    return { content };

  } catch (error) {
    console.error('[IPC read-doc-file] Error reading doc file:', error);
    return { error: error.message };
  }
});

// --- End Read Doc File IPC Handler ---

function getSafeAbsolutePath(userInputPath) {
  try {

    let resolvedPath;
    if (userInputPath) {
      resolvedPath = path.resolve(assetsFolder + "/", userInputPath);
    } else {
      resolvedPath = assetsFolder;
    }

    // Check that it's still inside the project folder
    if (!resolvedPath.startsWith(assetsFolder)) {
      dialog.showErrorBox('Error', 'Path traversal attempt blocked');
      //app.quit();
      return null;
    }

    // Check if the path exists before trying to get its stats
    if (fs.existsSync(resolvedPath)) {
      // Block symlinks if the path exists
      const stat = fs.lstatSync(resolvedPath);
      if (stat.isSymbolicLink()) {
        dialog.showErrorBox('Error', 'Symlinks are not allowed');
        //app.quit();
        return null;
      }
    }
    // If the path doesn't exist, it's considered safe for creation/reading (will return null/empty later)

    return resolvedPath;
  } catch (err) {
    // Only show error box for errors other than ENOENT (file not found)
    // ENOENT is expected if we are trying to write a new file.
    // Other errors (EACCES, etc.) should still be reported.
    if (err.code !== 'ENOENT') {
      dialog.showErrorBox('Path Error', `Error validating path: ${err.message}`);
      // app.quit();
    }
    // For ENOENT or after showing the dialog for other errors, return null.
    // It might be safer to return null even for ENOENT if the calling function expects it.
    // Let's return null to be consistent with existing error handling.
    return null; // Return null if path doesn't exist or on other validation errors
  }
}

// 📂 Read JSON File (Electron IPC)
ipcMain.handle("read-json", async (_, filePath) => {
  const safePath = getSafeAbsolutePath(filePath); // Expects string, returns string or null
  if (!safePath) {
    // If path is invalid/unsafe, getSafeAbsolutePath might show a dialog.
    // Log here for clarity, return null.
    console.warn(`[IPC read-json] Invalid or unsafe path resolved for input: ${filePath}`);
    // dialog.showErrorBox('Unsafe or invalid file path.'); // Removed as likely redundant
    return null; // Return null if path is bad
  }

  try {
    // Use safePath directly, which is the resolved absolute path
    const absolutePath = safePath;
    console.log(`[IPC read-json] Attempting to read: ${absolutePath}`);

    // Check existence *before* reading
    if (!fs.existsSync(absolutePath)) {
      console.warn(`[IPC read-json] File not found: ${absolutePath}`);
      return null; // Explicitly return null if file doesn't exist
    }

    // Now read and parse, assuming file exists
    const data = fs.readFileSync(absolutePath, "utf-8");
    const jsonData = JSON.parse(data); // This can still throw if file content is not valid JSON
    console.log(`[IPC read-json] Successfully read and parsed: ${absolutePath}`);
    return jsonData;

  } catch (error) {
    // Catch errors ONLY from readFileSync or JSON.parse (or other unexpected issues)
    console.error(`[IPC read-json] Error processing file ${safePath}:`, error);
    // Show a dialog for these unexpected errors (like permission denied, parse errors)
    dialog.showErrorBox("Error reading file", `Failed to read or parse ${filePath || 'provided path'}. Error: ${error.message || String(error)}`);
    // Return null for any processing error
    return null;
  }
});

// ✍️ Write JSON File (Electron IPC)
ipcMain.handle("write-json", async (_, filePath, jsonData) => {
  const safePath = getSafeAbsolutePath(filePath);
  if (!safePath) {
    dialog.showErrorBox('Unsafe or invalid file path.');
    return;
  }

  try {
    // Handle paths relative to the app root
    const appPath = app.getAppPath();
    const absolutePath = path.join(appPath, "../../assets/", filePath);

    console.log('Writing file to:', absolutePath);

    // Ensure directory exists
    const directory = path.dirname(absolutePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(absolutePath, JSON.stringify(jsonData, null, 2), "utf-8");
    return { message: "JSON saved successfully!" };
  } catch (error) {
    dialog.showErrorBox("Error writing file:", error);
    return;
  }
});

// 📂 List Files in Directory (Electron IPC)
ipcMain.handle("list-files", async (_, dirPath) => {
  const safePath = getSafeAbsolutePath(dirPath);
  if (!safePath) {
    dialog.showErrorBox('Error', 'Unsafe or invalid directory path.');
    return [];
  }

  try {
    if (!fs.existsSync(safePath) || !fs.lstatSync(safePath).isDirectory()) {
      console.error('Error', 'Directory does not exist or is not a directory.');
      return [];
    }
    const files = fs.readdirSync(safePath);
    // Filter for files only
    return files.filter(file => fs.lstatSync(path.join(safePath, file)).isFile());
  } catch (error) {
    dialog.showErrorBox("Error listing files:", error.message);
    return [];
  }
});

// 📂 List Folders in Directory (Electron IPC)
ipcMain.handle("list-folders", async (_, dirPath) => {
  const safePath = getSafeAbsolutePath(dirPath);
  if (!safePath) {
    dialog.showErrorBox('Error', 'Unsafe or invalid directory path.');
    return [];
  }

  try {
    if (!fs.existsSync(safePath) || !fs.lstatSync(safePath).isDirectory()) {
      console.error('Error', 'Directory does not exist or is not a directory.');
      return [];
    }
    const files = fs.readdirSync(safePath);
    // Filter for directories only
    return files.filter(file => fs.lstatSync(path.join(safePath, file)).isDirectory());
  } catch (error) {
    dialog.showErrorBox("Error listing folders:", error.message);
    return [];
  }
});

// 🗑️ Delete File (Electron IPC)
ipcMain.handle("delete-file", async (_, filePath, recursive = false) => {
  const safePath = getSafeAbsolutePath(filePath);
  if (!safePath) {
    dialog.showErrorBox('Error', 'Unsafe or invalid file path.');
    return;
  }

  try {
    if (!fs.existsSync(safePath)) {
      dialog.showErrorBox('Error', 'File or directory does not exist.');
      return;
    }

    const isDirectory = fs.lstatSync(safePath).isDirectory();

    if (isDirectory) {
      if (!recursive) {
        dialog.showErrorBox('Error', 'Path is a directory. Recursive deletion required.');
        return;
      }
      // Delete directory recursively
      fs.rmSync(safePath, { recursive: true, force: true });
      return { message: "Directory deleted successfully!" };
    } else {
      // Delete file
      fs.unlinkSync(safePath);
      return { message: "File deleted successfully!" };
    }
  } catch (error) {
    dialog.showErrorBox("Error deleting file or directory:", error.message);
    return;
  }
});

// 🤔 Check Path Existence (Electron IPC)
ipcMain.handle("path-exists", async (_, itemPath) => {
  const safePath = getSafeAbsolutePath(itemPath);
  if (!safePath) {
    // If the path is unsafe/invalid, it effectively doesn't exist for our purposes
    return false;
  }
  try {
    return fs.existsSync(safePath);
  } catch (error) {
    // Log the error but return false as it likely means the path is inaccessible or invalid
    console.error("Error checking path existence:", error);
    dialog.showErrorBox("Path Check Error", `Error checking path existence: ${error.message}`);
    return false;
  }
});


// ➕ Create Directory (Electron IPC)
ipcMain.handle("create-dir", async (_, dirPath) => {
  const safePath = getSafeAbsolutePath(dirPath);
  if (!safePath) {
    dialog.showErrorBox('Error', 'Unsafe or invalid directory path for creation.');
    return;
  }

  try {
    // Check if it already exists and is a directory
    if (fs.existsSync(safePath)) {
      if (fs.lstatSync(safePath).isDirectory()) {
        // Directory already exists, arguably a success
        return { message: "Directory already exists." };
      } else {
        dialog.showErrorBox('Error', 'Path exists but is not a directory.');
        return;
      }
    }

    const parentDir = path.dirname(safePath);
    // Resolve parentDir using getSafeAbsolutePath.
    // If safePath is assetsFolder, parentDir is its system parent, so sandboxedParent will be null.
    // If safePath is deeper, parentDir should be assetsFolder or within it.
    const sandboxedParent = getSafeAbsolutePath(parentDir);

    if (!sandboxedParent) {
      if (safePath === assetsFolder) {
        const actualParentOfAssets = path.dirname(assetsFolder);
        if (!fs.existsSync(actualParentOfAssets) || !fs.lstatSync(actualParentOfAssets).isDirectory()) {
          dialog.showErrorBox('Error', `Cannot create directory '${path.basename(assetsFolder)}' because its containing folder '${actualParentOfAssets}' does not exist or is not a directory.`);
          return;
        }
      } else {
        dialog.showErrorBox('Error', 'Cannot create directory, its parent path is outside the allowed application sandbox.');
        return;
      }
    } else {
      if (fs.existsSync(sandboxedParent) && !fs.lstatSync(sandboxedParent).isDirectory()) {
        dialog.showErrorBox('Error', `Cannot create directory, its parent path ('${parentDir}') exists but is not a directory.`);
        return;
      }
    }

    fs.mkdirSync(safePath, { recursive: true });
    return { message: "Directory created successfully!" };
  } catch (error) {
    dialog.showErrorBox("Error creating directory:", error.message);
    return;
  }
});

// 📂 List Files Recursively (Electron IPC)
ipcMain.handle("list-files-recursively", async (_, startDirPath, assetFolders, ignoreEngineAssets) => {
  // Get the absolute path rooted in the assets folder
  const safeStartPath = getSafeAbsolutePath(startDirPath);
  if (!safeStartPath) {
    console.error('[IPC list-files-recursively] Invalid start path provided:', startDirPath);
    return [];
  }

  const allFiles = [];
  const ignoreFolders = ['engine_files', 'games_files', 'backup']; // Folders to ignore at the root of assets

  // Add engine_assets to ignore list if requested
  if (ignoreEngineAssets === true) {
    ignoreFolders.push('engine_assets');
  }

  const baseAssetsPath = assetsFolder; // Already ends with separator

  // Correctly get the base path string without the trailing separator for comparison
  const baseAssetsPathComparable = baseAssetsPath.endsWith(path.sep)
    ? baseAssetsPath.slice(0, -1)
    : baseAssetsPath;

  // Helper function to check if a path should be included based on asset_folders
  function shouldIncludePath(relativePath) {
    // If no asset_folders specified, include everything
    if (!assetFolders || !Array.isArray(assetFolders) || assetFolders.length === 0) {
      return true;
    }

    // Check if relativePath starts with games_assets/
    if (!relativePath.startsWith('games_assets/')) {
      return true; // Include non-games_assets files (like engine_assets if not ignored)
    }

    // Remove 'games_assets/' prefix to get the path comparable to asset_folders
    const pathWithoutPrefix = relativePath.substring('games_assets/'.length);

    // Check if path starts with any of the allowed asset_folders
    return assetFolders.some(folder => {
      // Normalize folder path (remove leading/trailing slashes)
      const normalizedFolder = folder.replace(/^\/+|\/+$/g, '');
      return pathWithoutPrefix.startsWith(normalizedFolder + '/') || pathWithoutPrefix === normalizedFolder;
    });
  }

  function walkDir(currentPath) {
    try {
      if (!fs.existsSync(currentPath) || !fs.lstatSync(currentPath).isDirectory()) {
        console.warn(`[WalkDir] Skipping non-existent or non-directory path: ${currentPath}`);
        return;
      }
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        // Log entry details *before* any checks
        console.log(`[WalkDir Check] Entry: ${entry.name}, Type: ${entry.isDirectory() ? 'Dir' : 'File'}, Parent: ${path.dirname(fullPath)}, BaseComparable: ${baseAssetsPathComparable}`);

        if (entry.isSymbolicLink()) {
          console.warn(`[WalkDir] Skipping symbolic link: ${fullPath}`);
          continue;
        }

        if (entry.isDirectory()) {
          // --- Ignore Check using corrected baseAssetsPathComparable ---
          const parentDir = path.dirname(fullPath);
          const isDirectChild = parentDir === baseAssetsPathComparable;
          const shouldIgnore = ignoreFolders.includes(entry.name);
          // Log the components of the ignore check
          // console.log(`[WalkDir Ignore Check] Dir: ${entry.name}, Parent: ${parentDir}, IsDirectChild: ${isDirectChild}, ShouldIgnoreName: ${shouldIgnore}`);

          if (isDirectChild && shouldIgnore) {
            // console.log(`[WalkDir] *** IGNORING folder at root: ${entry.name} ***`);
            continue; // Skip this directory
          }
          // --- End Ignore Check ---

          // Security check: Ensure recursion stays within assetsPath boundary
          if (fullPath.startsWith(baseAssetsPath)) {
            console.log(`[WalkDir] Recursing into: ${entry.name}`);
            walkDir(fullPath);
          } else {
            console.warn(`[WalkDir] Skipping directory recursion outside assets boundary: ${fullPath}`);
          }
        } else if (entry.isFile()) {
          // Get path relative to the base assets folder
          const relativePath = path.relative(baseAssetsPath, fullPath);
          const normalizedPath = relativePath.split(path.sep).join('/');

          // Check if this path should be included based on asset_folders filter
          if (shouldIncludePath(normalizedPath)) {
            console.log(`[WalkDir] Adding file: ${normalizedPath}`);
            allFiles.push(normalizedPath);
          } else {
            console.log(`[WalkDir] Filtering out file (not in asset_folders): ${normalizedPath}`);
          }
        }
      }
    } catch (err) {
      console.error(`[WalkDir] Error reading directory ${currentPath}:`, err);
    }
  }

  try {
    if (!fs.existsSync(safeStartPath) || !fs.lstatSync(safeStartPath).isDirectory()) {
      console.error(`[IPC list-files-recursively] Starting directory does not exist or is not a directory: ${safeStartPath}`);
      return [];
    }
    console.log(`[IPC list-files-recursively] Starting walk from: ${safeStartPath}`);
    walkDir(safeStartPath);
    console.log(`[IPC list-files-recursively] Finished walk. Found ${allFiles.length} files.`);
    return allFiles;
  } catch (error) {
    console.error(`[IPC list-files-recursively] Top-level error:`, error);
    return [];
  }
});

// 📏 Get File Size (Electron IPC)
ipcMain.handle("get-file-size", async (_, relativePath) => {
  try {
    // Strip 'assets/' prefix if present (file paths from frontend include this)
    let normalizedPath = relativePath;
    if (relativePath.startsWith('assets/')) {
      normalizedPath = relativePath.substring('assets/'.length);
    }

    const safePath = getSafeAbsolutePath(normalizedPath);
    if (!safePath) {
      console.warn(`[IPC get-file-size] Invalid or unsafe path: ${relativePath}`);
      throw new Error('Invalid or unsafe file path');
    }
    const stats = await fs.promises.stat(safePath);
    return stats.size;
  } catch (error) {
    console.error('[IPC get-file-size] Error getting file size:', error);
    throw error;
  }
});

// 🖼️ Convert PNG to WebP (Electron IPC)
ipcMain.handle("convert-to-webp", async (_, { pngPath, quality, lossless }) => {
  try {
    // Strip 'assets/' prefix if present (file paths from frontend include this)
    let normalizedPath = pngPath;
    if (pngPath.startsWith('assets/')) {
      normalizedPath = pngPath.substring('assets/'.length);
    }

    const inputPath = getSafeAbsolutePath(normalizedPath);
    if (!inputPath) {
      console.warn(`[IPC convert-to-webp] Invalid or unsafe path: ${pngPath}`);
      throw new Error('Invalid or unsafe file path');
    }

    // Generate output path (supports PNG, JPG, JPEG)
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

    // Return relative path and size info (add 'assets/' prefix back)
    const pathWithoutBase = outputPath.replace(assetsFolder + path.sep, '').split(path.sep).join('/');
    const relativePath = `assets/${pathWithoutBase}`;
    console.log(`[IPC convert-to-webp] Converted ${pngPath} to ${relativePath}`);
    return {
      webpPath: relativePath,
      originalSize: originalStats.size,
      newSize: newStats.size
    };
  } catch (error) {
    console.error('[IPC convert-to-webp] Error converting to WebP:', error);
    throw error;
  }
});

// 💾 Backup Original File (Electron IPC)
ipcMain.handle("backup-original-file", async (_, relativePath) => {
  try {
    // Strip 'assets/' prefix if present (file paths from frontend include this)
    let normalizedPath = relativePath;
    if (relativePath.startsWith('assets/')) {
      normalizedPath = relativePath.substring('assets/'.length);
    }

    const sourcePath = getSafeAbsolutePath(normalizedPath);
    if (!sourcePath) {
      console.warn(`[IPC backup-original-file] Invalid or unsafe path: ${relativePath}`);
      throw new Error('Invalid or unsafe file path');
    }

    // Create backup path: assets/backup/[original-path]
    // Use getSafeAbsolutePath to ensure backup path is also sandboxed
    const backupPath = getSafeAbsolutePath(path.join('backup', normalizedPath));
    if (!backupPath) {
      console.warn(`[IPC backup-original-file] Invalid or unsafe backup path: backup/${normalizedPath}`);
      throw new Error('Invalid or unsafe backup path');
    }
    const backupDir = path.dirname(backupPath);

    // Ensure backup directory exists
    await fs.promises.mkdir(backupDir, { recursive: true });

    // Move file (rename is atomic and efficient)
    await fs.promises.rename(sourcePath, backupPath);

    const relativeBackupPath = `assets/backup/${normalizedPath}`;
    console.log(`[IPC backup-original-file] Backed up ${relativePath} to ${relativeBackupPath}`);
    return {
      success: true,
      backupPath: relativeBackupPath
    };
  } catch (error) {
    console.error('[IPC backup-original-file] Error backing up file:', error);
    throw error;
  }
});

// 📦 Export Game/Mod as ZIP Archive (Electron IPC)
ipcMain.handle("export-game-zip", async (_, { gameId, modId, assetFolders, outputFileName }) => {
  try {
    console.log(`[IPC export-game-zip] Starting export: ${outputFileName}.zip`);
    console.log(`[IPC export-game-zip] Game: ${gameId}, Mod: ${modId}, Asset Folders:`, assetFolders);

    // Validate parameters
    if (!gameId || !modId || !outputFileName) {
      throw new Error('Missing required parameters: gameId, modId, or outputFileName');
    }

    // Create output path in assets root
    const outputPath = path.join(assetsFolder, `${outputFileName}.zip`);
    console.log(`[IPC export-game-zip] Output path: ${outputPath}`);

    // Validate output path is within assets folder
    if (!outputPath.startsWith(assetsFolder)) {
      throw new Error('Output path must be within assets folder');
    }

    // Validate game/mod data folder exists
    const dataFolderPath = path.join(assetsFolder, 'games_files', gameId, modId);
    if (!fs.existsSync(dataFolderPath)) {
      throw new Error(`Game/mod data folder not found: games_files/${gameId}/${modId}`);
    }

    // Validate all asset folders exist before starting export
    if (assetFolders && Array.isArray(assetFolders)) {
      const missingFolders = [];
      for (const folder of assetFolders) {
        const assetFolderPath = path.join(assetsFolder, 'games_assets', folder);

        // Check if path is safe
        if (!assetFolderPath.startsWith(assetsFolder)) {
          throw new Error(`Invalid asset folder path: ${folder}`);
        }

        // Check if folder exists
        if (!fs.existsSync(assetFolderPath)) {
          missingFolders.push(folder);
        }
      }

      // If any folders are missing, throw error with list
      if (missingFolders.length > 0) {
        throw new Error(`Asset folders not found: ${missingFolders.join(', ')}`);
      }
    }

    // Create write stream for the ZIP file
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Hardcoded exclude patterns
    const excludePatterns = [
      '**/*.psd',
      '**/*.xcf',
      '**/.git/**',
      '**/.DS_Store',
      '**/Thumbs.db'
    ];

    // Handle archive events
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('[IPC export-game-zip] Warning:', err);
      } else {
        throw err;
      }
    });

    archive.on('error', (err) => {
      throw err;
    });

    // Track progress
    let totalBytes = 0;
    archive.on('progress', (progress) => {
      totalBytes = progress.fs.totalBytes;
      console.log(`[IPC export-game-zip] Progress: ${progress.fs.processedBytes} / ${totalBytes} bytes`);
    });

    // Pipe archive to output file
    archive.pipe(output);

    // Add game/mod data files (games_files/{gameId}/{modId}/)
    console.log(`[IPC export-game-zip] Adding data files from: games_files/${gameId}/${modId}/`);
    archive.directory(dataFolderPath, `games_files/${gameId}/${modId}`, {
      ignore: excludePatterns
    });

    // Add asset folders from games_assets
    if (assetFolders && Array.isArray(assetFolders)) {
      for (const folder of assetFolders) {
        // folder format: "gameId/modId" or "gameId/_core"
        const assetFolderPath = path.join(assetsFolder, 'games_assets', folder);

        // Paths already validated above, safe to add
        console.log(`[IPC export-game-zip] Adding asset folder: games_assets/${folder}/`);
        archive.directory(assetFolderPath, `games_assets/${folder}`, {
          ignore: excludePatterns
        });
      }
    }

    // Finalize the archive
    await archive.finalize();

    // Wait for the output stream to finish
    await new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`[IPC export-game-zip] Archive created: ${outputPath}`);
        console.log(`[IPC export-game-zip] Total bytes: ${archive.pointer()}`);
        resolve();
      });
      output.on('error', reject);
    });

    // Open file browser to show the created ZIP
    try {
      await shell.showItemInFolder(outputPath);
      console.log(`[IPC export-game-zip] Opened file browser for: ${outputPath}`);
    } catch (err) {
      console.warn(`[IPC export-game-zip] Could not open file browser:`, err);
    }

    return {
      success: true,
      zipPath: outputPath,
      fileName: `${outputFileName}.zip`,
      size: archive.pointer()
    };

  } catch (error) {
    console.error('[IPC export-game-zip] Error creating archive:', error);
    throw error;
  }
});

// 📦 Scan Install Archives (Electron IPC)
ipcMain.handle("scan-install-archives", async () => {
  try {
    const installPath = getSafeAbsolutePath('install');
    if (!installPath) {
      console.error('[IPC scan-install-archives] Invalid install path');
      return [];
    }

    // Create install directory if it doesn't exist
    if (!fs.existsSync(installPath)) {
      fs.mkdirSync(installPath, { recursive: true });
      return [];
    }

    // Read directory and filter for .zip files
    const files = fs.readdirSync(installPath);
    const zipFiles = files.filter(file => file.toLowerCase().endsWith('.zip'));

    console.log(`[IPC scan-install-archives] Found ${zipFiles.length} ZIP files in install folder`);
    return zipFiles;

  } catch (error) {
    console.error('[IPC scan-install-archives] Error scanning install folder:', error);
    return [];
  }
});

// 📦 Read Archive Manifest (Electron IPC)
ipcMain.handle("read-archive-manifest", async (_, zipFileName) => {
  return new Promise((resolve) => {
    try {
      const zipPath = getSafeAbsolutePath('install/' + zipFileName);
      if (!zipPath) {
        resolve({ valid: false, error: 'Invalid archive path' });
        return;
      }

      if (!fs.existsSync(zipPath)) {
        resolve({ valid: false, error: 'Archive file not found' });
        return;
      }

      console.log(`[IPC read-archive-manifest] Reading manifest from ${zipFileName}`);

      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          console.error('[IPC read-archive-manifest] Error opening ZIP:', err);
          resolve({ valid: false, error: 'Failed to open archive: ' + err.message });
          return;
        }

        let manifestFound = false;
        let manifestData = null;

        zipfile.readEntry();

        zipfile.on('entry', (entry) => {
          // Look for manifest.json in games_files/{gameId}/{modId}/manifest.json pattern
          const manifestMatch = entry.fileName.match(/^games_files\/([^/]+)\/([^/]+)\/manifest\.json$/);

          if (manifestMatch && !manifestFound) {
            manifestFound = true;
            const gameId = manifestMatch[1];
            const modId = manifestMatch[2];
            const isGame = modId === '_core';

            // Read the manifest content
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                console.error('[IPC read-archive-manifest] Error reading manifest stream:', err);
                zipfile.close();
                resolve({ valid: false, error: 'Failed to read manifest' });
                return;
              }

              let manifestContent = '';
              readStream.on('data', (chunk) => {
                manifestContent += chunk.toString('utf8');
              });

              readStream.on('end', () => {
                try {
                  const manifest = JSON.parse(manifestContent);
                  zipfile.close();
                  resolve({
                    valid: true,
                    name: manifest.name || 'Unknown',
                    type: isGame ? 'game' : 'mod',
                    version: manifest.version || '0.0.0',
                    gameId: gameId,
                    modId: modId
                  });
                } catch (parseError) {
                  console.error('[IPC read-archive-manifest] Error parsing manifest JSON:', parseError);
                  zipfile.close();
                  resolve({ valid: false, error: 'Invalid manifest JSON' });
                }
              });

              readStream.on('error', (err) => {
                console.error('[IPC read-archive-manifest] Stream error:', err);
                zipfile.close();
                resolve({ valid: false, error: 'Error reading manifest stream' });
              });
            });
          } else {
            // Continue reading next entry
            zipfile.readEntry();
          }
        });

        zipfile.on('end', () => {
          if (!manifestFound) {
            console.warn('[IPC read-archive-manifest] No manifest found in archive');
            resolve({ valid: false, error: 'No valid manifest found in archive' });
          }
        });

        zipfile.on('error', (err) => {
          console.error('[IPC read-archive-manifest] ZIP error:', err);
          resolve({ valid: false, error: 'Archive error: ' + err.message });
        });
      });

    } catch (error) {
      console.error('[IPC read-archive-manifest] Unexpected error:', error);
      resolve({ valid: false, error: 'Unexpected error: ' + error.message });
    }
  });
});

// 📦 Check Mod Installed (Electron IPC)
ipcMain.handle("check-mod-installed", async (_, gameId, modId) => {
  try {
    const manifestPath = getSafeAbsolutePath(`games_files/${gameId}/${modId}/manifest.json`);
    if (!manifestPath) {
      return { installed: false };
    }

    if (!fs.existsSync(manifestPath)) {
      return { installed: false };
    }

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);

    console.log(`[IPC check-mod-installed] ${gameId}/${modId} is installed, version: ${manifest.version}`);
    return {
      installed: true,
      version: manifest.version || '0.0.0'
    };

  } catch (error) {
    console.error('[IPC check-mod-installed] Error checking mod:', error);
    return { installed: false };
  }
});

// 📦 Install Game Archive (Electron IPC)
ipcMain.handle("install-game-archive", async (event, zipFileName) => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const tempFolderName = `.temp_install_${timestamp}`;
    let tempPath = null;

    try {
      const zipPath = getSafeAbsolutePath('install/' + zipFileName);
      if (!zipPath) {
        resolve({ success: false, error: 'Invalid archive path', errorCode: 'INVALID_PATH' });
        return;
      }

      if (!fs.existsSync(zipPath)) {
        resolve({ success: false, error: 'Archive file not found', errorCode: 'FILE_NOT_FOUND' });
        return;
      }

      tempPath = getSafeAbsolutePath(tempFolderName);
      if (!tempPath) {
        resolve({ success: false, error: 'Invalid temp path', errorCode: 'INVALID_PATH' });
        return;
      }

      console.log(`[IPC install-game-archive] Installing ${zipFileName} via ${tempFolderName}`);

      // Create temp directory
      fs.mkdirSync(tempPath, { recursive: true });

      yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
        if (err) {
          console.error('[IPC install-game-archive] Error opening ZIP:', err);
          // Cleanup
          if (tempPath && fs.existsSync(tempPath)) {
            fs.rmSync(tempPath, { recursive: true, force: true });
          }
          resolve({ success: false, error: 'Failed to open archive: ' + err.message, errorCode: 'CORRUPT_ZIP' });
          return;
        }

        const entries = [];
        let totalEntries = 0;
        let processedEntries = 0;

        // First pass: count entries
        zipfile.on('entry', (entry) => {
          entries.push(entry);
          zipfile.readEntry();
        });

        zipfile.once('end', () => {
          totalEntries = entries.length;
          console.log(`[IPC install-game-archive] Total entries: ${totalEntries}`);

          // Reopen for extraction
          yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile2) => {
            if (err) {
              if (tempPath && fs.existsSync(tempPath)) {
                fs.rmSync(tempPath, { recursive: true, force: true });
              }
              resolve({ success: false, error: 'Failed to reopen archive', errorCode: 'CORRUPT_ZIP' });
              return;
            }

            zipfile2.readEntry();

            zipfile2.on('entry', (entry) => {
              // Validate entry path (no .. or absolute paths)
              if (entry.fileName.includes('..') || path.isAbsolute(entry.fileName)) {
                console.warn(`[IPC install-game-archive] Blocked suspicious path: ${entry.fileName}`);
                zipfile2.readEntry();
                return;
              }

              // Build target path with sandboxing
              const targetPath = getSafeAbsolutePath(tempFolderName + '/' + entry.fileName);
              if (!targetPath || !targetPath.startsWith(tempPath)) {
                console.warn(`[IPC install-game-archive] Path escapes temp folder: ${entry.fileName}`);
                zipfile2.readEntry();
                return;
              }

              // Handle directories
              if (/\/$/.test(entry.fileName)) {
                fs.mkdirSync(targetPath, { recursive: true });
                processedEntries++;
                const percent = Math.floor((processedEntries / totalEntries) * 100);
                event.sender.send('install-progress', {
                  percent,
                  currentFile: entry.fileName,
                  totalFiles: totalEntries
                });
                zipfile2.readEntry();
              } else {
                // Handle files
                zipfile2.openReadStream(entry, (err, readStream) => {
                  if (err) {
                    console.error('[IPC install-game-archive] Error reading entry:', err);
                    zipfile2.close();
                    if (tempPath && fs.existsSync(tempPath)) {
                      fs.rmSync(tempPath, { recursive: true, force: true });
                    }
                    resolve({ success: false, error: 'Error extracting file', errorCode: 'EXTRACTION_ERROR' });
                    return;
                  }

                  // Ensure directory exists
                  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

                  const writeStream = fs.createWriteStream(targetPath);

                  readStream.pipe(writeStream);

                  writeStream.on('finish', () => {
                    processedEntries++;
                    const percent = Math.floor((processedEntries / totalEntries) * 100);
                    event.sender.send('install-progress', {
                      percent,
                      currentFile: entry.fileName,
                      totalFiles: totalEntries
                    });
                    zipfile2.readEntry();
                  });

                  writeStream.on('error', (err) => {
                    console.error('[IPC install-game-archive] Write error:', err);
                    zipfile2.close();
                    if (tempPath && fs.existsSync(tempPath)) {
                      fs.rmSync(tempPath, { recursive: true, force: true });
                    }
                    const errorCode = err.code === 'ENOSPC' ? 'ENOSPC' : err.code === 'EACCES' ? 'EACCES' : 'WRITE_ERROR';
                    resolve({ success: false, error: err.message, errorCode });
                  });
                });
              }
            });

            zipfile2.once('end', () => {
              console.log('[IPC install-game-archive] Extraction complete, validating...');

              // Validate structure: check for games_files/{gameId}/{modId}/manifest.json
              const gamesFilesPath = getSafeAbsolutePath(tempFolderName + '/games_files');
              if (!gamesFilesPath || !fs.existsSync(gamesFilesPath)) {
                if (tempPath && fs.existsSync(tempPath)) {
                  fs.rmSync(tempPath, { recursive: true, force: true });
                }
                resolve({ success: false, error: 'Invalid archive structure: missing games_files folder', errorCode: 'INVALID_STRUCTURE' });
                return;
              }

              // Find the manifest
              const gameIds = fs.readdirSync(gamesFilesPath);
              let manifestFound = false;
              let gameId = null;
              let modId = null;
              let isGame = false;

              for (const gId of gameIds) {
                const gamePath = path.join(gamesFilesPath, gId);
                if (fs.lstatSync(gamePath).isDirectory()) {
                  const modIds = fs.readdirSync(gamePath);
                  for (const mId of modIds) {
                    const manifestPath = path.join(gamePath, mId, 'manifest.json');
                    if (fs.existsSync(manifestPath)) {
                      gameId = gId;
                      modId = mId;
                      isGame = modId === '_core';
                      manifestFound = true;
                      break;
                    }
                  }
                  if (manifestFound) break;
                }
              }

              if (!manifestFound) {
                if (tempPath && fs.existsSync(tempPath)) {
                  fs.rmSync(tempPath, { recursive: true, force: true });
                }
                resolve({ success: false, error: 'No valid manifest found in archive', errorCode: 'INVALID_STRUCTURE' });
                return;
              }

              // For mods, verify parent game exists
              if (!isGame) {
                const parentGameManifest = getSafeAbsolutePath(`games_files/${gameId}/_core/manifest.json`);
                if (!parentGameManifest || !fs.existsSync(parentGameManifest)) {
                  if (tempPath && fs.existsSync(tempPath)) {
                    fs.rmSync(tempPath, { recursive: true, force: true });
                  }
                  resolve({ success: false, error: `Parent game '${gameId}' not installed`, errorCode: 'PARENT_GAME_MISSING' });
                  return;
                }
              }

              // Copy from temp to final locations
              try {
                // Copy games_files
                const tempGamesFiles = getSafeAbsolutePath(tempFolderName + '/games_files');
                const finalGamesFiles = getSafeAbsolutePath('games_files');
                if (tempGamesFiles && finalGamesFiles && fs.existsSync(tempGamesFiles)) {
                  const gameIds = fs.readdirSync(tempGamesFiles);
                  for (const gId of gameIds) {
                    const srcGamePath = path.join(tempGamesFiles, gId);
                    const destGamePath = path.join(finalGamesFiles, gId);

                    if (!fs.existsSync(destGamePath)) {
                      fs.mkdirSync(destGamePath, { recursive: true });
                    }

                    const modIds = fs.readdirSync(srcGamePath);
                    for (const mId of modIds) {
                      const srcModPath = path.join(srcGamePath, mId);
                      const destModPath = path.join(destGamePath, mId);

                      // Remove existing if present
                      if (fs.existsSync(destModPath)) {
                        fs.rmSync(destModPath, { recursive: true, force: true });
                      }

                      // Copy recursively
                      copyRecursive(srcModPath, destModPath);
                    }
                  }
                }

                // Copy games_assets (if present)
                const tempGamesAssets = getSafeAbsolutePath(tempFolderName + '/games_assets');
                const finalGamesAssets = getSafeAbsolutePath('games_assets');
                if (tempGamesAssets && finalGamesAssets && fs.existsSync(tempGamesAssets)) {
                  const assetIds = fs.readdirSync(tempGamesAssets);
                  for (const aId of assetIds) {
                    const srcAssetPath = path.join(tempGamesAssets, aId);
                    const destAssetPath = path.join(finalGamesAssets, aId);

                    if (!fs.existsSync(destAssetPath)) {
                      fs.mkdirSync(destAssetPath, { recursive: true });
                    }

                    const modIds = fs.readdirSync(srcAssetPath);
                    for (const mId of modIds) {
                      const srcModAssetPath = path.join(srcAssetPath, mId);
                      const destModAssetPath = path.join(destAssetPath, mId);

                      // Remove existing if present
                      if (fs.existsSync(destModAssetPath)) {
                        fs.rmSync(destModAssetPath, { recursive: true, force: true });
                      }

                      // Copy recursively
                      copyRecursive(srcModAssetPath, destModAssetPath);
                    }
                  }
                }

                // Cleanup temp folder
                if (tempPath && fs.existsSync(tempPath)) {
                  fs.rmSync(tempPath, { recursive: true, force: true });
                }

                console.log('[IPC install-game-archive] Installation successful!');
                resolve({ success: true });

              } catch (copyError) {
                console.error('[IPC install-game-archive] Error copying files:', copyError);
                if (tempPath && fs.existsSync(tempPath)) {
                  fs.rmSync(tempPath, { recursive: true, force: true });
                }
                const errorCode = copyError.code === 'ENOSPC' ? 'ENOSPC' : copyError.code === 'EACCES' ? 'EACCES' : 'COPY_ERROR';
                resolve({ success: false, error: copyError.message, errorCode });
              }
            });

            zipfile2.on('error', (err) => {
              console.error('[IPC install-game-archive] ZIP error during extraction:', err);
              if (tempPath && fs.existsSync(tempPath)) {
                fs.rmSync(tempPath, { recursive: true, force: true });
              }
              resolve({ success: false, error: err.message, errorCode: 'ZIP_ERROR' });
            });
          });
        });

        zipfile.readEntry();
      });

    } catch (error) {
      console.error('[IPC install-game-archive] Unexpected error:', error);
      if (tempPath && fs.existsSync(tempPath)) {
        fs.rmSync(tempPath, { recursive: true, force: true });
      }
      resolve({ success: false, error: error.message, errorCode: 'UNEXPECTED_ERROR' });
    }
  });
});

// Helper function to copy directory recursively
function copyRecursive(src, dest) {
  if (fs.lstatSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Added: HTTP Server for OAuth Callbacks
function createOAuthHttpServer(attempt = 0) { // Added attempt counter for EADDRINUSE
  return new Promise((resolve, reject) => {
    if (oauthHttpServer) {
      console.log('[OAuth Server] Server already created and presumed running.');
      resolve({ success: true, message: "Server already running." });
      return;
    }

    oauthHttpServer = http.createServer((req, res) => {
      const parsedReqUrl = url.parse(req.url, true);

      if (parsedReqUrl.pathname === OAUTH_CALLBACK_PATH) {
        const { code, error } = parsedReqUrl.query;
        let clientResponseSent = false;

        const stopServerAndRespond = (statusCode, title, message) => {
          if (!clientResponseSent) {
            res.writeHead(statusCode, { 'Content-Type': 'text/html' });
            res.end(`<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${message}</h1><p>You can close this window.</p></body></html>`);
            clientResponseSent = true;
          }
          // Stop the server
          if (oauthHttpServer) {
            oauthHttpServer.close(() => {
              console.log('[OAuth Server] HTTP server auto-closed after handling callback.');
              oauthHttpServer = null;
            });
          }
        };

        if (error) {
          console.error("[OAuth Server] Error received in callback:", error);
          if (dialog && typeof dialog.showErrorBox === 'function') {
            dialog.showErrorBox("OAuth Error", `Authentication failed: ${error}`);
          }
          if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('google-auth-callback', { error: String(error) });
          }
          stopServerAndRespond(400, "Auth Failed", `Authentication Failed. Error: ${error}.`);
          return;
        }

        if (code) {
          console.log("[OAuth Server] Authorization Code received via HTTP server:", code);
          if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('google-auth-callback', { code: String(code) });
          }
          stopServerAndRespond(200, "Auth Success", "Authentication Successful! The application has received the authorization code.");
          return;
        }

        console.warn("[OAuth Server] Received callback without code or error:", parsedReqUrl.query);
        stopServerAndRespond(400, "Invalid Callback", "Invalid OAuth Callback. No authorization code or error found.");
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    oauthHttpServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        const errorMsg = `OAuth Server Error: Port ${OAUTH_SERVER_PORT} is already in use. Google authentication might fail.`;
        console.error(`[OAuth Server] ${errorMsg}`);
        // Don't show dialog here as it might be too intrusive for an on-demand start
        oauthHttpServer = null; // Ensure it's null so a retry can happen if desired by renderer
        reject({ success: false, error: errorMsg, code: e.code });
      } else {
        console.error('[OAuth Server] Server error:', e);
        oauthHttpServer = null;
        reject({ success: false, error: `An unexpected error occurred with the internal OAuth server: ${e.message}`, code: e.code });
      }
    });

    oauthHttpServer.listen(OAUTH_SERVER_PORT, 'localhost', () => {
      console.log(`[OAuth Server] HTTP server for OAuth redirects listening on http://localhost:${OAUTH_SERVER_PORT}${OAUTH_CALLBACK_PATH}`);
      resolve({ success: true, message: "OAuth server started successfully." });
    });
  });
}
// End Added: HTTP Server for OAuth Callbacks

// IPC Handler to start the OAuth server
ipcMain.handle("start-oauth-server", async () => {
  try {
    return await createOAuthHttpServer();
  } catch (error) {
    // This catch block might be redundant if createOAuthHttpServer always rejects with an object
    console.error('[IPC start-oauth-server] Error caught:', error);
    return { success: false, error: error.message || "Failed to start OAuth server for an unknown reason.", code: error.code };
  }
});

// IPC Handler to stop the OAuth server
ipcMain.handle("stop-oauth-server", async () => {
  if (oauthHttpServer) {
    return new Promise((resolve) => {
      oauthHttpServer.close(() => {
        console.log('[IPC stop-oauth-server] OAuth HTTP server stopped by renderer.');
        oauthHttpServer = null;
        resolve({ success: true, message: "OAuth server stopped successfully." });
      });
    });
  } else {
    console.log('[IPC stop-oauth-server] OAuth HTTP server was not running.');
    return { success: true, message: "OAuth server was not running." };
  }
});

app.whenReady().then(() => {
  createWindow();
  //mainWindow.maximize();
  //mainWindow.show(); // Show the maximized window
  // createOAuthHttpServer(); // Removed: Start the OAuth HTTP server automatically
});

app.on('window-all-closed', function () {
  // if (oauthHttpServer) { // Removed: Close HTTP server automatically
  //   oauthHttpServer.close(() => {
  //     console.log('[OAuth Server] HTTP server closed.');
  //     oauthHttpServer = null;
  //   });
  // } 
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// --- Handle OAuth2 Redirect ---
// This is a basic example. You might need a more robust way to handle this,
// potentially starting a temporary local server or using a custom protocol.
// This current approach for http redirect might be tricky if multiple windows or auth flows occur.

app.on('open-url', (event, receivedUrl) => {
  console.log("[App open-url] Received URL:", receivedUrl);
  // This handler is primarily for custom URI schemes.
  // For http://localhost OAuth redirects, the internal HTTP server (createOAuthHttpServer) should handle it.
  // If the receivedUrl matches our GOOGLE_REDIRECT_URI, it means the HTTP server might not have caught it,
  // or this event fired in parallel. The HTTP server's response should be the primary mechanism.

  if (receivedUrl.startsWith(GOOGLE_REDIRECT_URI)) {
    console.warn(`[App open-url] WARNING: 'open-url' event caught for GOOGLE_REDIRECT_URI (${receivedUrl}). This should have been handled by the internal HTTP server. Processing as a fallback.`);
    event.preventDefault();
    const parsedUrl = new URL(receivedUrl);
    const authorizationCode = parsedUrl.searchParams.get('code');
    const error = parsedUrl.searchParams.get('error');

    if (error) {
      console.error("[OAuth Redirect via open-url] Error received:", error);
      if (dialog && typeof dialog.showErrorBox === 'function') {
        dialog.showErrorBox("OAuth Error (via open-url)", `Authentication failed: ${error}`);
      }
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('google-auth-callback', { error });
      }
      return;
    }

    if (authorizationCode) {
      console.log("[OAuth Redirect via open-url] Authorization Code received:", authorizationCode);
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('google-auth-callback', { code: authorizationCode });
      } else {
        console.error("[OAuth Redirect via open-url] mainWindow not available to send auth code.");
      }
    } else {
      console.warn("[OAuth Redirect via open-url] No authorization code or error found in URL:", receivedUrl);
    }
  } else {
    console.log(`[App open-url] URL (${receivedUrl}) does not match GOOGLE_REDIRECT_URI. Not processing as OAuth callback here.`);
    // Potentially handle other custom schemes if your app uses them.
  }
});

// It's also good practice to ensure your app is registered as a handler for the custom scheme if you use one.
// For http://localhost, this 'open-url' might not fire on all platforms reliably for the first launch.
// A more robust method involves a small http server within Electron main process.
// For simplicity, we'll rely on 'open-url' and the user having the app open.
// If you use a custom protocol like 'myapp://oauth/callback', you need to register it:
// if (process.defaultApp) {
//   if (process.argv.length >= 2) {
//     app.setAsDefaultProtocolClient('YOUR_CUSTOM_SCHEME', process.execPath, [path.resolve(process.argv[1])]);
//   }
// } else {
//   app.setAsDefaultProtocolClient('YOUR_CUSTOM_SCHEME');
// }
// And GOOGLE_REDIRECT_URI would be 'YOUR_CUSTOM_SCHEME://oauth/callback'
