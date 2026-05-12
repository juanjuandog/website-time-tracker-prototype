import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.TRACKER_DATA_DIR ? path.resolve(process.env.TRACKER_DATA_DIR) : path.join(__dirname, "data");
const LEGACY_JSON_FILE = path.join(DATA_DIR, "activity.json");
const DB_FILE = path.join(DATA_DIR, "activity.sqlite");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const START_PORT = Number(process.env.PORT || 4173);
const SAMPLE_MS = 2000;
const IDLE_CLOSE_MS = 8000;
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const MAX_SAMPLE_GAP_MS = 30 * 1000;
const SQLITE_MAX_BUFFER = 64 * 1024 * 1024;
const DEFAULT_CATEGORIES = ["学习", "娱乐", "社交", "其他", "未分类"];
const DEFAULT_CATEGORY_RULES = [];

const browserScripts = new Map([
  ["Safari", 'tell application "Safari" to if (count of windows) > 0 then return URL of current tab of front window & linefeed & name of current tab of front window'],
  ["Google Chrome", 'tell application "Google Chrome" to if (count of windows) > 0 then return URL of active tab of front window & linefeed & title of active tab of front window'],
  ["Microsoft Edge", 'tell application "Microsoft Edge" to if (count of windows) > 0 then return URL of active tab of front window & linefeed & title of active tab of front window'],
  ["Brave Browser", 'tell application "Brave Browser" to if (count of windows) > 0 then return URL of active tab of front window & linefeed & title of active tab of front window'],
  ["Arc", 'tell application "Arc" to if (count of windows) > 0 then return URL of active tab of front window & linefeed & title of active tab of front window'],
  ["Chromium", 'tell application "Chromium" to if (count of windows) > 0 then return URL of active tab of front window & linefeed & title of active tab of front window']
]);

