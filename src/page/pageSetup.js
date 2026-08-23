(() => {
  'use strict';

  const OPT_KEY = 'aicc_optimizer_settings';
  const CONFIG_KEY = 'aicc_fixlag_config';

  function writeFixlagConfig(opt = {}) {
    const messageLimit = Number.parseInt(opt.messageLimit, 10);
    const payload = JSON.stringify({
      enabled: opt.enabled !== false,
      messageLimit: Number.isFinite(messageLimit) ? Math.max(1, Math.min(200, messageLimit)) : 15
    });
    try {
      localStorage.setItem(CONFIG_KEY, payload);
      document.documentElement.dataset.aiccFixlagConfig = payload;
    } catch (_) {}
  }

  try {
    const existing = localStorage.getItem(CONFIG_KEY);
    if (existing) document.documentElement.dataset.aiccFixlagConfig = existing;
  } catch (_) {}

  try {
    chrome.storage.local.get({ [OPT_KEY]: { enabled: true, messageLimit: 15, loadStep: 5 } }, (result) => {
      writeFixlagConfig(result[OPT_KEY] || {});
    });
  } catch (_) {}

  try {
    document.documentElement.dataset.csbExtensionUrl = chrome.runtime.getURL('');
    document.documentElement.dataset.csbExtensionId = chrome.runtime.id;
  } catch (_) {}

  async function hashWasmLoader() {
    try {
      const url = chrome.runtime.getURL('src/page/wasmLoader.js');
      const text = await (await fetch(url)).text();
      let hash = 2166136261;
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        hash ^= code & 255;
        hash = Math.imul(hash, 16777619) >>> 0;
        hash ^= code >> 8;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      document.documentElement.dataset.csbFh = (hash >>> 0).toString(16).padStart(8, '0');
    } catch (_) {}
  }

  hashWasmLoader();

  try {
    if (sessionStorage.getItem('aicc_fixlag_navigating') !== '1') {
      localStorage.removeItem('aicc_fixlag_extra');
    } else {
      sessionStorage.removeItem('aicc_fixlag_navigating');
    }
  } catch (_) {}
})();
