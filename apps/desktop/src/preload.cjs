const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studyPopDesktop", Object.freeze({
  platform: process.platform,
  version: process.versions.electron,
  isDesktop: true,
  openExternal(url) {
    return ipcRenderer.invoke("studypop:open-external", url);
  },
}));
