"use strict";

const PROVIDERS = {
  google: ["https://accounts.google.com", "https://www.google.com", "https://google.com", "https://myaccount.google.com", "https://mail.google.com", "https://www.youtube.com", "https://youtube.com"],
  microsoft: ["https://login.microsoftonline.com", "https://microsoftonline.com", "https://login.live.com", "https://live.com", "https://account.microsoft.com", "https://microsoft.com", "https://www.office.com", "https://office.com", "https://outlook.live.com", "https://outlook.com", "https://www.office365.com", "https://office365.com"]
};
const PROVIDER_DOMAINS = {
  google: ["google.com", "youtube.com"],
  microsoft: ["microsoft.com", "microsoftonline.com", "live.com", "office.com", "outlook.com", "office365.com"]
};
const $ = id => document.getElementById(id);
let activeOrigin = null;
let confirmedSelection = null;

function originFromUrl(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function activeHostname() {
  if (!activeOrigin) return null;
  return new URL(activeOrigin).hostname;
}

function populateCustomDomains() {
  const host = activeHostname();
  if (!host || $("customDomains").value.trim()) return;
  $("customDomains").value = `${host}\n*.${host}`;
}

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    activeOrigin = originFromUrl(tab?.url);
  } catch {
    activeOrigin = null;
  }
  $("targetLabel").textContent = activeOrigin || "Open an HTTP(S) site first";
  if (!activeOrigin) {
    $("target").checked = false;
    $("target").disabled = true;
  }
  populateCustomDomains();
}

function selection() {
  const custom = parseCustomDomains($("customDomains").value);
  return {
    google: $("google").checked,
    microsoft: $("microsoft").checked,
    target: $("target").checked && !!activeOrigin,
    storage: $("storage").checked,
    custom
  };
}

function selectedOrigins(choice) {
  return [...new Set([
    ...(choice.google ? PROVIDERS.google : []),
    ...(choice.microsoft ? PROVIDERS.microsoft : []),
    ...(choice.target ? [activeOrigin] : []),
    ...choice.custom.origins
  ])];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeHost(value) {
  return value.toLowerCase().replace(/^\.+|\.+$/g, "");
}

function parseCustomDomains(value) {
  const entries = value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
  const exactHosts = [];
  const wildcardDomains = [];
  const invalid = [];

  for (const entry of entries) {
    let token = entry;
    let host = "";
    let wildcard = false;

    try {
      const url = new URL(token.includes("://") ? token : `https://${token}`);
      host = url.hostname;
      wildcard = token.startsWith("*.");
    } catch {
      invalid.push(entry);
      continue;
    }

    if (host.startsWith("*.")) {
      wildcard = true;
      host = host.slice(2);
    }
    host = normalizeHost(host);
    if (!host || host === "*" || host.includes("*") || !host.includes(".")) {
      invalid.push(entry);
      continue;
    }
    if (wildcard) wildcardDomains.push(host);
    else exactHosts.push(host);
  }

  const origins = unique(exactHosts.flatMap(host => [`https://${host}`, `http://${host}`]));
  const domains = unique([...exactHosts, ...wildcardDomains]);
  const permissionPatterns = unique([
    ...exactHosts.flatMap(host => [`https://${host}/*`, `http://${host}/*`]),
    ...wildcardDomains.flatMap(host => [`https://*.${host}/*`, `http://*.${host}/*`, `https://${host}/*`, `http://${host}/*`])
  ]);
  return {exactHosts: unique(exactHosts), wildcardDomains: unique(wildcardDomains), origins, domains, permissionPatterns, invalid};
}

function setStatus(message, lines) {
  $("statusPanel").classList.remove("hidden");
  $("status").textContent = message;
  $("details").replaceChildren();
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    $("details").append(li);
  }
}

function review() {
  const choice = selection();
  const origins = selectedOrigins(choice);
  if (!origins.length && !choice.custom.domains.length) {
    setStatus("Nothing selected.", ["Choose a provider or the current target first."]);
    return;
  }
  confirmedSelection = {choice, origins};
  const customLabels = [
    ...choice.custom.exactHosts,
    ...choice.custom.wildcardDomains.map(domain => `*.${domain}`)
  ];
  $("scope").textContent = [
    `Groups: ${[choice.google && "Google", choice.microsoft && "Microsoft", choice.target && "Current site"].filter(Boolean).join(", ") || "None"}`,
    customLabels.length ? `Additional domains: ${customLabels.join(", ")}` : "",
    `Origins: ${origins.join(", ")}`,
    `Data: cookies${choice.storage ? ", local storage, IndexedDB, Cache Storage, service workers, file systems" : " only"}`,
    choice.custom.invalid.length ? `Ignored invalid entries: ${choice.custom.invalid.join(", ")}` : "",
    choice.custom.wildcardDomains.length && choice.storage ? "Wildcard entries clear matching cookies; site storage can only be cleared for exact origins Chrome can target." : "",
    "All dates; normal and installed-web-app site data. No browsing history or passwords."
  ].filter(Boolean).join("\n\n");
  $("confirmation").classList.remove("hidden");
  $("statusPanel").classList.add("hidden");
}