const state = {
  running: process.env.TRACKER_START_PAUSED !== "1",
  idle: false,
  idleSeconds: 0,
  lastSample: null,
  lastError: null,
  current: null,
  pendingCategoryTarget: null,
  sessions: [],
  settings: {
    recordMode: "strip-query",
    ignoredPatterns: ["localhost", "127.0.0.1", "bank", "paypal", "stripe", "gmail", "mail", "password", "1password", "bitwarden", "lastpass"],
    categories: DEFAULT_CATEGORIES,
    categoryRules: DEFAULT_CATEGORY_RULES
  }
};

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
  await loadSettings();
  await dbExec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      type TEXT NOT NULL,
      app TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      domain TEXT NOT NULL,
      path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_domain ON sessions(domain);
  `);

  const count = Number((await dbText("SELECT COUNT(*) FROM sessions;")).trim() || 0);
  if (count === 0 && existsSync(LEGACY_JSON_FILE)) {
    const raw = await readFile(LEGACY_JSON_FILE, "utf8");
    try {
      const parsed = JSON.parse(raw);
      const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      for (const session of sessions) {
        await saveSession(session);
      }
    } catch {
      state.sessions = [];
    }
  }
  state.sessions = await loadSessions();
}

async function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) {
    await saveSettings();
    return;
  }
  try {
    const raw = await readFile(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    state.settings = normalizeSettings(parsed);
  } catch {
    await saveSettings();
  }
}

async function saveSettings() {
  await writeFile(SETTINGS_FILE, JSON.stringify(state.settings, null, 2));
}

function normalizeSettings(input) {
  const recordModes = new Set(["full", "strip-query", "domain"]);
  const categories = normalizeCategories(input?.categories);
  return {
    recordMode: recordModes.has(input?.recordMode) ? input.recordMode : state.settings.recordMode,
    ignoredPatterns: Array.isArray(input?.ignoredPatterns)
      ? input.ignoredPatterns.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
      : state.settings.ignoredPatterns,
    categories,
    categoryRules: normalizeCategoryRules(input?.categoryRules, categories)
  };
}

function normalizeCategories(input) {
  const source = Array.isArray(input) && input.length ? input : DEFAULT_CATEGORIES;
  const categories = source.map((item) => String(item).trim()).filter(Boolean);
  return [...new Set([...categories, "其他", "未分类"])];
}

function normalizeCategoryRules(input, categories = DEFAULT_CATEGORIES) {
  const source = Array.isArray(input) ? input : [];
  return source
    .map((rule) => ({
      pattern: String(rule?.pattern ?? "").trim().toLowerCase(),
      type: rule?.type === "app" ? "app" : "domain",
      category: categories.includes(rule?.category) ? rule.category : "其他"
    }))
    .filter((rule) => rule.pattern);
}

async function dbText(sql) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", [DB_FILE, sql], { maxBuffer: SQLITE_MAX_BUFFER, timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout);
    });
  });
}

async function dbExec(sql) {
  await dbText(sql);
}

async function dbJson(sql) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-json", DB_FILE, sql], { maxBuffer: SQLITE_MAX_BUFFER, timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout.trim() ? JSON.parse(stdout) : []);
    });
  });
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function loadSessions() {
  const rows = await dbJson("SELECT * FROM sessions ORDER BY started_at ASC;");
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    type: row.type,
    app: row.app,
    title: row.title,
    url: row.url,
    domain: row.domain,
    path: row.path,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds
  }));
}

async function saveSession(session) {
  await dbExec(`
    INSERT INTO sessions (
      id, key, type, app, title, url, domain, path, started_at, ended_at, duration_seconds
    ) VALUES (
      ${sqlValue(session.id)},
      ${sqlValue(session.key)},
      ${sqlValue(session.type)},
      ${sqlValue(session.app)},
      ${sqlValue(session.title)},
      ${sqlValue(session.url)},
      ${sqlValue(session.domain)},
      ${sqlValue(session.path)},
      ${sqlValue(session.startedAt)},
      ${sqlValue(session.endedAt)},
      ${Number(session.durationSeconds) || 0}
    )
    ON CONFLICT(id) DO UPDATE SET
      key = excluded.key,
      type = excluded.type,
      app = excluded.app,
      title = excluded.title,
      url = excluded.url,
      domain = excluded.domain,
      path = excluded.path,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      duration_seconds = excluded.duration_seconds;
  `);
}

function osa(script) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function getFrontApp() {
  return osa('tell application "System Events" to get name of first application process whose frontmost is true');
}

async function getIdleSeconds() {
  return new Promise((resolve, reject) => {
    execFile("ioreg", ["-c", "IOHIDSystem"], { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      const match = stdout.match(/"HIDIdleTime" = (\d+)/);
      resolve(match ? Number(match[1]) / 1_000_000_000 : 0);
    });
  });
}

function normalizeUrl(rawUrl) {
  if (!rawUrl) return { url: "", domain: "", path: "" };
  try {
    const parsed = new URL(rawUrl);
    return {
      url: parsed.href,
      domain: parsed.hostname.replace(/^www\./, ""),
      path: `${parsed.pathname}${parsed.search}`
    };
  } catch {
    return { url: rawUrl, domain: "", path: "" };
  }
}

function shouldIgnoreSample(sample) {
  if (String(sample.app || "").toLowerCase().includes("web-time-tracker")) return true;
  if (sample.type !== "web") return false;
  const haystack = [sample.domain, sample.url, sample.title].join(" ").toLowerCase();
  return state.settings.ignoredPatterns.some((pattern) => haystack.includes(pattern));
}

function applyPrivacyMode(sample) {
  if (sample.type !== "web" || !sample.url) return sample;
  if (state.settings.recordMode === "full") return sample;

  try {
    const parsed = new URL(sample.url);
    if (state.settings.recordMode === "domain") {
      const url = `${parsed.protocol}//${parsed.hostname}/`;
      return {
        ...sample,
        title: sample.domain,
        url,
        path: "/"
      };
    }
    parsed.search = "";
    parsed.hash = "";
    return {
      ...sample,
      url: parsed.href,
      path: parsed.pathname
    };
  } catch {
    return sample;
  }
}

async function sampleActivity() {
  const now = new Date();
  try {
    const idleSeconds = await getIdleSeconds();
    state.idleSeconds = Math.round(idleSeconds);
    state.idle = idleSeconds * 1000 >= IDLE_THRESHOLD_MS;
    if (state.idle) {
      state.lastSample = {
        app: "Idle",
        type: "idle",
        title: "电脑空闲中",
        url: "",
        domain: "",
        path: "",
        sampledAt: now.toISOString()
      };
      closeCurrent(now, true);
      state.lastError = null;
      return;
    }

    const app = await getFrontApp();
    let sample = {
      app,
      type: "app",
      title: app,
      url: "",
      domain: "",
      path: "",
      sampledAt: now.toISOString()
    };

    if (browserScripts.has(app)) {
      const output = await osa(browserScripts.get(app));
      const [rawUrl = "", ...titleLines] = output.split(/\r?\n/);
      const normalized = normalizeUrl(rawUrl.trim());
      sample = {
        app,
        type: "web",
        title: titleLines.join("\n").trim() || normalized.domain || rawUrl.trim(),
        ...normalized,
        sampledAt: now.toISOString()
      };
    }

    if (shouldIgnoreSample(sample)) {
      state.lastError = null;
      state.lastSample = {
        ...sample,
        type: "ignored",
        title: "已按忽略列表跳过"
      };
      closeCurrent(now, true);
      return;
    }

    sample = applyPrivacyMode(sample);

    state.lastError = null;
    state.lastSample = sample;
    await applySample(sample, now);
  } catch (error) {
    state.lastError = {
      message: error.message,
      at: now.toISOString(),
      hint: "macOS may need Automation or Accessibility permission for Terminal/Codex to read the front app and browser tab."
    };
    closeCurrent(now);
  }
}

