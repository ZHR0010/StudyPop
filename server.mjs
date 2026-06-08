import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const root = resolve(".");
loadEnvFile(join(root, ".env"));

const startPort = Number(process.env.PORT ?? 5173);
const maxBodyBytes = 10_000_000;
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const dataDirectory = join(root, "data");
const usersFile = join(dataDirectory, "users.json");
const sessions = new Map();
const loginAttempts = new Map();
const nativeSpeechSessions = new Map();
const cameraSessions = new Map();
const nativeSpeechDirectory = join(dataDirectory, "native-speech");

mkdirSync(dataDirectory, { recursive: true });
mkdirSync(nativeSpeechDirectory, { recursive: true });
if (!existsSync(usersFile)) {
  writeFileSync(usersFile, JSON.stringify({ users: [] }, null, 2));
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function readUsers() {
  try {
    const parsed = JSON.parse(readFileSync(usersFile, "utf8"));
    return Array.isArray(parsed.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

function writeUsers(users) {
  const temporaryFile = `${usersFile}.${randomUUID()}.tmp`;
  writeFileSync(temporaryFile, JSON.stringify({ users }, null, 2));
  renameSync(temporaryFile, usersFile);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  try {
    const attempted = Buffer.from(hashPassword(password, user.passwordSalt).hash, "hex");
    const expected = Buffer.from(user.passwordHash, "hex");
    return attempted.length === expected.length && timingSafeEqual(attempted, expected);
  } catch {
    return false;
  }
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function sessionForRequest(request) {
  const token = parseCookies(request).studypop_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function currentUser(request) {
  const session = sessionForRequest(request);
  if (!session) return null;
  return readUsers().find((user) => user.id === session.userId) ?? null;
}

function publicUser(user) {
  return user
    ? {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      }
    : null;
}

function createSession(response, request, userId) {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, {
    userId,
    expiresAt: Date.now() + sessionMaxAgeSeconds * 1000,
  });
  const secure =
    process.env.NODE_ENV === "production" ||
    request.headers["x-forwarded-proto"] === "https";
  response.setHeader(
    "set-cookie",
    `studypop_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}${secure ? "; Secure" : ""}`,
  );
}

function clearSession(response, request) {
  const session = sessionForRequest(request);
  if (session) sessions.delete(session.token);
  response.setHeader(
    "set-cookie",
    "studypop_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
  );
}

function requestIsSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function clientKey(request) {
  return String(
    request.headers["x-forwarded-for"] ?? request.socket.remoteAddress ?? "local",
  ).split(",")[0].trim();
}

function loginIsLimited(request) {
  const key = clientKey(request);
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || record.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
    return false;
  }
  record.count += 1;
  return record.count > 12;
}

function clearLoginAttempts(request) {
  loginAttempts.delete(clientKey(request));
}

function cleanSavedState(value) {
  const state = value && typeof value === "object" ? value : {};
  const cleaned = {
    theme: typeof state.theme === "string" ? state.theme.slice(0, 20) : "pink",
    companion:
      typeof state.companion === "string" ? state.companion.slice(0, 40) : "gojo",
    chats: state.chats && typeof state.chats === "object" ? state.chats : {},
    studyKit:
      state.studyKit && typeof state.studyKit === "object" ? state.studyKit : null,
    streak: Number.isFinite(state.streak)
      ? Math.max(0, Math.min(10_000, Math.floor(state.streak)))
      : 3,
  };

  if (Buffer.byteLength(JSON.stringify(cleaned), "utf8") > 8_000_000) {
    throw new Error("Your saved study data is too large. Clear a few image chats first.");
  }
  return cleaned;
}

function openAIStatus() {
  return {
    connected: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
  };
}

function requestIsLoopback(request) {
  const address = String(request.socket.remoteAddress ?? "");
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
}

function writeEnvValue(name, value) {
  const envFile = join(root, ".env");
  const lines = existsSync(envFile)
    ? readFileSync(envFile, "utf8").split(/\r?\n/)
    : [];
  const nextLine = `${name}=${value}`;
  const index = lines.findIndex((line) =>
    line.trimStart().startsWith(`${name}=`),
  );
  if (index === -1) lines.push(nextLine);
  else lines[index] = nextLine;
  writeFileSync(envFile, `${lines.filter(Boolean).join("\n")}\n`);
}

async function verifyOpenAIKey(apiKey) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("OpenAI rejected that API key.");
    }
    throw new Error(`OpenAI connection test failed with status ${response.status}.`);
  }
}

const subjectLabels = {
  study: "the uploaded study notes",
  general: "any general topic",
  math: "mathematics",
  history: "history",
  biology: "biology",
  physics: "physics",
  economics: "economics",
  chemistry: "chemistry",
  literature: "literature",
  government: "government and civics",
};

const scopeKeywords = {
  math: ["equation", "algebra", "fraction", "calculate", "triangle", "integer", "polynomial", "geometry"],
  history: ["world war", "revolution", "empire", "ancient", "colonial", "historical", "renaissance"],
  biology: ["cell", "photosynthesis", "mitosis", "dna", "organism", "enzyme", "ecosystem"],
  physics: ["force", "velocity", "acceleration", "newton", "electricity", "circuit", "momentum"],
  economics: ["inflation", "supply", "demand", "market", "opportunity cost", "gdp", "economy"],
  chemistry: ["atom", "molecule", "ionic", "covalent", "reaction", "periodic", "ph scale", "acid"],
  literature: ["poem", "novel", "metaphor", "character", "theme", "literary", "stanza"],
  government: ["democracy", "parliament", "constitution", "separation of powers", "legislature", "election"],
};

const localKnowledge = [
  {
    terms: ["photosynthesis"],
    answer:
      "**Photosynthesis** is how plants make food. They use sunlight, water, and carbon dioxide to produce glucose for energy, and oxygen is released as a bonus. Think: light in, plant food made, oxygen out.",
  },
  {
    terms: ["mitosis"],
    answer:
      "**Mitosis** is cell copying. One parent cell duplicates its DNA, then splits into two genetically identical cells. Your body uses it for growth and repair.",
  },
  {
    terms: ["dna"],
    answer:
      "**DNA** is the instruction book inside most cells. Its code tells the body how to build proteins, and those proteins help shape how living things grow and work.",
  },
  {
    terms: ["inflation"],
    answer:
      "**Inflation** means prices are rising across the economy over time. When prices rise faster than income, the same amount of money buys less than before.",
  },
  {
    terms: ["supply and demand", "supply", "demand"],
    answer:
      "**Supply** is how much sellers offer. **Demand** is how much buyers want. High demand with low supply usually pushes prices up; low demand with high supply usually pulls prices down.",
  },
  {
    terms: ["opportunity cost"],
    answer:
      "**Opportunity cost** is the next-best thing you give up when you choose something. If you study for an hour instead of watching a film, the film time is the opportunity cost.",
  },
  {
    terms: ["newton's laws", "newton laws", "newton"],
    answer:
      "Newton’s laws, super simply: **1)** motion stays the same unless a force changes it, **2)** force equals mass × acceleration, and **3)** every action has an equal and opposite reaction.",
  },
  {
    terms: ["velocity"],
    answer:
      "**Velocity** is speed with a direction. “20 m/s” is speed; “20 m/s east” is velocity. Direction is the important extra ingredient.",
  },
  {
    terms: ["ionic bond", "ionic bonds"],
    answer:
      "An **ionic bond** forms when one atom gives electron(s) to another. That creates opposite charges, and those positive and negative ions attract each other.",
  },
  {
    terms: ["ph scale", "ph"],
    answer:
      "The **pH scale** tells us how acidic or alkaline a solution is. Below 7 is acidic, 7 is neutral, and above 7 is alkaline. Each step represents a tenfold change.",
  },
  {
    terms: ["democracy"],
    answer:
      "**Democracy** is a system where political power comes from the people, usually through voting and representation. Fair elections, rights, and accountable leaders are key parts.",
  },
  {
    terms: ["separation of powers"],
    answer:
      "**Separation of powers** divides government work among branches so one group does not control everything. Commonly: lawmakers make laws, executives carry them out, and courts interpret them.",
  },
  {
    terms: ["metaphor"],
    answer:
      "A **metaphor** compares two unlike things by saying one *is* the other. “Time is a thief” does not mean time literally steals; it suggests time quietly takes moments away.",
  },
  {
    terms: ["world war i", "world war 1", "ww1"],
    answer:
      "World War I grew from **militarism, alliances, imperial rivalry, and nationalism**. The assassination of Archduke Franz Ferdinand in 1914 was the spark that set those tensions off.",
  },
];

function insideRoot(candidate, base) {
  return candidate === base || candidate.startsWith(`${base}${sep}`);
}

function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requested = pathname === "/" ? "/index.html" : pathname;
  const candidates = [
    normalize(join(root, requested)),
    normalize(join(root, "public", requested)),
  ];

  for (const candidate of candidates) {
    if (insideRoot(candidate, root) && existsSync(candidate)) return candidate;
  }

  return insideRoot(candidates[0], root) ? candidates[0] : null;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let received = 0;
    const chunks = [];

    request.on("data", (chunk) => {
      received += chunk.length;
      if (received > maxBodyBytes) {
        rejectBody(new Error("That upload is a little too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolveBody(text ? JSON.parse(text) : {});
      } catch {
        rejectBody(new Error("I couldn’t read that request."));
      }
    });

    request.on("error", rejectBody);
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  for (const item of data.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return "";
}

async function transcribeAudio(bytes, mimeType, filename) {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error(
      "Voice recording works here, but transcription needs an OPENAI_API_KEY.",
    );
    error.needsSetup = true;
    throw error;
  }
  if (bytes.length < 800) {
    throw new Error(
      "That recording was too short. Hold the mic and speak for a moment.",
    );
  }

  const form = new FormData();
  form.append(
    "model",
    process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
  );
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  const aiResponse = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    },
  );

  if (!aiResponse.ok) {
    const detail = await aiResponse.json().catch(() => null);
    throw new Error(
      detail?.error?.message ||
        `Voice transcription failed with status ${aiResponse.status}.`,
    );
  }

  const data = await aiResponse.json();
  const text = normalizeText(data.text);
  if (!text) {
    throw new Error(
      "No speech was detected. Try again and speak a little closer to the microphone.",
    );
  }
  return text;
}

