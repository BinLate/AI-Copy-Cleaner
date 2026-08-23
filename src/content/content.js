/** AI Copy Cleaner - isolated world copy handler */
(() => {
  'use strict';
  let enabled = true;

  try {
    chrome.storage.sync.get({ autoCleanEnabled: true }, (items) => {
      if (!chrome.runtime.lastError) {
        enabled = items.autoCleanEnabled !== false;
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.autoCleanEnabled) {
        enabled = changes.autoCleanEnabled.newValue !== false;
      }
    });
  } catch (_) {}

  function recordCleanAction() {
    try {
      chrome.storage.local.get({ aicc_clean_count: 0 }, (res) => {
        const next = (res.aicc_clean_count || 0) + 1;
        chrome.storage.local.set({ aicc_clean_count: next });
      });
    } catch (_) {}
    showToast('✨ Đã làm sạch HTML khi copy');
  }

  document.addEventListener('copy', (event) => {
    if (!enabled || typeof cleanAIHtml !== 'function') return;
    let rawHtml = '';
    if (event.clipboardData) rawHtml = event.clipboardData.getData('text/html');
    if (!rawHtml && window.getSelection) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount) {
        const container = document.createElement('div');
        for (let i = 0; i < selection.rangeCount; i++) container.appendChild(selection.getRangeAt(i).cloneContents());
        rawHtml = container.innerHTML;
      }
    }
    if (!rawHtml) return;
    const cleaned = cleanAIHtml(rawHtml);
    if (!cleaned || !event.clipboardData) return;
    event.preventDefault();
    event.clipboardData.setData('text/html', cleaned);
    const plain = window.getSelection?.().toString() || event.clipboardData.getData('text/plain') || '';
    if (plain) event.clipboardData.setData('text/plain', plain);
    recordCleanAction();
  }, true);

  function showToast(text) {
    let toast = document.getElementById('ai-copy-cleaner-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ai-copy-cleaner-toast';
      toast.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;background:#064e3b;color:#ecfdf5;border:1px solid #18a15f;border-radius:10px;padding:10px 15px;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22);opacity:0;transition:opacity .2s;pointer-events:none';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(window.__aiccToastTimer);
    window.__aiccToastTimer = setTimeout(() => toast.style.opacity = '0', 1800);
  }
})();