function sessionKey(sample) {
  return [sample.type, sample.app, sample.domain, sample.url, sample.title].join("::");
}

async function applySample(sample, now) {
  if (!sample.url && sample.type === "web") return;
  const key = sessionKey(sample);
  if (state.current?.key === key) {
    const lastEnd = new Date(state.current.endedAt);
    const sampleGapMs = now - lastEnd;
    if (sampleGapMs > MAX_SAMPLE_GAP_MS) {
      closeCurrent(now, true);
    } else {
      state.current.endedAt = now.toISOString();
      state.current.durationSeconds += Math.max(1, Math.round(sampleGapMs / 1000));
      await saveSession(state.current);
      return;
    }
  }
  closeCurrent(now);
  state.current = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    key,
    type: sample.type,
    app: sample.app,
    title: sample.title,
    url: sample.url,
    domain: sample.domain || sample.app,
    path: sample.path,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
    durationSeconds: 1
  };
  state.sessions.push(state.current);
  await saveSession(state.current);
}

function closeCurrent(now = new Date(), force = false) {
  if (!state.current) return;
  const lastEnd = new Date(state.current.endedAt);
  if (force || now - lastEnd > IDLE_CLOSE_MS) {
    state.current = null;
  }
}

function summarizeRange(sessions, startDate, endDate) {
  const filtered = sessions.filter((s) => {
    const date = sessionDateKey(s);
    return date >= startDate && date <= endDate;
  });
  const totalSeconds = filtered.reduce((sum, s) => sum + s.durationSeconds, 0);
  return {
    totalSeconds,
    byCategory: groupBy(filtered, categorizeSession),
    byDomain: groupBy(filtered, (s) => s.domain || s.app),
    byPage: groupBy(filtered, (s) => s.url || `${s.app}:${s.title}`)
  };
}

function categorizeSession(session) {
  return findCategoryRule(categoryTargetForSession(session))?.category || "未分类";
}

function categoryTargetForSession(session) {
  if (session.type === "web" && session.domain) {
    return { type: "domain", key: String(session.domain).toLowerCase(), label: session.domain };
  }
  const app = session.app || session.domain || session.title;
  return { type: "app", key: String(app).toLowerCase(), label: app };
}

function findCategoryRule(target) {
  if (!target?.key) return null;
  return state.settings.categoryRules.find((rule) => {
    if (rule.type !== target.type) return false;
    return target.type === "domain"
      ? target.key === rule.pattern || target.key.endsWith(`.${rule.pattern}`)
      : target.key === rule.pattern;
  });
}

function unknownCategoryTarget() {
  if (state.pendingCategoryTarget) {
    if (findCategoryRule(state.pendingCategoryTarget)) {
      state.pendingCategoryTarget = null;
    } else {
      return state.pendingCategoryTarget;
    }
  }
  const sample = state.current || state.lastSample;
  if (!sample || sample.type === "ignored" || sample.type === "idle") return null;
  const target = categoryTargetForSession(sample);
  if (!target.key || findCategoryRule(target)) return null;
  state.pendingCategoryTarget = target;
  return target;
}