function transcribeAudioLocally(audioPath) {
  return new Promise((resolveText, rejectText) => {
    const scriptPath = join(root, "scripts", "local-transcribe.ps1");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-AudioPath",
        audioPath,
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      rejectText(new Error("Local speech recognition took too long."));
    }, 35_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectText(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      const text = normalizeText(stdout.replace(/^\uFEFF/, ""));
      if (code === 0 && text) {
        resolveText(text);
      } else {
        rejectText(
          new Error(
            normalizeText(stderr) ||
              "No speech was detected. Speak clearly and try once more.",
          ),
        );
      }
    });
  });
}

function cleanImages(images) {
  return (Array.isArray(images) ? images : [])
    .filter((image) => typeof image === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(image))
    .slice(0, 4);
}

function detectScope(question) {
  const lower = question.toLowerCase();
  return Object.entries(scopeKeywords).find(([, words]) =>
    words.some((word) => lower.includes(word)),
  )?.[0];
}

function answerSimpleMath(question) {
  const linear = question
    .replace(/\s/g, "")
    .match(/(?:solve)?(-?\d*)x([+-]\d+)?=(-?\d+(?:\.\d+)?)/i);

  if (linear) {
    const coefficient = linear[1] === "" || linear[1] === "+" ? 1 : linear[1] === "-" ? -1 : Number(linear[1]);
    const constant = Number(linear[2] || 0);
    const result = (Number(linear[3]) - constant) / coefficient;
    return `Let’s isolate x:\n\n**${coefficient}x ${constant >= 0 ? "+" : "−"} ${Math.abs(constant)} = ${linear[3]}**\n\nMove ${Math.abs(constant)} to the other side, then divide by ${coefficient}.\n\n**x = ${Number(result.toFixed(6))}** ✨`;
  }

  const expression = question.match(/[-+*/^().\d\s]{3,}/)?.[0]?.trim();
  if (expression && /^[\d+\-*/^().\s]+$/.test(expression)) {
    try {
      const value = Function(`"use strict"; return (${expression.replaceAll("^", "**")})`)();
      if (Number.isFinite(value)) {
        return `I worked it through: **${expression} = ${Number(value.toFixed(8))}**.\n\nRemember: brackets first, then powers, multiply/divide, and finally add/subtract.`;
      }
    } catch {
      // The friendly fallback below handles incomplete expressions.
    }
  }

  return "";
}

