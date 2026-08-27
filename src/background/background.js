'use strict';

const OPT_KEY = 'aicc_optimizer_settings';
const DEFAULT_OPT = { enabled: true, messageLimit: 15, loadStep: 5 };

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({ [OPT_KEY]: DEFAULT_OPT, aicc_clean_count: 0 }, (result) => {
    if (!result[OPT_KEY]) {
      chrome.storage.local.set({ [OPT_KEY]: DEFAULT_OPT });
    }
    if (typeof result.aicc_clean_count !== 'number') {
      chrome.storage.local.set({ aicc_clean_count: 0 });
    }
  });

  chrome.storage.sync.get({ autoCleanEnabled: true }, (result) => {
    if (typeof result.autoCleanEnabled !== 'boolean') {
      chrome.storage.sync.set({ autoCleanEnabled: true });
    }
  });
});

// Controlled MAIN-world script injection via chrome.scripting API (tamper-resistant, unexposed to webpages)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'inject_main_world' && sender && sender.tab && typeof sender.tab.id === 'number') {
    // B002: report the REAL result - never claim success before injection completes
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function') {
      sendResponse({ ok: false, error: 'scripting_unavailable' });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId || 0] },
      world: 'MAIN',
      files: ['src/utils/sanitizer.js', 'src/content/inject.js']
    }).then(() => {
      sendResponse({ ok: true });
    }).catch((err) => {
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    });
    // Keep the message channel open for the asynchronous sendResponse above
    return true;
  }
});
