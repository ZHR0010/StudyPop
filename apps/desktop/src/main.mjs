import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const productionUrl = "https://studypop-flame.vercel.app/";
const appUrl = process.env.STUDYPOP_APP_URL || productionUrl;
const headlessSmokeTest = process.env.STUDYPOP_HEADLESS === "1";
const allowedOrigin = new URL(appUrl).origin;
const mediaPermissions = new Set(["camera", "microphone", "media"]);
const allowedExternalHosts = new Set([
  "platform.openai.com",
  "firebase.google.com",
  "github.com",
]);

function isAllowedUrl(value) {
  try {
    return new URL(value).origin === allowedOrigin;
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && allowedExternalHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

function configurePermissions() {
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      mediaPermissions.has(permission) && requestingOrigin === allowedOrigin,
  );

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      const requestingUrl = details.requestingUrl || webContents.getURL();
      callback(mediaPermissions.has(permission) && isAllowedUrl(requestingUrl));
    },
  );
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: "#fff8fb",
    show: false,
    title: "StudyPop",
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
      partition: "persist:studypop",
    },
  });

  window.removeMenu();
  window.once("ready-to-show", () => {
    if (!headlessSmokeTest) window.show();
  });
  window.webContents.once("did-finish-load", () => {
    if (headlessSmokeTest) {
      console.log(`StudyPop desktop loaded ${window.webContents.getURL()}`);
      app.quit();
    }
  });
  window.webContents.once("did-fail-load", (_event, code, description) => {
    console.error(`StudyPop desktop failed to load (${code}): ${description}`);
    if (headlessSmokeTest) app.exit(1);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    }
  });

  void window.loadURL(appUrl, {
    userAgent: `${window.webContents.getUserAgent()} StudyPopDesktop/${app.getVersion()}`,
  });
}

app.whenReady().then(() => {
  configurePermissions();

  ipcMain.handle("studypop:open-external", async (event, url) => {
    if (!isAllowedUrl(event.senderFrame.url)) return false;
    if (typeof url !== "string" || !isAllowedExternalUrl(url)) return false;
    await shell.openExternal(url);
    return true;
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