function localAnswer(section, question, images, studyContext) {
  if (images.length && !question) {
    return "I received your picture. Image reading becomes fully available when an `OPENAI_API_KEY` is connected to the app. For now, type the question under the image and I’ll help right away.";
  }

  if (section !== "general" && section !== "study") {
    const detected = detectScope(question);
    if (detected && detected !== section) {
      return `That looks more like a **${subjectLabels[detected]}** question. This room is only for **${subjectLabels[section]}**, so pop it into the ${detected[0].toUpperCase() + detected.slice(1)} section and I’ll jump in there.`;
    }
  }

  if (section === "math") {
    const mathAnswer = answerSimpleMath(question);
    if (mathAnswer) return mathAnswer;
  }

  const lower = question.toLowerCase();
  const knowledge = localKnowledge.find((entry) =>
    entry.terms.some((term) => lower.includes(term)),
  );
  if (knowledge) return `${knowledge.answer}\n\nWant me to turn that into an example or a mini quiz question?`;

  if (section === "study" && studyContext?.summary) {
    return `Based on your study kit, the big idea is: **${studyContext.summary}**\n\nAsk me about one specific point and I’ll unpack it in smaller steps.`;
  }

  return `Here’s the easy way to approach this ${section === "general" ? "question" : `${section} question`}: first identify the main idea, then split it into the “what,” “how,” and “why.”\n\nYou asked: **${question || "about the attached image"}**\n\nI can give a much more specific answer when the app is connected to OpenAI. Meanwhile, add one detail or key term and I’ll use the built-in study guide to narrow it down.`;
}