function domainMatches(host, domain) {
  return host === domain || host.endsWith(`.${domain}`);
}

async function cookieCounts(domains) {
  const results = [];
  for (const domain of domains) {
    try {
      const list = await chrome.cookies.getAll({domain});
      const matching = list.filter(cookie => domainMatches(cookie.domain.replace(/^\./, ""), domain));
      results.push({domain, count: matching.length});
    } catch (error) {
      results.push({domain, error: String(error)});
    }
  }
  return results;
}

function cookieUrl(cookie) {
  const host = cookie.domain.replace(/^\./, "");
  const scheme = cookie.secure ? "https" : "http";
  return `${scheme}://${host}${cookie.path || "/"}`;
}

async function removeDomainCookies(domains) {
  let removed = 0;
  const errors = [];
  for (const domain of domains) {
    try {
      const list = await chrome.cookies.getAll({domain});
      const matching = list.filter(cookie => domainMatches(cookie.domain.replace(/^\./, ""), domain));
      for (const cookie of matching) {
        try {
          const details = {url: cookieUrl(cookie), name: cookie.name};
          if (cookie.storeId) details.storeId = cookie.storeId;
          await chrome.cookies.remove(details);
          removed += 1;
        } catch (error) {
          errors.push(`${domain}: ${String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`${domain}: ${String(error)}`);
    }
  }
  return {removed, errors};
}

async function clean() {
  if (!confirmedSelection) return;
  const {choice, origins} = confirmedSelection;
  $("confirm").disabled = true;
  $("cancel").disabled = true;
  $("review").disabled = true;
  setStatus("Working...", ["Requesting site cookie-inspection permission where needed."]);
  let targetPermission = false;
  let customPermission = false;
  let permissionError = null;
  const targetPattern = choice.target ? `${activeOrigin}/*` : null;
  try {
    if (targetPattern) {
      targetPermission = await chrome.permissions.request({origins: [targetPattern]});
    }
    if (choice.custom.permissionPatterns.length) {
      customPermission = await chrome.permissions.request({origins: choice.custom.permissionPatterns});
    }
  } catch (error) {
    permissionError = String(error);
  }
  const domains = [...new Set([
    ...(choice.google ? PROVIDER_DOMAINS.google : []),
    ...(choice.microsoft ? PROVIDER_DOMAINS.microsoft : []),
    ...(choice.target && targetPermission ? [new URL(activeOrigin).hostname] : []),
    ...(customPermission ? choice.custom.domains : [])
  ])];
  try {
    const flags = {cookies: true};
    if (choice.storage) Object.assign(flags, {localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true, fileSystems: true});
    if (origins.length) {
      await chrome.browsingData.remove({origins, since: 0, originTypes: {unprotectedWeb: true, protectedWeb: true}}, flags);
    }
    const customCookieResult = customPermission ? await removeDomainCookies(choice.custom.domains) : {removed: 0, errors: []};
    const counts = await cookieCounts(domains);
    const remaining = counts.filter(result => result.count > 0);
    const failed = counts.filter(result => result.error);
    const lines = [
      `Chrome completed the selected local-data deletion for ${origins.length} origin(s).`,
      customCookieResult.removed ? `Removed ${customCookieResult.removed} custom-domain cookie(s).` : "",
      ...customCookieResult.errors.map(error => `Custom cookie removal issue: ${error}`),
      ...counts.map(item => item.error ? `${item.domain}: cookie check unavailable` : `${item.domain}: ${item.count} accessible cookie(s) remaining`),
      choice.storage ? "Site-storage removal completed by Chrome; storage was not independently enumerated." : "Site storage was not selected.",
      choice.target && !targetPermission ? "Site cookie inspection permission was not granted; site cleanup still ran." : "",
      choice.custom.domains.length && !customPermission ? "Custom-domain permission was not granted; custom-domain cookies were not inspected or removed." : "",
      permissionError ? `Permission request issue: ${permissionError}` : "",
      "This does NOT verify server-side logout, token revocation, other devices, or cookies outside inspected domains/stores. Reload the affected tabs before testing."
    ].filter(Boolean);
    setStatus(remaining.length || failed.length ? "Local cleanup completed; verification incomplete." : "Local cleanup completed; no accessible cookies found in inspected domains.", lines);
  } catch (error) {
    setStatus("Cleanup failed or was incomplete.", [String(error), "Do not assume local data was cleared. Retry or inspect Chrome site settings."]);
  } finally {
    confirmedSelection = null;
    $("confirmation").classList.add("hidden");
    $("confirm").disabled = false;
    $("cancel").disabled = false;
    $("review").disabled = false;
  }
}

$("review").addEventListener("click", review);
$("cancel").addEventListener("click", () => {confirmedSelection = null; $("confirmation").classList.add("hidden");});
$("confirm").addEventListener("click", clean);
for (const id of ["google", "microsoft", "target", "storage", "customDomains"]) {
  $(id).addEventListener("change", () => {confirmedSelection = null; $("confirmation").classList.add("hidden");});
}
$("customDomains").addEventListener("input", () => {confirmedSelection = null; $("confirmation").classList.add("hidden");});
initialize();
