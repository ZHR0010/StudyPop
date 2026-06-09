import { createApiClient } from "./api-client.js";
import { createFirebaseClient } from "./firebase-client.js";

const STORAGE_KEY = "study-pop-state-v1";
const firebaseClient = createFirebaseClient();
const apiClient = createApiClient(firebaseClient);

const sections = [
  { id: "study", name: "Study", icon: "sparkles", blurb: "Notes into superpowers", emoji: "✦" },
  { id: "general", name: "General", icon: "message-circle", blurb: "Ask absolutely anything", emoji: "☁" },
  { id: "math", name: "Math", icon: "sigma", blurb: "Numbers, minus the stress", emoji: "÷" },
  { id: "history", name: "History", icon: "landmark", blurb: "Stories from the past", emoji: "⌛" },
  { id: "biology", name: "Biology", icon: "dna", blurb: "Life, cells and everything", emoji: "🧬" },
  { id: "physics", name: "Physics", icon: "atom", blurb: "Forces made friendly", emoji: "⚛" },
  { id: "economics", name: "Economics", icon: "trending-up", blurb: "Markets without the maze", emoji: "↗" },
  { id: "chemistry", name: "Chemistry", icon: "flask-conical", blurb: "Reactions, explained gently", emoji: "⚗" },
  { id: "literature", name: "Literature", icon: "book-open", blurb: "Read between the lines", emoji: "✎" },
  { id: "government", name: "Government", icon: "scale", blurb: "Civics in plain words", emoji: "⚖" },
];

const companions = [
  { id: "gojo", name: "Gojo", image: "/companions/gojo-uploaded.webp", hello: "No pressure. We’ll make it click." },
  { id: "tanjiro", name: "Tanjiro", image: "/companions/tanjiro-uploaded.webp", hello: "One calm step at a time." },
  { id: "professor", name: "Professor", image: "/companions/professor-uploaded.webp", hello: "Curiosity switched on!" },
  { id: "eleven", name: "Eleven", image: "/companions/eleven-uploaded.webp", hello: "Hard question? We can handle it." },
  { id: "harry", name: "Harry Potter", image: "/companions/harry-uploaded.webp", hello: "Let’s work a little study magic." },
];

const themes = [
  { id: "light", label: "Light", color: "#fffaf2" },
  { id: "pink", label: "Pink", color: "#ff7eb3" },
  { id: "purple", label: "Purple", color: "#8b6ee8" },
  { id: "blue", label: "Blue", color: "#4e8df5" },
  { id: "red", label: "Red", color: "#ef6262" },
  { id: "dark", label: "Dark", color: "#24213a" },
];

const movieQuotes = [
  { movie: "Star Wars", text: "May the Force be with you." },
  { movie: "Finding Nemo", text: "Just keep swimming." },
  { movie: "Toy Story", text: "To infinity and beyond!" },
  { movie: "The Help", text: "You is kind. You is smart. You is important." },
  { movie: "The Pursuit of Happyness", text: "Don’t ever let somebody tell you you can’t do something." },
  { movie: "Dead Poets Society", text: "Carpe diem. Seize the day." },
  { movie: "Black Panther", text: "In times of crisis, the wise build bridges." },
  { movie: "Harry Potter", text: "It is our choices that show what we truly are." },
];

const companionActions = [
  { text: "is reading your notes", emoji: "📖", motion: "reading" },
  { text: "is thinking it through", emoji: "💭", motion: "thinking" },
  { text: "is cheering you on", emoji: "✨", motion: "cheering" },
  { text: "is ready for your next question", emoji: "✍", motion: "ready" },
  { text: "is celebrating your progress", emoji: "★", motion: "celebrating" },
];

const fallbackKit = {
  summary: "Add a note, photo, or voice question and I’ll turn it into a tiny study pack.",
  keyPoints: ["A short, friendly summary", "Flip-through flashcards", "A quick confidence quiz"],
  cards: [
    { front: "Ready to make a study kit?", back: "Drop your notes in the box below and tap Make my study kit." },
  ],
  questions: ["What is the main idea in your note?"],
};

const root = document.querySelector("#root");
const isElectronDesktop = Boolean(window.studyPopDesktop?.isDesktop);
const isLocalDesktop =
  !isElectronDesktop && ["127.0.0.1", "localhost"].includes(location.hostname);
let auth = {
  ready: false,
  user: null,
  open: false,
  mode: "signup",
  busy: false,
  error: "",
  openai: { connected: false, model: "" },
  openAISetup: false,
  openAIBusy: false,
  openAIError: "",
};
let state = loadState();
let ui = {
  activeSection: "study",
  draft: "",
  attachments: [],
  isSending: false,
  isRecording: false,
  isTranscribing: false,
  recordingSeconds: 0,
  recordingSource: "",
  voiceCaptured: false,
  showVoiceFallback: false,
  isCameraOpening: false,
  cameraPreviewOpen: false,
  studyMode: "make",
  flashIndex: 0,
  flashFlipped: false,
  quizIndex: 0,
  quizAnswer: "",
  quizRevealed: false,
  showThemes: false,
  showCompanions: false,
  flashlightOn: false,
  toast: "",
  companionActionIndex: 0,
  movieQuoteIndex: 0,
};

let mediaRecorder = null;
let audioChunks = [];
let microphoneStream = null;
let recordingTimer = null;
let nativeRecordingId = null;
let pendingVoiceBlob = null;
let cameraPollTimer = null;
let cameraPreviewStream = null;
let flashlightStream = null;
let toastTimer = null;
let cloudSaveTimer = null;

function createStarterState() {
  return {
    theme: "pink",
    companion: "gojo",
    chats: {},
    studyKit: null,
    streak: 3,
  };
}

function normalizeState(value) {
  const starter = createStarterState();
  const restored = { ...starter, ...(value && typeof value === "object" ? value : {}) };
  if (!companions.some((companion) => companion.id === restored.companion)) {
    restored.companion = "gojo";
  }
  return restored;
}

function loadState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return normalizeState(saved);
  } catch {
    return createStarterState();
  }
}

function stateForCloudSync() {
  return {
    ...state,
    chats: Object.fromEntries(
      Object.entries(state.chats ?? {}).map(([sectionId, messages]) => [
        sectionId,
        (Array.isArray(messages) ? messages : []).map(({ images: _images, ...message }) => ({
          ...message,
          hadImages: Boolean(_images?.length),
        })),
      ]),
    ),
  };
}

function saveState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("Your latest chat is too large for this device. Clear an older image chat.");
  }
  if (!auth.user) {
    return;
  }

  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(async () => {
    try {
      await apiClient.saveState(stateForCloudSync());
    } catch (error) {
      if (error.status === 401 || error.code === "AUTH_REQUIRED") {
        firebaseClient.signOut();
        auth.user = null;
        showToast("Your session ended. Log in again to keep syncing.");
        return;
      }
      showToast("Your changes are on this screen, but cloud sync is temporarily offline.");
    }
  }, 450);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderIcon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function activeSection() {
  return sections.find((section) => section.id === ui.activeSection) ?? sections[0];
}

function activeCompanion() {
  return companions.find((companion) => companion.id === state.companion) ?? companions[0];
}

function currentCompanionAction() {
  return companionActions[ui.companionActionIndex % companionActions.length];
}

function currentMovieQuote() {
  return movieQuotes[ui.movieQuoteIndex % movieQuotes.length];
}

function formatRecordingTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function chatsFor(sectionId = ui.activeSection) {
  return state.chats[sectionId] ?? [];
}

function greetingFor(section) {
  const companion = activeCompanion();
  if (section.id === "study") {
    return `Hey, I’m ${companion.name.replace("Cute ", "")}! Send me your notes and I’ll make a summary, flashcards, and a mini quiz.`;
  }
  if (section.id === "general") {
    return `Ask me anything at all. I’ll keep the answer clear, friendly, and delightfully un-stuffy.`;
  }
  return `Welcome to ${section.name}! I’m staying in my ${section.name.toLowerCase()} lane here, so send me anything from this subject.`;
}

function render() {
  const section = activeSection();
  const companion = activeCompanion();
  const chats = chatsFor();
  const kit = state.studyKit ?? fallbackKit;
  const companionAction = currentCompanionAction();
  const movieQuote = currentMovieQuote();

  document.body.dataset.theme = state.theme;

  root.innerHTML = `
    <main class="app-shell">
      <aside class="sidebar">
        <button class="brand" type="button" data-action="select-section" data-section="study" aria-label="Go to Study">
          <span class="logo-wrap"><img src="/companions/mascot.png" alt="" /></span>
          <span>
            <strong>StudyPop</strong>
            <small>Learn it your way</small>
          </span>
        </button>

        <nav class="section-nav" aria-label="Learning spaces">
          <p class="nav-label">Your spaces</p>
          ${sections.map((item) => `
            <button
              class="nav-item ${item.id === section.id ? "active" : ""}"
              type="button"
              data-action="select-section"
              data-section="${item.id}"
            >
              <span class="nav-icon">${renderIcon(item.icon)}</span>
              <span>
                <strong>${item.name}</strong>
                <small>${item.blurb}</small>
              </span>
              <b aria-hidden="true">${item.emoji}</b>
            </button>
          `).join("")}
        </nav>

        <section class="streak-card">
          <span class="streak-emoji">🔥</span>
          <div>
            <strong>${state.streak} day sparkle streak!</strong>
            <small>Small steps are doing the job.</small>
          </div>
        </section>
      </aside>

      <section class="main-space">
        <header class="topbar">
          <div class="mobile-brand">
            <img src="/companions/mascot.png" alt="" />
            <strong>StudyPop</strong>
          </div>
          <div class="section-heading">
            <span class="heading-icon">${renderIcon(section.icon)}</span>
            <div>
              <p>${section.blurb}</p>
              <h1>${section.name}</h1>
            </div>
          </div>

          <div class="top-actions">
            <div class="popover-wrap">
              <button
                class="round-button ${ui.flashlightOn ? "active" : ""}"
                type="button"
                data-action="toggle-flashlight"
                title="Flashlight"
                aria-label="Toggle flashlight"
              >${renderIcon(ui.flashlightOn ? "flashlight-off" : "flashlight")}</button>
            </div>
            <div class="popover-wrap">
              <button class="round-button" type="button" data-action="toggle-themes" title="Choose theme" aria-label="Choose theme">
                ${renderIcon("palette")}
              </button>
              ${ui.showThemes ? renderThemePicker() : ""}
            </div>
            <div class="popover-wrap">
              <button
                class="companion-button"
                type="button"
                data-action="toggle-companions"
                aria-label="Choose companion, currently ${companion.name}"
              >
                <img src="${companion.image}" alt="" />
                <span><small>Studying with</small><strong>${companion.name}</strong></span>
                ${renderIcon("chevron-down")}
              </button>
              ${ui.showCompanions ? renderCompanionPicker() : ""}
            </div>
            <button
              class="ai-status ${auth.openai.connected ? "connected" : "setup-needed"}"
              title="${auth.openai.connected ? `OpenAI connected with ${auth.openai.model}` : "Add OPENAI_API_KEY to .env to connect OpenAI"}"
              type="button"
              data-action="open-openai-setup"
              aria-label="${auth.openai.connected ? "OpenAI connected" : "Connect OpenAI"}"
            >
              <i></i>
              <span>${auth.openai.connected ? "AI ready" : "AI setup"}</span>
            </button>
            ${auth.user ? `
              <div class="signed-in-user" title="${escapeHtml(auth.user.email)}">
                <span>${escapeHtml(auth.user.name.charAt(0).toUpperCase())}</span>
                <small>${escapeHtml(auth.user.name)}</small>
              </div>
              <button class="auth-top-button logout" type="button" data-action="logout" aria-label="Log out">
                ${renderIcon("log-out")}
                <span>Log out</span>
              </button>
            ` : `
              <button class="auth-top-button" type="button" data-action="open-auth" data-mode="signup" aria-label="Sign up or log in">
                ${renderIcon("user-round-plus")}
                <span>Sign up / Log in</span>
              </button>
            `}
          </div>
        </header>

        <div class="content-scroll">
          <section class="welcome-card">
            <div class="doodle doodle-one">＋</div>
            <div class="doodle doodle-two">⚗</div>
            <div class="doodle doodle-three">−</div>
            <img
              class="companion-hero action-${companionAction.motion}"
              data-companion-hero
              src="${companion.image}"
              alt="${companion.name}"
            />
            <div class="welcome-copy">
              <span class="speech-label">${companion.name}</span>
              <h2>${escapeHtml(companion.hello)}</h2>
              <p>${escapeHtml(greetingFor(section))}</p>
              <div class="companion-action" data-companion-action>
                <span data-companion-action-emoji>${companionAction.emoji}</span>
                <strong>${companion.name}</strong>
                <span data-companion-action-text>${companionAction.text}</span>
              </div>
            </div>
            <div class="encouragement">
              <span data-movie-title>${movieQuote.movie} quote</span>
              <p data-movie-quote>“${movieQuote.text}”</p>
            </div>
          </section>

          ${chats.length ? renderConversation(chats) : ""}
          ${section.id === "study" ? renderStudyKit(kit) : renderEmptyPrompt(section, chats)}
        </div>

        ${renderComposer(section)}
      </section>
    </main>
    <video class="flashlight-video" data-flashlight-video muted playsinline></video>
    ${ui.toast ? `<div class="toast">${escapeHtml(ui.toast)}</div>` : ""}
    ${ui.cameraPreviewOpen ? renderCameraCapture() : ""}
    ${auth.open ? renderAuthPage() : ""}
    ${auth.openAISetup ? renderOpenAISetup() : ""}
  `;

  paintIcons();
  const cameraVideo = document.querySelector("[data-camera-preview]");
  if (cameraVideo && cameraPreviewStream) {
    cameraVideo.srcObject = cameraPreviewStream;
    void cameraVideo.play().catch(() => {});
  }
  const scroll = document.querySelector(".content-scroll");
  if (ui.isSending && scroll) scroll.scrollTop = scroll.scrollHeight;
}

