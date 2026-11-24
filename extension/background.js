import { identifyProblem, problemFromUrl, problemKey, submitUrl } from "./codeforces.js";

const bundledCompiler = chrome.runtime.getURL("web/index.html");
const hostedCompiler = "https://skillissuescompiler.vercel.app/";
const openingTabs = new Map();
const loadingTabs = new Map();
const pendingKey = (tabId) => "submission:" + tabId;
const maxText = 256 * 1024;
const isText = (value, limit) => typeof value === "string" && value.length <= limit;

async function openCompiler(path, windowId, active, bundled = false) {
  const url = new URL(bundled ? bundledCompiler : hostedCompiler);
  if (!bundled) url.searchParams.set("cp", "1");
  if (path) url.searchParams.set("problem", path);
  const key = windowId + ":" + url.href;
  if (!openingTabs.has(key)) {
    const opening = (async () => {
      if (bundled) {
        const [existing] = await chrome.runtime.getContexts({
          contextTypes: ["TAB"], documentUrls: [url.href], windowIds: [windowId],
        });
        if (existing) return existing.tabId;
      } else {
        const tabs = await chrome.tabs.query({ windowId, url: hostedCompiler + "*" });
        const existing = tabs.find((tab) => tab.url === url.href || tab.pendingUrl === url.href);
        if (existing) return existing.id;
      }
      if (loadingTabs.has(key)) return loadingTabs.get(key);
      const tab = await chrome.tabs.create({ url: url.href, windowId, active });
      if (tab.status === "loading") loadingTabs.set(key, tab.id);
      return tab.id;
    })().finally(() => openingTabs.delete(key));
    openingTabs.set(key, opening);
  }
  const tabId = await openingTabs.get(key);
  if (active) await chrome.tabs.update(tabId, { active: true });
}

chrome.action.onClicked.addListener(async (tab) => {
  const opened = await chrome.tabs.sendMessage(tab.id, { type: "open-compiler" }).catch(() => false);
  if (opened) return;
  const entries = await chrome.storage.local.get(null);
  const latest = Object.values(entries).filter((entry) => entry?.path)
    .sort((left, right) => right.updated - left.updated)[0];
  await openCompiler(latest?.path, tab.windowId, true);
});
function stopTracking(tabId) {
  for (const [key, loadingId] of loadingTabs) {
    if (loadingId === tabId) loadingTabs.delete(key);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changes) => {
  if (changes.status === "complete") stopTracking(tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  stopTracking(tabId);
  chrome.storage.session.remove(pendingKey(tabId)).catch(() => {});
});

async function importProblem(message, sender) {
  const problem = problemFromUrl(sender.url);
  if (!problem || sender.frameId !== 0 || !sender.tab) throw new Error("Open a Codeforces problem first.");
  const { title, timeLimit, memoryLimit, samples, interactive } = message;
  if (!isText(title, 400) || !title.trim() || !isText(timeLimit, 80) || !isText(memoryLimit, 80)
    || !Array.isArray(samples) || samples.length > 100
    || samples.some((sample) => !isText(sample?.input, maxText) || !isText(sample?.output, maxText))
    || samples.reduce((total, sample) => total + sample.input.length + sample.output.length, 0) > 2 * maxText) {
    throw new Error("The problem samples exceed the import limits.");
  }
  const entry = { ...problem, title, timeLimit, memoryLimit, samples, interactive: interactive === true, updated: Date.now() };
  await chrome.storage.local.set({ [problemKey(problem.path)]: entry });
  if (message.open === "focus" || (message.open === "background" && sender.tab.active)) {
    await openCompiler(problem.path, sender.tab.windowId, message.open === "focus");
  }
}

async function stageSubmission(message, sender) {
  const compiler = compilerPage(sender);
  if (!compiler) {
    throw new Error("Open Skill Issues Compiler to submit.");
  }
  const problem = identifyProblem(message.path);
  if (!problem || compiler.searchParams.get("problem") !== problem.path
    || !isText(message.source, 65536) || !message.source.trim()) {
    throw new Error("Open an imported problem and enter a Python solution.");
  }
  const key = problemKey(problem.path);
  if (!(await chrome.storage.local.get(key))[key]) throw new Error("Import this problem again before submitting.");

  const tab = await chrome.tabs.create({ url: "about:blank" });
  const tabKey = pendingKey(tab.id);
  try {
    await chrome.storage.session.set({
      [tabKey]: { source: message.source, problem, expires: Date.now() + 10 * 60 * 1000 },
    });
    await chrome.tabs.update(tab.id, { url: submitUrl(problem) });
  } catch (error) {
    await chrome.storage.session.remove(tabKey);
    await chrome.tabs.remove(tab.id).catch(() => {});
    throw error;
  }
}

function compilerPage(sender) {
  if (sender.frameId !== 0 || !sender.tab || !sender.url) return null;
  const url = new URL(sender.url);
  const page = url.href.split(/[?#]/, 1)[0];
  if (page === bundledCompiler || (page === hostedCompiler && url.searchParams.get("cp") === "1")) return url;
  return null;
}

async function compilerState(sender) {
  const current = compilerPage(sender);
  if (!current) throw new Error("Open the Skill Issues workspace to connect the extension.");
  const path = current.searchParams.get("problem");
  const entries = await chrome.storage.local.get(null);
  const problems = Object.entries(entries)
    .filter(([key]) => key.startsWith("problem:"))
    .map(([, entry]) => ({ path: entry.path, title: entry.title, updated: entry.updated }))
    .sort((left, right) => right.updated - left.updated);
  return { problems, selected: entries[problemKey(path)] ?? null };
}

async function openBundledCompiler(sender) {
  const current = compilerPage(sender);
  if (!current) throw new Error("Open the Skill Issues workspace first.");
  const problem = identifyProblem(current.searchParams.get("problem"));
  await openCompiler(problem?.path, sender.tab.windowId, true, true);
}

async function getSubmission(sender) {
  if (!sender.tab || sender.frameId !== 0) return null;
  const key = pendingKey(sender.tab.id);
  const pending = (await chrome.storage.session.get(key))[key];
  if (!pending) return null;
  if (pending.expires < Date.now()) {
    await chrome.storage.session.remove(key);
    return null;
  }
  const url = new URL(sender.url);
  return url.origin + url.pathname.replace(/\/$/, "") === submitUrl(pending.problem) ? pending : null;
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!["import-problem", "stage-submission", "get-submission", "compiler-state", "open-bundled-compiler"].includes(message?.type)) return;
  const handle = async () => {
    switch (message.type) {
      case "import-problem": return importProblem(message, sender);
      case "stage-submission": return stageSubmission(message, sender);
      case "get-submission": return getSubmission(sender);
      case "compiler-state": return compilerState(sender);
      case "open-bundled-compiler": return openBundledCompiler(sender);
    }
  };
  handle().then((data) => respond({ ok: true, data }), (error) => respond({ ok: false, error: error.message }));
  return true;
});