async function generateOpenAIAnswer({ section, question, images, history, companion, studyContext }) {
  const transcript = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((message) => `${message.role === "assistant" ? "Tutor" : "Student"}: ${normalizeText(message.text)}`)
    .join("\n");
  const studyNote = studyContext?.summary
    ? `\nCurrent study summary: ${studyContext.summary}\nKey points: ${(studyContext.keyPoints ?? []).join("; ")}`
    : "";
  const content = [
    {
      type: "input_text",
      text: `Conversation so far:\n${transcript || "(new conversation)"}${studyNote}\n\nStudent's latest question: ${question || "Please answer the question in the attached image."}`,
    },
    ...images.map((image_url) => ({ type: "input_image", image_url })),
  ];
  const scopeInstruction = section === "general"
    ? "You can answer any general question."
    : section === "study"
      ? "Answer using the supplied study context when possible. Help with follow-up questions about the notes."
      : `Only answer questions that belong to ${subjectLabels[section]}. If the question is clearly outside that subject, warmly direct the student to the right section instead of answering it.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      store: false,
      reasoning: { effort: "medium" },
      instructions: `You are ${companion || "a cute study companion"} inside StudyPop. ${scopeInstruction}

Answer the student's exact question accurately. Match the depth to the difficulty: brief for simple questions, thorough for complex ones. For multi-step problems, use numbered steps, explain why each step is taken, define difficult terms, and finish with a clearly labeled final answer or takeaway. Check calculations before answering. Use a warm, natural tone that a student can understand without sounding babyish.

Use simple Markdown headings, bold text, and lists. Write math with familiar classroom symbols. Use × for multiplication, ÷ for division, √ for square roots, superscript powers such as x² and x³, / for written fractions, and = for equality. Examples: 3 × 4 = 12, 12 ÷ 3 = 4, √25 = 5, and x² + 2x + 1. Do not use asterisks for multiplication, middle dots, sqrt(...), caret powers such as x^2, raw LaTeX, or unusual notation when an everyday symbol exists. Never use LaTeX delimiters or commands such as \\[, \\], \\(, \\), \\frac, \\boxed, or \\begin. Never claim to have read an image if none was provided.`,
      input: [{ role: "user", content }],
      max_output_tokens: 2600,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI answered with status ${response.status}`);
  }

  const answer = extractResponseText(await response.json()).trim();
  if (!answer) throw new Error("The AI response was empty.");
  return answer;
}

function splitSentences(note) {
  return normalizeText(note)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((sentence) => sentence.length > 20)
    .slice(0, 16);
}

function localStudyKit(note, hasImages) {
  const sentences = splitSentences(note);
  const fallbackSentence = hasImages
    ? "A question image was added. Connect OpenAI to read its details automatically."
    : "Add a little more detail to make this study kit even stronger.";
  const useful = sentences.length ? sentences : [normalizeText(note) || fallbackSentence];
  const summary = useful.slice(0, 3).join(" ").slice(0, 520);
  const keyPoints = useful.slice(0, 4).map((sentence) => sentence.slice(0, 150));
  const cards = useful.slice(0, 6).map((sentence, index) => ({
    front: index === 0 ? "What is the main idea?" : `What should you remember about point ${index + 1}?`,
    back: sentence.slice(0, 260),
  }));
  const questions = [
    "Explain the main idea in your own words.",
    "Which detail feels most important, and why?",
    "How would you teach this topic to a friend?",
  ];

  return { summary, keyPoints, cards, questions };
}