function renderAuthPage() {
  const isSignup = auth.mode === "signup";
  return `
    <section class="auth-page" aria-label="${isSignup ? "Create account" : "Log in"}">
      <button class="auth-backdrop" type="button" data-action="close-auth" aria-label="Close account page"></button>
      <div class="auth-card">
        <button class="auth-close" type="button" data-action="close-auth" aria-label="Close">
          ${renderIcon("x")}
        </button>
        <div class="auth-art">
          <img src="/companions/mascot.png" alt="" />
          <span>${renderIcon("sparkles")} StudyPop account</span>
          <h2>${isSignup ? "Keep every tiny study win." : "Welcome back, study star."}</h2>
          <p>${isSignup
            ? "Create your own space for chats, themes, companions, summaries, and flashcards."
            : "Log in and pick up exactly where you stopped."}</p>
          <div class="auth-benefits">
            <span>${renderIcon("cloud")} Sync your study kits</span>
            <span>${renderIcon("shield-check")} Secure password and session</span>
            <span>${renderIcon("wand-sparkles")} Your companion remembers your setup</span>
          </div>
        </div>

        <div class="auth-form-side">
          <div class="auth-tabs" role="tablist" aria-label="Account options">
            <button
              class="${isSignup ? "active" : ""}"
              type="button"
              data-action="auth-mode"
              data-mode="signup"
            >Sign up</button>
            <button
              class="${!isSignup ? "active" : ""}"
              type="button"
              data-action="auth-mode"
              data-mode="login"
            >Log in</button>
          </div>

          <div class="auth-title">
            <h2>${isSignup ? "Create your account" : "Log in to StudyPop"}</h2>
            <p>${isSignup ? "A fresh study space, just for you." : "Your notes and chats missed you."}</p>
          </div>

          <form class="auth-form" data-form="${isSignup ? "signup" : "login"}">
            ${isSignup ? `
              <label>
                Your name
                <span>${renderIcon("user-round")}<input name="name" autocomplete="name" required minlength="2" maxlength="50" placeholder="What should we call you?" /></span>
              </label>
            ` : ""}
            <label>
              Email address
              <span>${renderIcon("mail")}<input name="email" type="email" autocomplete="email" required maxlength="160" placeholder="you@example.com" /></span>
            </label>
            <label>
              Password
              <span>${renderIcon("lock-keyhole")}<input name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" required minlength="8" maxlength="72" placeholder="${isSignup ? "At least 8 characters" : "Your password"}" /></span>
            </label>
            ${!isSignup ? `
              <button class="forgot-password" type="button" data-action="forgot-password">
                Forgot your password?
              </button>
            ` : ""}
            ${auth.error ? `<p class="auth-error">${renderIcon("circle-alert")} ${escapeHtml(auth.error)}</p>` : ""}
            <button class="auth-submit" type="submit" ${auth.busy ? "disabled" : ""}>
              ${renderIcon(isSignup ? "user-round-plus" : "log-in")}
              ${auth.busy ? "One moment..." : isSignup ? "Create my account" : "Log in"}
            </button>
          </form>

          <p class="auth-switch">
            ${isSignup ? "Already have an account?" : "New to StudyPop?"}
            <button type="button" data-action="auth-mode" data-mode="${isSignup ? "login" : "signup"}">
              ${isSignup ? "Log in" : "Create one"}
            </button>
          </p>

          <div class="auth-ai-note ${auth.openai.connected ? "connected" : ""}">
            <i></i>
            <span>${auth.openai.connected
              ? `OpenAI is connected with ${escapeHtml(auth.openai.model)}.`
              : "Accounts are ready. Add your OpenAI key to .env to turn on full AI answers."}</span>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderOpenAISetup() {
  return `
    <section class="openai-setup-page" aria-label="Connect OpenAI">
      <button class="auth-backdrop" type="button" data-action="close-openai-setup" aria-label="Close OpenAI setup"></button>
      <div class="openai-setup-card">
        <button class="auth-close" type="button" data-action="close-openai-setup" aria-label="Close">
          ${renderIcon("x")}
        </button>
        <div class="openai-mark">${renderIcon("sparkles")}</div>
        <span class="speech-label">Private local setup</span>
        <h2>${auth.openai.connected ? "OpenAI is connected" : "Connect StudyPop to OpenAI"}</h2>
        <p>${auth.openai.connected
          ? `StudyPop is using ${escapeHtml(auth.openai.model)} for answers and OpenAI transcription for voice notes.`
          : "Add your OpenAI API key here. It is verified by the local server and saved only in this project’s private .env file."}</p>

        ${auth.openai.connected ? `
          <div class="connection-success">
            <i></i>
            <span>AI answers, image reading, study kits, and voice transcription are ready.</span>
          </div>
          <button class="openai-done-button" type="button" data-action="close-openai-setup">Done</button>
        ` : `
          <form class="openai-form" data-form="openai-setup">
            <label>
              OpenAI API key
              <span>${renderIcon("key-round")}<input name="apiKey" type="password" autocomplete="off" required minlength="30" placeholder="sk-..." /></span>
            </label>
            ${auth.openAIError ? `<p class="auth-error">${renderIcon("circle-alert")} ${escapeHtml(auth.openAIError)}</p>` : ""}
            <button class="auth-submit" type="submit" ${auth.openAIBusy ? "disabled" : ""}>
              ${renderIcon("plug-zap")}
              ${auth.openAIBusy ? "Checking connection..." : "Connect OpenAI"}
            </button>
          </form>
          <p class="openai-key-help">
            Create a key at
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a>.
            Do not share it in chat.
          </p>
        `}
      </div>
    </section>
  `;
}

function renderThemePicker() {
  return `
    <div class="popover theme-popover">
      <div class="popover-title"><strong>Pick a mood</strong><span>Same brain, new colors.</span></div>
      <div class="theme-grid">
        ${themes.map((theme) => `
          <button
            class="theme-option ${state.theme === theme.id ? "selected" : ""}"
            type="button"
            data-action="select-theme"
            data-theme="${theme.id}"
          >
            <span style="--swatch:${theme.color}"></span>${theme.label}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCompanionPicker() {
  return `
    <div class="popover companion-popover">
      <div class="popover-title"><strong>Choose your study buddy</strong><span>All cheering, zero judging.</span></div>
      <div class="companion-grid">
        ${companions.map((companion) => `
          <button
            class="companion-option ${state.companion === companion.id ? "selected" : ""}"
            type="button"
            data-action="select-companion"
            data-companion="${companion.id}"
          >
            <img src="${companion.image}" alt="" />
            <span>${companion.name}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCameraCapture() {
  return `
    <section class="camera-capture-page" aria-label="Take a picture">
      <button class="auth-backdrop" type="button" data-action="close-browser-camera" aria-label="Close camera"></button>
      <div class="camera-capture-card">
        <div class="camera-capture-heading">
          <div>
            <span class="speech-label">Question camera</span>
            <h2>Line up the question</h2>
            <p>Keep the page bright and steady so StudyPop can read it clearly.</p>
          </div>
          <button type="button" data-action="close-browser-camera" aria-label="Close camera">
            ${renderIcon("x")}
          </button>
        </div>
        <div class="camera-preview-wrap">
          <video data-camera-preview muted playsinline></video>
          <span></span>
        </div>
        <button class="camera-shutter" type="button" data-action="capture-browser-photo">
          ${renderIcon("camera")} Take picture
        </button>
      </div>
    </section>
  `;
}

function renderConversation(chats) {
  return `
    <section class="conversation" aria-label="Conversation">
      <div class="conversation-title">
        <span>${renderIcon("messages-square")}</span>
        <strong>Our chat</strong>
        <button type="button" data-action="clear-chat">${renderIcon("trash-2")} Clear</button>
      </div>
      ${chats.map((message) => `
        <article class="message ${message.role}">
          ${message.role === "assistant"
            ? `<img src="${activeCompanion().image}" alt="" />`
            : `<span class="user-avatar">${renderIcon("user-round")}</span>`}
          <div class="message-bubble">
            <span>${message.role === "assistant" ? activeCompanion().name : "You"}</span>
            <div class="message-content">${formatMessage(message.text)}</div>
            ${message.images?.length ? `
              <div class="message-images">
                ${message.images.map((image) => `<img src="${image}" alt="Question attachment" />`).join("")}
              </div>
            ` : ""}
          </div>
        </article>
      `).join("")}
      ${ui.isSending ? `
        <article class="message assistant">
          <img src="${activeCompanion().image}" alt="" />
          <div class="message-bubble thinking">
            <span>${activeCompanion().name}</span>
            <p><i></i><i></i><i></i></p>
          </div>
        </article>
      ` : ""}
    </section>
  `;
}

function formatMessage(text) {
  const readable = makeMathReadable(text);
  const lines = readable.split("\n");
  const output = [];
  let listType = "";

  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = "";
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bullet = line.match(/^[-*]\s+(.+)/);
    const numbered = line.match(/^\d+[.)]\s+(.+)/);
    const heading = line.match(/^#{1,4}\s+(.+)/);

    if (bullet || numbered) {
      const nextListType = bullet ? "ul" : "ol";
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${formatInlineMessage((bullet || numbered)[1])}</li>`);
      continue;
    }

    closeList();
    if (!line) {
      output.push('<div class="message-gap"></div>');
    } else if (heading) {
      output.push(
        `<strong class="message-heading">${formatInlineMessage(heading[1])}</strong>`,
      );
    } else {
      output.push(`<div class="message-line">${formatInlineMessage(line)}</div>`);
    }
  }
  closeList();
  return output.join("");
}

function formatInlineMessage(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function superscriptNumber(value) {
  const symbols = {
    "0": "\u2070",
    "1": "\u00b9",
    "2": "\u00b2",
    "3": "\u00b3",
    "4": "\u2074",
    "5": "\u2075",
    "6": "\u2076",
    "7": "\u2077",
    "8": "\u2078",
    "9": "\u2079",
    "+": "\u207a",
    "-": "\u207b",
  };
  return [...value].map((character) => symbols[character] ?? character).join("");
}

function makeMathReadable(value) {
  let text = String(value ?? "").replace(/\r/g, "");
  for (let index = 0; index < 4; index += 1) {
    text = text
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\sqrt\s*\{([^{}]+)\}/g, "\u221a($1)")
      .replace(/\\boxed\s*\{([^{}]+)\}/g, "$1")
      .replace(/\\text\s*\{([^{}]+)\}/g, "$1");
  }
  return text
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\\[/g, "\n")
    .replace(/\\\]/g, "\n")
    .replace(/\\\(/g, "")
    .replace(/\\\)/g, "")
    .replace(/\\quad|\\qquad/g, " ")
    .replace(/\\[,;:!]/g, " ")
    .replace(/\\times|\\cdot/g, "\u00d7")
    .replace(/\\div/g, "\u00f7")
    .replace(/sqrt\s*\(([^()\n]+)\)/gi, "\u221a($1)")
    .replace(/sqrt\s+([A-Za-z0-9.]+)/gi, "\u221a$1")
    .replace(/sqrt/gi, "\u221a")
    .replace(/\\pm/g, "\u00b1")
    .replace(/\\leq?/g, "\u2264")
    .replace(/\\geq?/g, "\u2265")
    .replace(/\\neq/g, "\u2260")
    .replace(/\\approx/g, "\u2248")
    .replace(/\\infty/g, "\u221e")
    .replace(/\\pi/g, "\u03c0")
    .replace(/\\theta/g, "\u03b8")
    .replace(/\\Delta/g, "\u0394")
    .replace(/\\sum/g, "\u03a3")
    .replace(/\\int/g, "\u222b")
    .replace(/\\rightarrow|\\Rightarrow/g, "\u2192")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/\^\{([-+]?\d+)\}/g, (_, exponent) => superscriptNumber(exponent))
    .replace(/\^\(([-+]?\d+)\)/g, (_, exponent) => superscriptNumber(exponent))
    .replace(/\^([-+]?\d+)/g, (_, exponent) => superscriptNumber(exponent))
    .replace(/([A-Za-z0-9)\]])\s*\*\s*([A-Za-z0-9(\[])/g, "$1 \u00d7 $2")
    .replace(/\s*[\u00b7\u22c5]\s*/g, " \u00d7 ")
    .replace(/_\{([^{}]+)\}/g, "_($1)")
    .replace(/\$\$?/g, "")
    .replace(/\\\\/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderEmptyPrompt(section, chats) {
  if (chats.length) return "";
  const ideas = {
    general: ["Why is the sky blue?", "Help me plan a reading routine", "Explain AI like I’m 10"],
    math: ["Solve 3x + 5 = 20", "Explain fractions simply", "Check my working"],
    history: ["What caused World War I?", "Make a quick timeline", "Explain a historical source"],
    biology: ["How does photosynthesis work?", "Explain mitosis", "What does DNA do?"],
    physics: ["Explain Newton’s laws", "What is velocity?", "Help with a circuit"],
    economics: ["What is inflation?", "Explain supply and demand", "What is opportunity cost?"],
    chemistry: ["Balance an equation", "Explain ionic bonds", "What is the pH scale?"],
    literature: ["Explain this poem", "Find the main theme", "Help with a character analysis"],
    government: ["What is separation of powers?", "Explain democracy", "What does parliament do?"],
  };

  return `
    <section class="starter-prompts">
      <p>Not sure where to begin? Try one:</p>
      <div>
        ${(ideas[section.id] ?? []).map((idea) => `
          <button type="button" data-action="use-prompt" data-prompt="${escapeHtml(idea)}">
            ${renderIcon("sparkle")} ${escapeHtml(idea)}
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function renderStudyKit(kit) {
  const card = kit.cards?.[ui.flashIndex] ?? kit.cards?.[0] ?? fallbackKit.cards[0];
  const question = kit.questions?.[ui.quizIndex] ?? kit.questions?.[0] ?? fallbackKit.questions[0];
  const hasRealKit = Boolean(state.studyKit);

  return `
    <section class="study-kit">
      <div class="kit-heading">
        <div>
          <span class="tiny-pill">${renderIcon("wand-sparkles")} Study kit</span>
          <h2>${hasRealKit ? "Your notes, made snack-sized" : "Your study kit will pop up here"}</h2>
        </div>
        ${hasRealKit ? `<button class="soft-button" type="button" data-action="reset-kit">${renderIcon("rotate-ccw")} New kit</button>` : ""}
      </div>

      <div class="kit-grid">
        <article class="kit-card summary-card">
          <div class="kit-card-title">
            <span class="bubble-icon coral">${renderIcon("align-left")}</span>
            <div><small>Quick scoop</small><h3>Summary</h3></div>
          </div>
          <p>${escapeHtml(kit.summary)}</p>
          <ul>${(kit.keyPoints ?? []).slice(0, 4).map((point) => `<li><span>✓</span>${escapeHtml(point)}</li>`).join("")}</ul>
        </article>

        <article class="kit-card flash-card-wrap">
          <div class="kit-card-title">
            <span class="bubble-icon purple">${renderIcon("copy")}</span>
            <div><small>${ui.flashIndex + 1} of ${kit.cards?.length ?? 1}</small><h3>Flashcards</h3></div>
          </div>
          <button class="flip-card ${ui.flashFlipped ? "flipped" : ""}" type="button" data-action="flip-card">
            <small>${ui.flashFlipped ? "Answer" : "Question"}</small>
            <strong>${escapeHtml(ui.flashFlipped ? card.back : card.front)}</strong>
            <span>${renderIcon("refresh-cw")} Tap to flip</span>
          </button>
          <div class="card-nav">
            <button type="button" data-action="previous-card" aria-label="Previous card">${renderIcon("arrow-left")}</button>
            <div>${kit.cards?.map((_, index) => `<i class="${index === ui.flashIndex ? "active" : ""}"></i>`).join("")}</div>
            <button type="button" data-action="next-card" aria-label="Next card">${renderIcon("arrow-right")}</button>
          </div>
        </article>

        <article class="kit-card quiz-card">
          <div class="kit-card-title">
            <span class="bubble-icon blue">${renderIcon("circle-help")}</span>
            <div><small>Brain tickle</small><h3>Mini quiz</h3></div>
          </div>
          <p>${escapeHtml(question)}</p>
          <textarea data-field="quiz-answer" placeholder="Type what you think...">${escapeHtml(ui.quizAnswer)}</textarea>
          ${ui.quizRevealed ? `<div class="quiz-reveal">Nice try! Compare your idea with the summary and flashcards, then ask me about anything fuzzy.</div>` : ""}
          <button type="button" data-action="check-quiz">${renderIcon("check")} ${ui.quizRevealed ? "Next question" : "Check my answer"}</button>
        </article>
      </div>
    </section>
  `;
}

function renderComposer(section) {
  const canSend = ui.draft.trim() || ui.attachments.length;
  const placeholder = section.id === "study"
    ? ui.studyMode === "make"
      ? "Paste notes, type a topic, or add a photo..."
      : "Ask a follow-up about your notes..."
    : `Ask a ${section.name.toLowerCase()} question...`;

  return `
    <section class="composer-shell">
      ${section.id === "study" ? `
        <div class="study-mode-toggle">
          <button class="${ui.studyMode === "make" ? "active" : ""}" type="button" data-action="study-mode" data-mode="make">
            ${renderIcon("wand-sparkles")} Make a study kit
          </button>
          <button class="${ui.studyMode === "ask" ? "active" : ""}" type="button" data-action="study-mode" data-mode="ask">
            ${renderIcon("messages-square")} Ask about my notes
          </button>
        </div>
      ` : ""}
      ${ui.attachments.length ? `
        <div class="attachment-strip">
          ${ui.attachments.map((attachment, index) => `
            <div class="attachment">
              <img src="${attachment.data}" alt="${escapeHtml(attachment.name)}" />
              <button type="button" data-action="remove-attachment" data-index="${index}" aria-label="Remove image">${renderIcon("x")}</button>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${ui.isRecording || ui.isTranscribing || ui.voiceCaptured ? `
        <div class="voice-status ${ui.isRecording ? "live" : ""}">
          <span class="voice-wave"><i></i><i></i><i></i><i></i></span>
          <div>
            <strong>${ui.isRecording
              ? `Recording ${formatRecordingTime(ui.recordingSeconds)}`
              : ui.isTranscribing
                ? "Turning your voice into text..."
                : "Voice note captured"}</strong>
            <small>${ui.isRecording
              ? ui.recordingSource === "windows"
                ? "Windows Voice Typing is active. Speak clearly, then press Stop."
                : "Speak clearly, then press Stop."
              : ui.isTranscribing
                ? ui.recordingSource === "windows"
                  ? "Windows is finishing the transcript."
                  : "OpenAI is listening carefully."
                : "Connect OpenAI to transcribe this recording."}</small>
          </div>
          ${ui.voiceCaptured && !ui.isTranscribing ? `
            <button type="button" data-action="discard-voice" aria-label="Discard voice recording">${renderIcon("x")}</button>
          ` : ""}
        </div>
      ` : ""}
      <form class="composer" data-form="question">
        <textarea
          data-field="draft"
          aria-label="Your question"
          placeholder="${placeholder}"
          rows="1"
        >${escapeHtml(ui.draft)}</textarea>
        <div class="composer-tools">
          <div>
            <label class="tool-button" title="Upload images">
              ${renderIcon("image-plus")}
              <span>Image</span>
              <input data-field="image-upload" type="file" accept="image/*" multiple />
            </label>
            ${isLocalDesktop ? `
              <button
                class="tool-button"
                type="button"
                data-action="snap-picture"
                title="Snap a picture"
                ${ui.isCameraOpening ? "disabled" : ""}
              >
                ${renderIcon("camera")}
                <span>${ui.isCameraOpening ? "Opening..." : "Snap"}</span>
              </button>
            ` : isElectronDesktop ? `
              <button
                class="tool-button"
                type="button"
                data-action="open-browser-camera"
                title="Snap a picture"
                ${ui.isCameraOpening ? "disabled" : ""}
              >
                ${renderIcon("camera")}
                <span>${ui.isCameraOpening ? "Opening..." : "Snap"}</span>
              </button>
            ` : `
              <label class="tool-button" title="Snap a picture">
                ${renderIcon("camera")}
                <span>Snap</span>
                <input data-field="camera-upload" type="file" accept="image/*" capture="environment" />
              </label>
            `}
            <button
              class="tool-button ${ui.isRecording ? "recording" : ""}"
              type="button"
              data-action="toggle-recording"
              ${ui.isTranscribing ? "disabled" : ""}
              aria-label="${ui.isRecording ? "Stop voice recording" : "Start voice recording"}"
            >
              ${renderIcon(ui.isRecording ? "square" : "mic")}
              <span>${ui.isRecording
                ? `Stop ${formatRecordingTime(ui.recordingSeconds)}`
                : ui.isTranscribing
                  ? "Writing..."
                  : "Voice"}</span>
            </button>
            ${ui.showVoiceFallback ? `
              <label class="tool-button voice-fallback" title="Record or choose an audio file">
                ${renderIcon("file-audio")}
                <span>Audio file</span>
                <input data-field="audio-upload" type="file" accept="audio/*" capture />
              </label>
            ` : ""}
          </div>
          <button class="send-button" type="submit" ${!canSend || ui.isSending ? "disabled" : ""}>
            <span>${section.id === "study" && ui.studyMode === "make" ? "Make it cute" : "Ask away"}</span>
            ${renderIcon("arrow-up")}
          </button>
        </div>
      </form>
      <p class="privacy-note">${renderIcon("shield-check")} Images and voice are used only for your current study request.</p>
    </section>
  `;
}

function paintIcons() {
  window.lucide?.createIcons({
    attrs: { "stroke-width": 2.1, "aria-hidden": "true" },
  });
}

function updateCompanionMoment() {
  const companion = activeCompanion();
  const action = currentCompanionAction();
  const quote = currentMovieQuote();
  const hero = document.querySelector("[data-companion-hero]");
  const actionEmoji = document.querySelector("[data-companion-action-emoji]");
  const actionText = document.querySelector("[data-companion-action-text]");
  const movieTitle = document.querySelector("[data-movie-title]");
  const movieQuote = document.querySelector("[data-movie-quote]");

  if (hero) hero.className = `companion-hero action-${action.motion}`;
  if (actionEmoji) actionEmoji.textContent = action.emoji;
  if (actionText) actionText.textContent = action.text;
  if (movieTitle) movieTitle.textContent = `${quote.movie} quote`;
  if (movieQuote) movieQuote.textContent = `“${quote.text}”`;

  const actionName = document.querySelector("[data-companion-action] strong");
  if (actionName) actionName.textContent = companion.name;
}

function showToast(message) {
  ui.toast = message;
  window.clearTimeout(toastTimer);
  render();
  toastTimer = window.setTimeout(() => {
    ui.toast = "";
    render();
  }, 3200);
}

function queuePassiveToast(message) {
  ui.toast = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    ui.toast = "";
    document.querySelector(".toast")?.remove();
  }, 3200);
}

function resetTransientUi() {
  if (nativeRecordingId) {
    void fetch("/api/voice/dictation-toggle", { method: "POST" }).catch(() => {});
    nativeRecordingId = null;
  }
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  stopMicrophoneTracks();
  window.clearInterval(recordingTimer);
  recordingTimer = null;
  pendingVoiceBlob = null;
  ui.draft = "";
  ui.attachments = [];
  ui.isSending = false;
  ui.isRecording = false;
  ui.isTranscribing = false;
  ui.recordingSeconds = 0;
  ui.recordingSource = "";
  ui.voiceCaptured = false;
  ui.showVoiceFallback = false;
  ui.isCameraOpening = false;
  closeBrowserCamera(false);
  window.clearInterval(cameraPollTimer);
  cameraPollTimer = null;
  ui.studyMode = "make";
  ui.flashIndex = 0;
  ui.flashFlipped = false;
  ui.quizIndex = 0;
  ui.quizAnswer = "";
  ui.quizRevealed = false;
  ui.showThemes = false;
  ui.showCompanions = false;
}

async function submitAuthForm(form) {
  if (auth.busy) return;
  const formType = form.dataset.form;
  const data = new FormData(form);
  auth.busy = true;
  auth.error = "";
  render();

  try {
    const credentials = {
      name: data.get("name")?.toString().trim(),
      email: data.get("email")?.toString().trim(),
      password: data.get("password")?.toString(),
    };
    const user = formType === "signup"
      ? await firebaseClient.signUp(credentials)
      : await firebaseClient.signIn(credentials);

    auth.user = user;
    apiClient.resetStateVersion();
    if (formType === "signup") {
      await apiClient.saveState(stateForCloudSync());
    } else {
      const synced = await apiClient.loadState();
      if (synced.state) {
        state = normalizeState(synced.state);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        await apiClient.saveState(stateForCloudSync());
      }
    }
    auth.open = false;
    auth.error = "";
    resetTransientUi();
    render();
    showToast(formType === "signup"
      ? `Welcome to your StudyPop space, ${auth.user.name}!`
      : `Welcome back, ${auth.user.name}!`);
  } catch (error) {
    auth.error = error.message || "Could not complete that account request.";
    auth.busy = false;
    render();
    return;
  }

  auth.busy = false;
}

async function submitOpenAISetup(form) {
  if (auth.openAIBusy) return;
  const apiKey = new FormData(form).get("apiKey")?.toString().trim();
  auth.openAIBusy = true;
  auth.openAIError = "";
  render();

  try {
    const response = await fetch("/api/openai/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "OpenAI connection failed.");
    auth.openai = payload.openai;
    auth.openAISetup = false;
    auth.openAIError = "";
    auth.openAIBusy = false;
    render();
    showToast("OpenAI is connected. Full AI and voice transcription are ready.");
    if (pendingVoiceBlob) await transcribePendingVoice();
  } catch (error) {
    auth.openAIError = error.message || "Could not connect to OpenAI.";
    auth.openAIBusy = false;
    render();
  }
}

async function logout() {
  window.clearTimeout(cloudSaveTimer);
  firebaseClient.signOut();
  apiClient.resetStateVersion();
  auth.user = null;
  auth.open = false;
  auth.error = "";
  state = loadState();
  resetTransientUi();
  render();
  showToast("Logged out. Your account data is still safe.");
}

async function requestPasswordReset() {
  const email = document.querySelector('.auth-form input[name="email"]')?.value.trim();
  if (!email) {
    auth.error = "Enter your email address first.";
    render();
    return;
  }

  auth.busy = true;
  auth.error = "";
  render();
  try {
    await firebaseClient.sendPasswordReset(email);
    auth.open = false;
    showToast("Password reset email sent. Check your inbox.");
  } catch (error) {
    auth.error = error.message || "Could not send the password reset email.";
  } finally {
    auth.busy = false;
    render();
  }
}

function pushChat(sectionId, message) {
  state.chats = {
    ...state.chats,
    [sectionId]: [...(state.chats[sectionId] ?? []), message],
  };
  saveState();
}

async function submitQuestion() {
  if (ui.isSending) return;
  const section = activeSection();
  const question = ui.draft.trim();
  const images = ui.attachments.map((attachment) => attachment.data);
  if (!question && !images.length) return;

  pushChat(section.id, { role: "user", text: question || "Please look at this picture.", images });
  ui.draft = "";
  ui.attachments = [];
  ui.isSending = true;
  render();

  try {
    if (section.id === "study" && ui.studyMode === "make") {
      const payload = await apiClient.createStudyKit({ note: question, images });

      state.studyKit = payload.kit;
      ui.flashIndex = 0;
      ui.flashFlipped = false;
      ui.quizIndex = 0;
      ui.quizAnswer = "";
      ui.quizRevealed = false;
      ui.studyMode = "ask";
      pushChat("study", {
        role: "assistant",
        text: `Done! I made you ${payload.kit.cards.length} flashcards and a mini quiz. Tiny study victory unlocked ✨`,
      });
    } else {
      const history = chatsFor(section.id).slice(-8).map(({ role, text }) => ({ role, text }));
      const payload = await apiClient.answer({
        section: section.id,
        question,
        images,
        history,
        companion: activeCompanion().name,
        studyContext: section.id === "study" ? state.studyKit : null,
      });
      pushChat(section.id, { role: "assistant", text: payload.answer });
    }
  } catch (error) {
    pushChat(section.id, {
      role: "assistant",
      text: `${error.message || "Something went wrong."} Try once more—I’m still right here.`,
    });
  } finally {
    ui.isSending = false;
    render();
  }
}

async function imageToData(file) {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (file.size > 12_000_000) throw new Error("Choose an image under 12 MB.");

  const source = await createImageBitmap(file);
  const maxEdge = 1200;
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}

async function openBrowserCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("This device does not provide camera access here.");
    return;
  }

  ui.isCameraOpening = true;
  render();
  try {
    cameraPreviewStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    ui.cameraPreviewOpen = true;
  } catch (error) {
    const denied = ["NotAllowedError", "SecurityError"].includes(error.name);
    showToast(denied
      ? "Camera access is blocked. Allow it in your device settings, then try again."
      : "StudyPop could not open that camera.");
  } finally {
    ui.isCameraOpening = false;
    render();
  }
}

function closeBrowserCamera(shouldRender = true) {
  cameraPreviewStream?.getTracks().forEach((track) => track.stop());
  cameraPreviewStream = null;
  ui.cameraPreviewOpen = false;
  if (shouldRender) render();
}

function captureBrowserPhoto() {
  const video = document.querySelector("[data-camera-preview]");
  if (!video?.videoWidth || !video?.videoHeight) {
    showToast("The camera is still warming up. Try again in a moment.");
    return;
  }

  const canvas = document.createElement("canvas");
  const maximumWidth = 1600;
  const scale = Math.min(1, maximumWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  ui.attachments.push({
    name: `camera-${Date.now()}.jpg`,
    data: canvas.toDataURL("image/jpeg", 0.88),
  });
  closeBrowserCamera(false);
  render();
  showToast("Picture added to your question.");
}

async function addImages(files) {
  try {
    const available = Math.max(0, 4 - ui.attachments.length);
    const selected = [...files].slice(0, available);
    const converted = await Promise.all(selected.map(async (file) => ({
      name: file.name,
      data: await imageToData(file),
    })));
    ui.attachments.push(...converted);
    render();
    if (files.length > available) showToast("Four pictures at a time keeps things speedy.");
  } catch (error) {
    showToast(error.message);
  }
}

async function startCameraCapture() {
  if (ui.isCameraOpening) return;
  ui.isCameraOpening = true;
  render();
  try {
    const response = await fetch("/api/camera/start", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    showToast("A camera window is opening. Take the picture there.");

    const startedAt = Date.now();
    window.clearInterval(cameraPollTimer);
    cameraPollTimer = window.setInterval(async () => {
      try {
        const statusResponse = await fetch(
          `/api/camera/status?id=${encodeURIComponent(payload.id)}`,
        );
        const statusPayload = await statusResponse.json();
        if (statusResponse.ok && statusPayload.status === "ready") {
          window.clearInterval(cameraPollTimer);
          cameraPollTimer = null;
          ui.isCameraOpening = false;
          ui.attachments.push({
            name: `camera-${Date.now()}.jpg`,
            data: statusPayload.image,
          });
          render();
          showToast("Picture added. Add a question or ask me to read it.");
          return;
        }
        if (
          statusResponse.status === 404 ||
          Date.now() - startedAt > 3 * 60 * 1000
        ) {
          window.clearInterval(cameraPollTimer);
          cameraPollTimer = null;
          ui.isCameraOpening = false;
          render();
          showToast("The camera session ended. Tap Snap to try again.");
        }
      } catch {
        // Keep waiting while the camera window is open.
      }
    }, 800);
  } catch (error) {
    ui.isCameraOpening = false;
    render();
    showToast(error.message || "The camera window could not open.");
  }
}

async function toggleRecording() {
  if (nativeRecordingId) {
    await stopNativeRecording();
    return;
  }

  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    if (isLocalDesktop) {
      await startNativeRecording();
    } else {
      ui.showVoiceFallback = true;
      render();
      showToast("This browser cannot record directly. Add an audio file instead.");
    }
    return;
  }

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const mimeType = preferredTypes.find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    audioChunks = [];
    pendingVoiceBlob = null;
    ui.voiceCaptured = false;
    ui.recordingSeconds = 0;
    ui.recordingSource = "browser";
    mediaRecorder = mimeType
      ? new MediaRecorder(microphoneStream, { mimeType })
      : new MediaRecorder(microphoneStream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) audioChunks.push(event.data);
    };
    mediaRecorder.onerror = () => {
      stopMicrophoneTracks();
      ui.isRecording = false;
      window.clearInterval(recordingTimer);
      recordingTimer = null;
      showToast("The browser stopped the recording. Please try the mic again.");
    };
    mediaRecorder.onstop = async () => {
      stopMicrophoneTracks();
      window.clearInterval(recordingTimer);
      recordingTimer = null;
      ui.isRecording = false;
      const blob = new Blob(audioChunks, {
        type: mediaRecorder.mimeType || mimeType || "audio/webm",
      });
      mediaRecorder = null;
      if (blob.size < 800) {
        showToast("That recording was too short. Speak for a moment before stopping.");
        ui.recordingSeconds = 0;
        render();
        return;
      }
      pendingVoiceBlob = blob;
      ui.voiceCaptured = true;
      render();
      await transcribePendingVoice();
    };
    mediaRecorder.start(250);
    ui.isRecording = true;
    startRecordingClock(() => {
      if (mediaRecorder?.state === "recording") mediaRecorder.stop();
    });
    render();
  } catch (error) {
    stopMicrophoneTracks();
    ui.showVoiceFallback = true;
    if (error.name === "NotAllowedError" && isLocalDesktop) {
      await startNativeRecording();
      return;
    }
    const message = error.name === "NotFoundError"
      ? "No microphone was found on this device."
      : error.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow it in your browser settings, then try again."
        : "The microphone could not start. Check that another app is not using it.";
    showToast(message);
  }
}

function startRecordingClock(onLimit) {
  window.clearInterval(recordingTimer);
  recordingTimer = window.setInterval(() => {
    ui.recordingSeconds += 1;
    const buttonText = document.querySelector(
      '[data-action="toggle-recording"] span',
    );
    const statusText = document.querySelector(".voice-status strong");
    if (buttonText) {
      buttonText.textContent = `Stop ${formatRecordingTime(ui.recordingSeconds)}`;
    }
    if (statusText) {
      statusText.textContent = `Recording ${formatRecordingTime(ui.recordingSeconds)}`;
    }
    if (ui.recordingSeconds >= 90) onLimit();
  }, 1000);
}

async function startNativeRecording() {
  ui.isRecording = true;
  ui.isTranscribing = false;
  ui.recordingSeconds = 0;
  ui.recordingSource = "windows";
  ui.voiceCaptured = false;
  nativeRecordingId = "windows-dictation";
  queuePassiveToast(
    "Browser access was blocked, so Windows Voice Typing is listening.",
  );
  render();
  document.querySelector('[data-field="draft"]')?.focus();

  try {
    const response = await fetch("/api/voice/dictation-toggle", {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);

    startRecordingClock(() => void stopNativeRecording());
  } catch (error) {
    nativeRecordingId = null;
    ui.isRecording = false;
    ui.recordingSource = "";
    ui.showVoiceFallback = true;
    render();
    showToast(
      error.message ||
      "The microphone could not start. You can still add an audio file.",
    );
  }
}

async function stopNativeRecording() {
  if (!nativeRecordingId) return;
  nativeRecordingId = null;
  window.clearInterval(recordingTimer);
  recordingTimer = null;
  ui.isRecording = false;
  render();
  document.querySelector('[data-field="draft"]')?.focus();

  try {
    const response = await fetch("/api/voice/dictation-toggle", {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error);
    showToast(
      ui.draft.trim()
        ? "Voice typing stopped. Your words are in the question box."
        : "Voice typing stopped. Try again and speak after the listening panel appears.",
    );
  } catch (error) {
    ui.showVoiceFallback = true;
    showToast(error.message || "Windows Voice Typing could not stop.");
  } finally {
    ui.recordingSeconds = 0;
    ui.recordingSource = "";
    render();
  }
}

async function addAudioFile(file) {
  if (!file) return;
  if (!file.type.startsWith("audio/")) {
    showToast("Choose an audio recording.");
    return;
  }
  if (file.size > 10_000_000) {
    showToast("Choose an audio recording under 10 MB.");
    return;
  }

  pendingVoiceBlob = file;
  ui.voiceCaptured = true;
  ui.recordingSeconds = 0;
  render();
  await transcribePendingVoice();
}

function stopMicrophoneTracks() {
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
}

async function transcribePendingVoice() {
  if (!pendingVoiceBlob) return;
  if (!auth.openai.connected) {
    auth.openAISetup = true;
    auth.openAIError =
      "Your voice note was captured. Connect OpenAI to turn it into text.";
    render();
    return;
  }

  ui.isTranscribing = true;
  render();
  try {
    const audio = await blobToDataUrl(pendingVoiceBlob);
    const payload = await apiClient.transcribe({
      audio,
      mimeType: pendingVoiceBlob.type,
    });
    ui.draft = `${ui.draft}${ui.draft ? " " : ""}${payload.text}`.trim();
    pendingVoiceBlob = null;
    ui.voiceCaptured = false;
    ui.recordingSeconds = 0;
    showToast("Voice note added to your question.");
  } catch (error) {
    showToast(error.message || "I could not transcribe that voice note.");
  } finally {
    ui.isTranscribing = false;
    render();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function toggleFlashlight() {
  if (ui.flashlightOn) {
    flashlightStream?.getTracks().forEach((track) => track.stop());
    flashlightStream = null;
    ui.flashlightOn = false;
    render();
    return;
  }

  try {
    flashlightStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
    });
    const track = flashlightStream.getVideoTracks()[0];
    const capabilities = track.getCapabilities?.() ?? {};
    if (!capabilities.torch) throw new Error("Torch unavailable");
    await track.applyConstraints({ advanced: [{ torch: true }] });
    ui.flashlightOn = true;
    render();
    const video = document.querySelector("[data-flashlight-video]");
    if (video) {
      video.srcObject = flashlightStream;
      video.play().catch(() => {});
    }
  } catch {
    flashlightStream?.getTracks().forEach((track) => track.stop());
    flashlightStream = null;
    showToast("This device doesn’t offer a browser flashlight. Your phone’s quick settings can still turn it on.");
  }
}

root.addEventListener("submit", (event) => {
  const formType = event.target.dataset.form;
  if (formType === "openai-setup") {
    event.preventDefault();
    submitOpenAISetup(event.target);
    return;
  }

  if (["signup", "login"].includes(formType)) {
    event.preventDefault();
    submitAuthForm(event.target);
    return;
  }

  if (formType === "question") {
    event.preventDefault();
    submitQuestion();
  }
});

root.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "open-openai-setup") {
    auth.openAISetup = true;
    auth.openAIError = "";
    render();
  }

  if (action === "close-openai-setup") {
    auth.openAISetup = false;
    auth.openAIError = "";
    render();
  }

  if (action === "discard-voice") {
    pendingVoiceBlob = null;
    ui.voiceCaptured = false;
    ui.recordingSeconds = 0;
    render();
  }

  if (action === "open-browser-camera") {
    openBrowserCamera();
  }

  if (action === "close-browser-camera") {
    closeBrowserCamera();
  }

  if (action === "capture-browser-photo") {
    captureBrowserPhoto();
  }

  if (action === "open-auth") {
    auth.mode = button.dataset.mode || "signup";
    auth.error = "";
    auth.open = true;
    render();
  }

  if (action === "close-auth") {
    auth.open = false;
    auth.error = "";
    render();
  }

  if (action === "auth-mode") {
    auth.mode = button.dataset.mode;
    auth.error = "";
    render();
  }

  if (action === "logout") {
    logout();
  }

  if (action === "forgot-password") {
    requestPasswordReset();
  }

  if (action === "select-section") {
    ui.activeSection = button.dataset.section;
    ui.draft = "";
    ui.attachments = [];
    ui.showThemes = false;
    ui.showCompanions = false;
    render();
  }

  if (action === "toggle-themes") {
    ui.showThemes = !ui.showThemes;
    ui.showCompanions = false;
    render();
  }

  if (action === "toggle-companions") {
    ui.showCompanions = !ui.showCompanions;
    ui.showThemes = false;
    render();
  }

  if (action === "select-theme") {
    state.theme = button.dataset.theme;
    ui.showThemes = false;
    saveState();
    render();
  }

  if (action === "select-companion") {
    state.companion = button.dataset.companion;
    ui.companionActionIndex = 0;
    ui.showCompanions = false;
    saveState();
    render();
  }

  if (action === "toggle-flashlight") toggleFlashlight();
  if (action === "toggle-recording") toggleRecording();

  if (action === "use-prompt") {
    ui.draft = button.dataset.prompt;
    render();
    document.querySelector('[data-field="draft"]')?.focus();
  }

  if (action === "clear-chat") {
    state.chats = { ...state.chats, [ui.activeSection]: [] };
    saveState();
    render();
  }

  if (action === "remove-attachment") {
    ui.attachments.splice(Number(button.dataset.index), 1);
    render();
  }

  if (action === "study-mode") {
    ui.studyMode = button.dataset.mode;
    render();
  }

  if (action === "snap-picture") {
    startCameraCapture();
  }

  if (action === "reset-kit") {
    state.studyKit = null;
    ui.studyMode = "make";
    saveState();
    render();
  }

  if (action === "flip-card") {
    ui.flashFlipped = !ui.flashFlipped;
    render();
  }

  if (action === "previous-card" || action === "next-card") {
    const length = (state.studyKit ?? fallbackKit).cards.length;
    const direction = action === "next-card" ? 1 : -1;
    ui.flashIndex = (ui.flashIndex + direction + length) % length;
    ui.flashFlipped = false;
    render();
  }

  if (action === "check-quiz") {
    const questions = (state.studyKit ?? fallbackKit).questions;
    if (ui.quizRevealed) {
      ui.quizIndex = (ui.quizIndex + 1) % questions.length;
      ui.quizAnswer = "";
      ui.quizRevealed = false;
    } else {
      ui.quizRevealed = true;
    }
    render();
  }
});

