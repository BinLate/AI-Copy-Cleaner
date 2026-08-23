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