async function generateOpenAIStudyKit(note, images) {
  const content = [
    {
      type: "input_text",
      text: `Turn these notes into a friendly study kit. Notes:\n${note || "(Use the attached note image.)"}`,
    },
    ...images.map((image_url) => ({ type: "input_image", image_url })),
  ];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4-mini",
      store: false,
      instructions:
        "Create a compact study kit from the supplied notes or note images. Use only information present in the notes. Keep the tone easy and clear. Return JSON only.",
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "study_kit",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              summary: { type: "string" },
              keyPoints: {
                type: "array",
                minItems: 2,
                maxItems: 5,
                items: { type: "string" },
              },
              cards: {
                type: "array",
                minItems: 3,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    front: { type: "string" },
                    back: { type: "string" },
                  },
                  required: ["front", "back"],
                },
              },
              questions: {
                type: "array",
                minItems: 3,
                maxItems: 6,
                items: { type: "string" },
              },
            },
            required: ["summary", "keyPoints", "cards", "questions"],
          },
        },
      },
      max_output_tokens: 1900,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI answered with status ${response.status}`);
  return JSON.parse(extractResponseText(await response.json()));
}

async function handleSession(request, response) {
  const user = currentUser(request);
  sendJson(response, 200, {
    user: publicUser(user),
    state: user?.state ?? null,
    openai: openAIStatus(),
  });
}

async function handleSignup(request, response) {
  try {
    if (loginIsLimited(request)) {
      sendJson(response, 429, {
        error: "Too many attempts. Take a short break and try again.",
      });
      return;
    }

    const body = await readJsonBody(request);
    const name = normalizeText(body.name).slice(0, 50);
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");

    if (name.length < 2) {
      sendJson(response, 400, { error: "Add a name with at least 2 characters." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
      sendJson(response, 400, { error: "Enter a valid email address." });
      return;
    }
    if (password.length < 8 || password.length > 72) {
      sendJson(response, 400, {
        error: "Use a password between 8 and 72 characters.",
      });
      return;
    }

    const users = readUsers();
    if (users.some((user) => user.email === email)) {
      sendJson(response, 409, {
        error: "An account with that email already exists.",
      });
      return;
    }

    const passwordRecord = hashPassword(password);
    const user = {
      id: randomUUID(),
      name,
      email,
      passwordSalt: passwordRecord.salt,
      passwordHash: passwordRecord.hash,
      createdAt: new Date().toISOString(),
      state: cleanSavedState(body.state),
    };
    users.push(user);
    writeUsers(users);
    createSession(response, request, user.id);
    clearLoginAttempts(request);
    sendJson(response, 201, {
      user: publicUser(user),
      state: user.state,
      openai: openAIStatus(),
    });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function handleLogin(request, response) {
  try {
    if (loginIsLimited(request)) {
      sendJson(response, 429, {
        error: "Too many attempts. Take a short break and try again.",
      });
      return;
    }

    const body = await readJsonBody(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? "");
    const user = readUsers().find((item) => item.email === email);

    if (!user || !verifyPassword(password, user)) {
      sendJson(response, 401, { error: "Email or password is incorrect." });
      return;
    }

    createSession(response, request, user.id);
    clearLoginAttempts(request);
    sendJson(response, 200, {
      user: publicUser(user),
      state: user.state ?? null,
      openai: openAIStatus(),
    });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function handleLogout(request, response) {
  clearSession(response, request);
  sendJson(response, 200, { ok: true });
}

async function handleSaveState(request, response) {
  try {
    const session = sessionForRequest(request);
    if (!session) {
      sendJson(response, 401, { error: "Log in to sync your study data." });
      return;
    }

    const body = await readJsonBody(request);
    const users = readUsers();
    const index = users.findIndex((user) => user.id === session.userId);
    if (index === -1) {
      clearSession(response, request);
      sendJson(response, 401, { error: "Your session is no longer valid." });
      return;
    }

    users[index].state = cleanSavedState(body.state);
    users[index].updatedAt = new Date().toISOString();
    writeUsers(users);
    sendJson(response, 200, { saved: true });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function handleOpenAIConnect(request, response) {
  try {
    if (!requestIsLoopback(request)) {
      sendJson(response, 403, {
        error: "OpenAI setup is available only from this local computer.",
      });
      return;
    }

    const body = await readJsonBody(request);
    const apiKey = String(body.apiKey ?? "").trim();
    if (!/^sk-[A-Za-z0-9_-]{27,}$/.test(apiKey)) {
      sendJson(response, 400, {
        error: "Enter a complete OpenAI API key.",
      });
      return;
    }

    await verifyOpenAIKey(apiKey);
    writeEnvValue("OPENAI_API_KEY", apiKey);
    if (!process.env.OPENAI_MODEL) {
      writeEnvValue("OPENAI_MODEL", "gpt-5.4-mini");
    }
    if (!process.env.OPENAI_TRANSCRIBE_MODEL) {
      writeEnvValue("OPENAI_TRANSCRIBE_MODEL", "gpt-4o-mini-transcribe");
    }
    process.env.OPENAI_API_KEY = apiKey;
    process.env.OPENAI_MODEL ??= "gpt-5.4-mini";
    process.env.OPENAI_TRANSCRIBE_MODEL ??= "gpt-4o-mini-transcribe";

    sendJson(response, 200, { openai: openAIStatus() });
  } catch (error) {
    sendJson(response, 400, {
      error:
        error.name === "TimeoutError"
          ? "OpenAI did not respond in time. Check your internet connection."
          : error.message,
    });
  }
}

function removeNativeSpeechFiles(session) {
  for (const filePath of [
    session.audioPath,
    session.transcriptPath,
    session.stopPath,
  ]) {
    try {
      rmSync(filePath, { force: true });
    } catch {
      // Temporary voice files are cleaned up again on the next recording.
    }
  }
}

async function handleNativeSpeechStart(request, response) {
  if (!requestIsLoopback(request)) {
    sendJson(response, 403, {
      error: "Voice recording is available only from this local computer.",
    });
    return;
  }

  const id = randomUUID();
  const audioPath = join(nativeSpeechDirectory, `${id}.wav`);
  const transcriptPath = join(nativeSpeechDirectory, `${id}.txt`);
  const stopPath = join(nativeSpeechDirectory, `${id}.stop`);
  const scriptPath = join(root, "scripts", "native-speech.ps1");
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-AudioPath",
      audioPath,
      "-TranscriptPath",
      transcriptPath,
      "-StopPath",
      stopPath,
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    },
  );

  const session = {
    id,
    child,
    audioPath,
    transcriptPath,
    stopPath,
    stderr: "",
    exited: false,
    exitCode: null,
  };
  session.exitPromise = new Promise((resolveExit) => {
    child.once("error", (error) => {
      session.stderr = error.message;
      session.exited = true;
      resolveExit();
    });
    child.once("exit", (code) => {
      session.exitCode = code;
      session.exited = true;
      resolveExit();
    });
  });
  child.stderr.on("data", (chunk) => {
    session.stderr = `${session.stderr}${chunk}`.slice(-2000);
  });
  nativeSpeechSessions.set(id, session);

  await Promise.race([
    session.exitPromise,
    new Promise((resolveWait) => setTimeout(resolveWait, 700)),
  ]);

  if (session.exited) {
    nativeSpeechSessions.delete(id);
    removeNativeSpeechFiles(session);
    sendJson(response, 503, {
      error:
        normalizeText(session.stderr) ||
        "Windows could not start the microphone. Check the system microphone settings.",
    });
    return;
  }

  sendJson(response, 200, { id });
}

async function handleNativeSpeechStop(request, response) {
  if (!requestIsLoopback(request)) {
    sendJson(response, 403, {
      error: "Voice recording is available only from this local computer.",
    });
    return;
  }

  let session = null;
  let id = "";
  try {
    const body = await readJsonBody(request);
    id = String(body.id ?? "");
    session = nativeSpeechSessions.get(id);
    if (!session) {
      sendJson(response, 404, {
        error: "That voice recording is no longer active.",
      });
      return;
    }

    writeFileSync(session.stopPath, "");
    await Promise.race([
      session.exitPromise,
      new Promise((resolveWait) => setTimeout(resolveWait, 5000)),
    ]);

    if (!session.exited) {
      session.child.kill();
      await Promise.race([
        session.exitPromise,
        new Promise((resolveWait) => setTimeout(resolveWait, 1000)),
      ]);
    }

    if (!existsSync(session.audioPath)) {
      throw new Error("Windows did not create an audio recording.");
    }
    const bytes = readFileSync(session.audioPath);
    let text;
    try {
      text = await transcribeAudio(bytes, "audio/wav", "voice-note.wav");
    } catch (openAIError) {
      text = existsSync(session.transcriptPath)
        ? normalizeText(readFileSync(session.transcriptPath, "utf8"))
        : "";
      if (!text) {
        try {
          text = await transcribeAudioLocally(session.audioPath);
        } catch (localError) {
          throw new Error(
            localError.message ||
              openAIError.message ||
              "No speech was detected. Speak clearly and try once more.",
          );
        }
      }
    }

    sendJson(response, 200, { text });
  } catch (error) {
    sendJson(response, 400, {
      error: error.message || "Windows could not finish that voice recording.",
      needsSetup: Boolean(error.needsSetup),
    });
  } finally {
    if (session) {
      nativeSpeechSessions.delete(id);
      removeNativeSpeechFiles(session);
    }
  }
}

function cleanExpiredCameraSessions() {
  const now = Date.now();
  for (const [id, session] of cameraSessions) {
    if (session.expiresAt <= now) cameraSessions.delete(id);
  }
}

function launchCameraWindow(cameraUrl) {
  const chromeCandidates = [
    join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    join(
      process.env["ProgramFiles(x86)"] ?? "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
    join(
      process.env.LOCALAPPDATA ?? "",
      "Google",
      "Chrome",
      "Application",
      "chrome.exe",
    ),
  ];
  const chromePath = chromeCandidates.find((filePath) => existsSync(filePath));
  if (chromePath) {
    const browser = spawn(
      chromePath,
      [`--app=${cameraUrl}`, "--new-window"],
      { detached: true, stdio: "ignore", windowsHide: false },
    );
    browser.unref();
    return;
  }

  const launcher = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `Start-Process '${cameraUrl.replaceAll("'", "''")}'`,
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  launcher.unref();
}

