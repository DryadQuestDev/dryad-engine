const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
      invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
      // Add \'on\' and \'removeListener\' for renderer to receive messages from main
      on: (channel, listener) => {
        // Validate channel string if necessary
        ipcRenderer.on(channel, (event, ...args) => listener(...args));
      },
      removeListener: (channel, listener) => {
        // Validate channel string if necessary
        ipcRenderer.removeListener(channel, listener);
      },
      removeAllListeners: (channel) => {
        // Validate channel string if necessary
        ipcRenderer.removeAllListeners(channel);
      }
  }
  // Note: The specific function mappings below are now superseded by exposing invoke directly,
  /*
  readJson: (filePath) => ipcRenderer.invoke("read-json", filePath),
  writeJson: (filePath, data) => ipcRenderer.invoke("write-json", filePath, data),
  listFiles: (dirPath) => ipcRenderer.invoke("list-files", dirPath),
  listFolders: (dirPath) => ipcRenderer.invoke("list-folders", dirPath),
  listFilesRecursively: (dirPath) => ipcRenderer.invoke("list-files-recursively", dirPath),
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),
  pathExists: (itemPath) => ipcRenderer.invoke("path-exists", itemPath),
  createDir: (dirPath) => ipcRenderer.invoke("create-dir", dirPath),
  */
});