function groupBy(sessions, keyFn) {
  const map = new Map();
  for (const session of sessions) {
    const key = keyFn(session);
    const entry = map.get(key) || {
      key,
      title: session.title,
      domain: session.domain,
      url: session.url,
      app: session.app,
      durationSeconds: 0,
      visits: 0
    };
    entry.durationSeconds += session.durationSeconds;
    entry.visits += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.durationSeconds - a.durationSeconds);
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${seconds} 秒`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function todayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function sessionDateKey(session) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(session.startedAt));
}

function getWeekRange(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  const start = addDays(date, 1 - day);
  const end = addDays(start, 6);
  return { start: toDateKey(start), end: toDateKey(end) };
}

function getMonthRange(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: toDateKey(start), end: toDateKey(end) };
}

function getViewRange(dateKey, view) {
  if (view === "week") return { ...getWeekRange(dateKey), label: "本周" };
  if (view === "month") return { ...getMonthRange(dateKey), label: "本月" };
  return { start: dateKey, end: dateKey, label: "今日" };
}

function markdownTable(rows, totalSeconds) {
  if (!rows.length) return "暂无记录。";
  const lines = ["| 网站 | 耗时 | 占比 | 记录次数 |", "| --- | ---: | ---: | ---: |"];
  for (const row of rows) {
    const percent = totalSeconds > 0 ? Math.round((row.durationSeconds / totalSeconds) * 100) : 0;
    lines.push(`| ${escapeMarkdown(row.key)} | ${formatDuration(row.durationSeconds)} | ${percent}% | ${row.visits} |`);
  }
  return lines.join("\n");
}

function categoryMarkdownTable(rows, totalSeconds) {
  if (!rows.length) return "暂无分类记录。";
  const lines = ["| 分类 | 耗时 | 占比 | 记录次数 |", "| --- | ---: | ---: | ---: |"];
  for (const row of rows) {
    const percent = totalSeconds > 0 ? Math.round((row.durationSeconds / totalSeconds) * 100) : 0;
    lines.push(`| ${escapeMarkdown(row.key)} | ${formatDuration(row.durationSeconds)} | ${percent}% | ${row.visits} |`);
  }
  return lines.join("\n");
}

function buildMarkdownReport(sessions, dateKey) {
  const week = getWeekRange(dateKey);
  const month = getMonthRange(dateKey);
  const sections = [
    { title: `日报 ${dateKey}`, summary: summarizeRange(sessions, dateKey, dateKey) },
    { title: `周报 ${week.start} 至 ${week.end}`, summary: summarizeRange(sessions, week.start, week.end) },
    { title: `月报 ${month.start} 至 ${month.end}`, summary: summarizeRange(sessions, month.start, month.end) }
  ];

  return [
    `# 网页时间报告`,
    ``,
    `生成时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    ``,
    ...sections.flatMap((section) => renderMarkdownSection(section.title, section.summary))
  ].join("\n");
}

function renderMarkdownSection(title, summary) {
  const rows = summary.byDomain.slice(0, 12);
  const categoryRows = summary.byCategory;
  return [
    `## ${title}`,
    ``,
    `总时长：**${formatDuration(summary.totalSeconds)}**`,
    ``,
    `### 分类汇总`,
    ``,
    categoryMarkdownTable(categoryRows, summary.totalSeconds),
    ``,
    `### 网站耗时`,
    ``,
    renderDonutSvg(rows, summary.totalSeconds),
    ``,
    markdownTable(rows, summary.totalSeconds),
    ``
  ];
}

function renderDonutSvg(rows, totalSeconds) {
  if (!rows.length || totalSeconds <= 0) return "_暂无可绘制的环形图。_";
  const colors = [
    "#ef9b72",
    "#f0c66e",
    "#79c98c",
    "#78a8d8",
    "#d99bc9",
    "#b59ae0",
    "#dfa86a",
    "#6fc7bd",
    "#f08f9d",
    "#93b76d",
    "#88a0e0",
    "#d4a66f",
    "#9dc7a6",
    "#c58dd6",
    "#e7b85f",
    "#71b3df"
  ];
  const visibleRows = [...rows];
  let otherSeconds = 0;
  const otherLimitSeconds = totalSeconds * 0.05;
  while (visibleRows.length > 1) {
    const candidate = visibleRows[visibleRows.length - 1];
    if (otherSeconds + candidate.durationSeconds > otherLimitSeconds) break;
    otherSeconds += candidate.durationSeconds;
    visibleRows.pop();
  }
  const chartRows = otherSeconds > 0
    ? [...visibleRows, { key: "其他", durationSeconds: otherSeconds }]
    : visibleRows;
  let cursor = 0;
  const paths = chartRows.map((row, index) => {
    const start = cursor;
    const end = cursor + (row.durationSeconds / totalSeconds) * 360;
    cursor = end;
    return `<path d="${donutPath(120, 120, 72, 108, start, end)}" fill="${colors[index] || "#eadfce"}" />`;
  });
  if (cursor < 360) {
    paths.push(`<path d="${donutPath(120, 120, 72, 108, cursor, 360)}" fill="#eadfce" />`);
  }

  return [
    `<svg width="360" height="360" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="网站耗时环形图">`,
    `<rect width="240" height="240" rx="28" fill="#fff8e8" />`,
    ...paths,
    `<circle cx="120" cy="120" r="68" fill="#fffdf8" />`,
    `<text x="120" y="114" text-anchor="middle" font-size="18" font-weight="700" fill="#563b2f">${escapeXml(formatDuration(totalSeconds))}</text>`,
    `<text x="120" y="138" text-anchor="middle" font-size="10" fill="#9b938c">总时长</text>`,
    `</svg>`
  ].join("\n");
}

function donutPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${startOuter.x.toFixed(3)} ${startOuter.y.toFixed(3)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${endOuter.x.toFixed(3)} ${endOuter.y.toFixed(3)}`,
    `L ${startInner.x.toFixed(3)} ${startInner.y.toFixed(3)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${endInner.x.toFixed(3)} ${endInner.y.toFixed(3)}`,
    "Z"
  ].join(" ");
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians)
  };
}

function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${serverPort}`);
  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    const type = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
    res.writeHead(200, { "content-type": `${type}; charset=utf-8` });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port);
  });
}

async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await isPortAvailable(port))) port += 1;
  return port;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${serverPort}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    res.end();
    return;
  }
  if (url.pathname === "/api/state") {
    const date = url.searchParams.get("date") || todayKey();
    const view = url.searchParams.get("view") || "day";
    const range = getViewRange(date, view);
    sendJson(res, {
      running: state.running,
      idle: state.idle,
      idleSeconds: state.idleSeconds,
      settings: state.settings,
      current: state.current,
      lastSample: state.lastSample,
      unknownCategoryTarget: unknownCategoryTarget(),
      lastError: state.lastError,
      date,
      view,
      range,
      summary: summarizeRange(state.sessions, range.start, range.end)
    });
    return;
  }
  if (url.pathname === "/api/category-target" && req.method === "GET") {
    sendJson(res, { target: unknownCategoryTarget() });
    return;
  }
  if (url.pathname === "/api/settings") {
    if (req.method === "GET") {
      sendJson(res, state.settings);
      return;
    }
    if (req.method === "POST") {
      try {
        const body = await readJsonBody(req);
        state.settings = normalizeSettings(body);
        await saveSettings();
        sendJson(res, state.settings);
      } catch (error) {
        sendJson(res, { error: error.message }, 400);
      }
      return;
    }
  }
  if (url.pathname === "/api/category-rule" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const type = body?.type === "app" ? "app" : "domain";
      const pattern = String(body?.pattern ?? "").trim().toLowerCase();
      const category = state.settings.categories.includes(body?.category) && body.category !== "未分类"
        ? body.category
        : "其他";
      if (!pattern) throw new Error("Missing pattern");
      state.settings.categoryRules = normalizeCategoryRules([
        { type, pattern, category },
        ...state.settings.categoryRules.filter((rule) => !(rule.type === type && rule.pattern === pattern))
      ], state.settings.categories);
      if (
        state.pendingCategoryTarget?.type === type
        && state.pendingCategoryTarget?.key === pattern
      ) {
        state.pendingCategoryTarget = null;
      }
      await saveSettings();
      sendJson(res, state.settings);
    } catch (error) {
      sendJson(res, { error: error.message }, 400);
    }
    return;
  }
  if (url.pathname === "/api/toggle" && req.method === "POST") {
    state.running = !state.running;
    if (!state.running) closeCurrent(new Date(Date.now() + IDLE_CLOSE_MS + 1));
    sendJson(res, { running: state.running });
    return;
  }
  if (url.pathname === "/api/export.md") {
    const date = url.searchParams.get("date") || todayKey();
    const markdown = buildMarkdownReport(state.sessions, date);
    res.writeHead(200, {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename=web-time-report-${date}.md`
    });
    res.end(markdown);
    return;
  }
  if (url.pathname === "/api/export.csv") {
    const lines = [
      "started_at,ended_at,duration_seconds,type,app,domain,title,url",
      ...state.sessions.map((s) => [s.startedAt, s.endedAt, s.durationSeconds, s.type, s.app, s.domain, s.title, s.url].map(csvCell).join(","))
    ];
    res.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=activity.csv"
    });
    res.end(lines.join("\n"));
    return;
  }
  await serveStatic(req, res);
});

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

await ensureStore();

let sampling = false;
async function sampleOnce() {
  if (!state.running || sampling) return;
  sampling = true;
  try {
    await sampleActivity();
  } finally {
    sampling = false;
  }
}

setInterval(sampleOnce, SAMPLE_MS);
await sampleOnce();

let serverPort = await findAvailablePort(START_PORT);
server.listen(serverPort, () => {
  console.log(`Website time tracker running at http://localhost:${serverPort}`);
  console.log(`Data file: ${DB_FILE}`);
});