function handleCameraStart(request, response) {
  if (!requestIsLoopback(request)) {
    sendJson(response, 403, {
      error: "Camera capture is available only from this local computer.",
    });
    return;
  }

  cleanExpiredCameraSessions();
  const id = randomUUID();
  cameraSessions.set(id, {
    status: "waiting",
    image: "",
    expiresAt: Date.now() + 3 * 60 * 1000,
  });
  const host = String(request.headers.host ?? `127.0.0.1:${startPort}`);
  const cameraUrl = `http://${host}/camera.html?id=${encodeURIComponent(id)}`;
  launchCameraWindow(cameraUrl);
  sendJson(response, 200, { id });
}

async function handleCameraComplete(request, response) {
  if (!requestIsLoopback(request)) {
    sendJson(response, 403, { error: "That camera request was blocked." });
    return;
  }

  try {
    const body = await readJsonBody(request);
    const id = String(body.id ?? "");
    const session = cameraSessions.get(id);
    const image = String(body.image ?? "");
    if (!session || session.expiresAt <= Date.now()) {
      sendJson(response, 404, { error: "That camera session expired." });
      return;
    }
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) {
      sendJson(response, 400, { error: "The captured picture could not be read." });
      return;
    }
    session.status = "ready";
    session.image = image;
    sendJson(response, 200, { saved: true });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

function handleCameraStatus(request, response) {
  cleanExpiredCameraSessions();
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const id = requestUrl.searchParams.get("id") ?? "";
  const session = cameraSessions.get(id);
  if (!session) {
    sendJson(response, 404, { error: "That camera session expired." });
    return;
  }
  if (session.status !== "ready") {
    sendJson(response, 200, { status: "waiting" });
    return;
  }
  cameraSessions.delete(id);
  sendJson(response, 200, { status: "ready", image: session.image });
}

function handleWindowsDictationToggle(request, response) {
  if (!requestIsLoopback(request)) {
    sendJson(response, 403, {
      error: "Windows voice typing is available only on this computer.",
    });
    return;
  }

  const scriptPath = join(root, "scripts", "toggle-dictation.ps1");
  const child = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
    ],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.once("error", (error) => {
    sendJson(response, 500, { error: error.message });
  });
  child.once("exit", (code) => {
    if (response.writableEnded) return;
    if (code === 0) {
      sendJson(response, 200, { toggled: true });
    } else {
      sendJson(response, 500, {
        error:
          normalizeText(stderr) ||
          "Windows voice typing could not start.",
      });
    }
  });
}

