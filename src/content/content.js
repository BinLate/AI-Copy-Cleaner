/** AI Copy Cleaner - isolated world copy handler & UI toast */
(() => {
  'use strict';
  let enabled = true;

  function updateEnabled(val) {
    enabled = val !== false;
    try {
      window.dispatchEvent(new CustomEvent('__aicc_clean_state_update__', { detail: { enabled } }));
    } catch (_) {}
  }

  try {
    chrome.storage.sync.get({ autoCleanEnabled: true }, (items) => {
      if (!chrome.runtime.lastError && items) {
        updateEnabled(items.autoCleanEnabled);
      }
    });
    chrome.storage.local.get({ autoCleanEnabled: true }, (items) => {
      if (!chrome.runtime.lastError && items && items.autoCleanEnabled !== undefined) {
        updateEnabled(items.autoCleanEnabled);
      }
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.autoCleanEnabled) {
        updateEnabled(changes.autoCleanEnabled.newValue);
      }
    });
  } catch (_) {}

  function recordCleanAction() {
    if (!enabled) return;
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
    if (event.clipboardData) {
      try {
        rawHtml = event.clipboardData.getData('text/html');
      } catch (_) {}
    }
    if (!rawHtml && window.getSelection) {
      try {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const container = document.createElement('div');
          for (let i = 0; i < selection.rangeCount; i++) {
            container.appendChild(selection.getRangeAt(i).cloneContents());
          }
          rawHtml = container.innerHTML;
        }
      } catch (_) {}
    }
    if (rawHtml) {
      const cleaned = cleanAIHtml(rawHtml);
      if (cleaned && event.clipboardData) {
        const isChanged = cleaned !== rawHtml;
        event.preventDefault();
        event.clipboardData.setData('text/html', cleaned);
        const plain = window.getSelection?.().toString() || event.clipboardData.getData('text/plain') || '';
        if (plain) event.clipboardData.setData('text/plain', plain);
        if (isChanged) {
          recordCleanAction();
        }
      }
    }
  }, true);

  function showToast(text) {
    let toast = document.getElementById('ai-copy-cleaner-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ai-copy-cleaner-toast';
      toast.style.cssText = [
        'position:fixed',
        'right:24px',
        'bottom:24px',
        'z-index:2147483647',
        'background:#064e3b',
        'color:#ecfdf5',
        'border:1px solid #10b981',
        'border-radius:10px',
        'padding:10px 16px',
        'font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'box-shadow:0 8px 24px rgba(0,0,0,0.3)',
        'opacity:0',
        'transform:translateY(10px)',
        'transition:opacity 0.25s ease, transform 0.25s ease',
        'pointer-events:none',
        'display:flex',
        'align-items:center',
        'gap:8px',
        'line-height:1.4'
      ].join(';');
      (document.body || document.documentElement).appendChild(toast);
    }
    toast.textContent = text;
    // Force layout reflow before triggering transition
    toast.getBoundingClientRect();
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    clearTimeout(window.__aiccToastTimer);
    window.__aiccToastTimer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
      }
    }, 2200);
  }
})();