root.addEventListener("input", (event) => {
  if (event.target.dataset.field === "draft") {
    ui.draft = event.target.value;
    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`;
    const sendButton = document.querySelector(".send-button");
    if (sendButton) sendButton.disabled = !ui.draft.trim() && !ui.attachments.length;
  }

  if (event.target.dataset.field === "quiz-answer") {
    ui.quizAnswer = event.target.value;
  }
});

root.addEventListener("keydown", (event) => {
  if (event.target.dataset.field === "draft" && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitQuestion();
  }
});

root.addEventListener("change", (event) => {
  if (["image-upload", "camera-upload"].includes(event.target.dataset.field)) {
    addImages(event.target.files ?? []);
  }

  if (event.target.dataset.field === "audio-upload") {
    addAudioFile(event.target.files?.[0]);
  }
});

async function bootstrap() {
  root.innerHTML = `
    <main class="boot-screen">
      <img src="/companions/mascot.png" alt="" />
      <strong>StudyPop</strong>
      <span>Opening your study space...</span>
    </main>
  `;

  try {
    const [firebaseStatus, config] = await Promise.all([
      firebaseClient.initialize(),
      apiClient.config(),
    ]);
    auth.user = firebaseStatus.user ?? null;
    auth.openai = config.openai ?? auth.openai;
    if (auth.user) {
      const synced = await apiClient.loadState();
      if (synced.state) {
        state = normalizeState(synced.state);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } else {
        await apiClient.saveState(stateForCloudSync());
      }
    }
  } catch {
    auth.user = firebaseClient.user;
  } finally {
    auth.ready = true;
    render();
  }
}

bootstrap();

window.setInterval(() => {
  ui.companionActionIndex =
    (ui.companionActionIndex + 1) % companionActions.length;
  ui.movieQuoteIndex = (ui.movieQuoteIndex + 1) % movieQuotes.length;
  updateCompanionMoment();
}, 6500);