async function handleAnswer(request, response) {
  try {
    const body = await readJsonBody(request);
    const section = subjectLabels[body.section] ? body.section : "general";
    const question = normalizeText(body.question).slice(0, 6000);
    const images = cleanImages(body.images);
    if (!question && !images.length) {
      sendJson(response, 400, { error: "Add a question, image, or voice note first." });
      return;
    }

    let answer;
    if (process.env.OPENAI_API_KEY) {
      try {
        answer = await generateOpenAIAnswer({
          section,
          question,
          images,
          history: body.history,
          companion: normalizeText(body.companion).slice(0, 80),
          studyContext: body.studyContext,
        });
      } catch (error) {
        console.warn(error.message);
        answer = localAnswer(section, question, images, body.studyContext);
      }
    } else {
      answer = localAnswer(section, question, images, body.studyContext);
    }

    sendJson(response, 200, {
      provider: process.env.OPENAI_API_KEY ? "openai-or-fallback" : "local",
      answer,
    });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function handleStudy(request, response) {
  try {
    const body = await readJsonBody(request);
    const note = normalizeText(body.note).slice(0, 24_000);
    const images = cleanImages(body.images);
    if (note.length < 12 && !images.length) {
      sendJson(response, 400, { error: "Add a few lines of notes or a clear note photo first." });
      return;
    }

    let kit;
    if (process.env.OPENAI_API_KEY) {
      try {
        kit = await generateOpenAIStudyKit(note, images);
      } catch (error) {
        console.warn(error.message);
        kit = localStudyKit(note, images.length > 0);
      }
    } else {
      kit = localStudyKit(note, images.length > 0);
    }

    sendJson(response, 200, { kit });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}

async function handleTranscribe(request, response) {
  try {
    const body = await readJsonBody(request);
    const match = String(body.audio ?? "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      sendJson(response, 400, { error: "That voice note could not be read." });
      return;
    }

    const bytes = Buffer.from(match[2], "base64");
    const extension = match[1].includes("mp4")
      ? "mp4"
      : match[1].includes("ogg")
        ? "ogg"
        : "webm";
    const text = await transcribeAudio(
      bytes,
      match[1],
      `voice-note.${extension}`,
    );
    sendJson(response, 200, { text });
  } catch (error) {
    sendJson(response, error.needsSetup ? 503 : 400, {
      error: error.message,
      needsSetup: Boolean(error.needsSetup),
    });
  }
}

function createAppServer() {
  return createServer((request, response) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method ?? "") &&
      !requestIsSameOrigin(request)
    ) {
      sendJson(response, 403, { error: "That request was blocked." });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/session")) {
      handleSession(request, response);
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/status")) {
      sendJson(response, 200, { openai: openAIStatus() });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/camera/status")) {
      handleCameraStatus(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/signup")) {
      handleSignup(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/login")) {
      handleLogin(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/logout")) {
      handleLogout(request, response);
      return;
    }

    if (request.method === "PUT" && request.url?.startsWith("/api/state")) {
      handleSaveState(request, response);
      return;
    }

    if (
      request.method === "POST" &&
      request.url?.startsWith("/api/openai/connect")
    ) {
      handleOpenAIConnect(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/voice/start")) {
      handleNativeSpeechStart(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/voice/stop")) {
      handleNativeSpeechStop(request, response);
      return;
    }

    if (
      request.method === "POST" &&
      request.url?.startsWith("/api/voice/dictation-toggle")
    ) {
      handleWindowsDictationToggle(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/camera/start")) {
      handleCameraStart(request, response);
      return;
    }

    if (
      request.method === "POST" &&
      request.url?.startsWith("/api/camera/complete")
    ) {
      handleCameraComplete(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/answer")) {
      handleAnswer(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/study")) {
      handleStudy(request, response);
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/transcribe")) {
      handleTranscribe(request, response);
      return;
    }

    const filePath = resolveRequestPath(request.url ?? "/");
    if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  });
}

function listen(port) {
  const server = createAppServer();

  server.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      listen(port + 1);
      return;
    }
    throw error;
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    writeFileSync(".server-port", String(port));
    console.log(`StudyPop running at ${url}`);
  });
}

listen(startPort);
