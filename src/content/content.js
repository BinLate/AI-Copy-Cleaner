/** AI Copy Cleaner - isolated world copy handler & controlled MAIN-world hook requester */
(() => {
  'use strict';
  // Safe startup: uninitialized/unresolved state defaults to pass-through (disabled)
  let enabled = false;
  let stateResolved = false;

  // B002: track attempts so a failed injection can be retried a bounded number of times
  let mainWorldAttempts = 0;
  const MAX_MAIN_WORLD_ATTEMPTS = 3;

  function requestMainWorldHooks(retryDelayMs) {
    if (typeof window === 'undefined' || window.__aiccMainWorldInjected) return;
    if (mainWorldAttempts >= MAX_MAIN_WORLD_ATTEMPTS) return;
    mainWorldAttempts++;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({ action: 'inject_main_world' }, (resp) => {
          // Reading lastError is required to avoid unchecked-error warnings
          const err = chrome.runtime.lastError;
          if (err || !resp || resp.ok !== true) {
            // Injection NOT confirmed: leave marker unset and schedule one
            // bounded retry to cover transient background/service-worker races.
            if (mainWorldAttempts < MAX_MAIN_WORLD_ATTEMPTS) {
              setTimeout(() => {
                try { requestMainWorldHooks(retryDelayMs); } catch (_) {}
              }, typeof retryDelayMs === 'number' ? retryDelayMs : 1500);
            }
            return;
          }
          // Confirmed success only now
          window.__aiccMainWorldInjected = true;
        });
      }
    } catch (_) {}
  }

  try {
    // B001: storage.sync is the single authoritative source of truth (the
    // popup loads from sync and saves to both areas). storage.local is only
    // consulted when the sync read itself fails or the key is genuinely
    // absent - never raced against it. Any unresolved/failed read keeps the
    // safe pass-through default (disabled).
    const applyResolvedValue = (value) => {
      enabled = value !== false;
      stateResolved = true;
      if (enabled) requestMainWorldHooks();
    };
    chrome.storage.sync.get(null, (items) => {
      if (chrome.runtime.lastError || !items) {
        // Sync operation failed -> fall back to local
        chrome.storage.local.get(null, (litems) => {
          if (chrome.runtime.lastError || !litems || litems.autoCleanEnabled === undefined) {
            // Both reads unusable -> stay pass-through (disabled)
            stateResolved = true;
            enabled = false;
            return;
          }
          applyResolvedValue(litems.autoCleanEnabled);
        });
        return;
      }
      if (items.autoCleanEnabled !== undefined) {
        applyResolvedValue(items.autoCleanEnabled);
        return;
      }
      // Key genuinely absent in sync -> consult local once
      chrome.storage.local.get(null, (litems) => {
        if (chrome.runtime.lastError || !litems) {
          applyResolvedValue(true); // fresh-install default (ON)
          return;
        }
        applyResolvedValue(litems.autoCleanEnabled === undefined ? true : litems.autoCleanEnabled);
      });
    });
    // Only react to the authoritative sync area to avoid duplicate reloads
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.autoCleanEnabled && stateResolved) {
        const nextVal = changes.autoCleanEnabled.newValue !== false;
        if (nextVal !== enabled) {
          try {
            window.location.reload();
          } catch (_) {}
        }
      }
    });
  } catch (_) {}

  function recordCleanAction() {
    if (!stateResolved || !enabled) return;
    try {
      chrome.storage.local.get({ aicc_clean_count: 0 }, (res) => {
        const next = (res.aicc_clean_count || 0) + 1;
        chrome.storage.local.set({ aicc_clean_count: next });
      });
    } catch (_) {}
    showToast('✨ Đã làm sạch HTML khi copy');
  }

  document.addEventListener('copy', (event) => {
    // Fail safe: if settings are not resolved yet or disabled, do not intercept
    if (!stateResolved || !enabled || typeof cleanAIHtml !== 'function') return;
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
