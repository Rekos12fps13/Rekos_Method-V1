const CHECK_URL = "https://Rekos 12fps-id-gate-backend.vercel.app/api/check-user";

const IDENTITY_KEY = "rekos12fpsTikTokIdentity";

const STATUS_KEY = "rekos12fpsTikTokGateStatus";

const RECHECK_ALARM = "rekos12fpsTikTokRecheck";

async function getStored(key) {
  const result = await chrome.storage.local.get([ key ]);
  return result[key] || null;
}

async function setStored(key, value) {
  await chrome.storage.local.set({
    [key]: value
  });
}

function broadcastStatus(status) {
  chrome.runtime.sendMessage({
    type: "RKS_TT_STATUS_UPDATE",
    status: status
  }).catch(() => {});
}

async function checkAgainstBackend(identity) {
  if (!identity || !identity.loggedIn) {
    const status = {
      loggedIn: false,
      allowed: true,
      blocked: false,
      checkedAt: Date.now()
    };
    await setStored(STATUS_KEY, status);
    broadcastStatus(status);
    return status;
  }
  const params = new URLSearchParams;
  if (identity.userId) params.set("userId", identity.userId);
  if (identity.username) params.set("username", identity.username);
  const controller = new AbortController;
  const timeoutId = setTimeout(() => controller.abort(), 6e3);
  let status;
  try {
    const res = await fetch(`${CHECK_URL}?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    status = {
      loggedIn: true,
      allowed: data.allowed !== false,
      blocked: data.blocked === true || data.allowed === false,
      message: typeof data.message === "string" ? data.message : undefined,
      checkedAt: Date.now()
    };
  } catch (err) {
    status = {
      loggedIn: true,
      allowed: true,
      blocked: false,
      checkedAt: Date.now()
    };
  } finally {
    clearTimeout(timeoutId);
  }
  await setStored(STATUS_KEY, status);
  broadcastStatus(status);
  return status;
}

async function handleIdentityReport(identity) {
  const enriched = {
    ...identity,
    updatedAt: Date.now()
  };
  await setStored(IDENTITY_KEY, enriched);
  return checkAgainstBackend(enriched);
}

async function requestFreshIdentity() {
  try {
    const tabs = await chrome.tabs.query({
      url: [ "*://*.tiktok.com/*" ]
    });
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, {
          type: "RKS_REQUEST_IDENTITY"
        }).catch(() => {});
      }
    }
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "RKS_TT_IDENTITY") {
    handleIdentityReport(message.identity || {});
    return;
  }
  if (message.type === "RKS_GET_STATUS") {
    (async () => {
      const [identity, status] = await Promise.all([ getStored(IDENTITY_KEY), getStored(STATUS_KEY) ]);
      sendResponse({
        identity: identity,
        status: status
      });
      requestFreshIdentity();
    })();
    return true;
  }
});

chrome.alarms.create(RECHECK_ALARM, {
  periodInMinutes: 10
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === RECHECK_ALARM) requestFreshIdentity();
});

chrome.runtime.onInstalled.addListener(() => requestFreshIdentity());

chrome.runtime.onStartup?.addListener(() => requestFreshIdentity());
