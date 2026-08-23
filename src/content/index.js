(() => {
  'use strict';

  const OPT_KEY = 'aicc_optimizer_settings';
  const CONFIG_KEY = 'aicc_fixlag_config';
  const EXTRA_KEY = 'aicc_fixlag_extra';
  const LAST_STATUS_KEY = 'aicc_fixlag_last_status';
  const SCROLL_KEY = 'aicc_fixlag_scroll_restore';
  const NAV_ATTR = 'data-aicc-navigation';
  const DEFAULTS = { enabled: true, messageLimit: 15, loadStep: 5 };

  let settings = { ...DEFAULTS };
  let status = null;
  let controls = null;
  let observer = null;
  let lastTurnCount = -1;
  let lastAppliedExtra = -1;
  let lastAppliedLimit = -1;
  let lastAppliedEnabled = true;

  function normalize(value = {}) {
    const limit = Number.parseInt(value.messageLimit, 10);
    const step = Number.parseInt(value.loadStep, 10);
    return {
      enabled: value.enabled !== false,
      messageLimit: Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : DEFAULTS.messageLimit,
      loadStep: Number.isFinite(step) ? Math.max(1, Math.min(50, step)) : DEFAULTS.loadStep
    };
  }

  function syncConfig() {
    try {
      const payload = JSON.stringify({ enabled: settings.enabled, messageLimit: settings.messageLimit });
      localStorage.setItem(CONFIG_KEY, payload);
      document.documentElement.dataset.aiccFixlagConfig = payload;
      window.dispatchEvent(new CustomEvent('aicc-fixlag-config'));
    } catch (_) {}
  }

  function extractConversationId(urlOrPath) {
    if (!urlOrPath) return null;
    try {
      const path = (urlOrPath.includes('://') ? new URL(urlOrPath, location.origin).pathname : urlOrPath).toLowerCase();
      const match = path.match(/(?:\/c\/|\/share\/|\/canvas\/c\/|\/conversation\/|\/shared_conversation\/)([^/?#]+)/i);
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function currentConversationId() {
    return extractConversationId(location.pathname);
  }

  function isSameConversation(url1, url2, convId1, convId2) {
    if (convId1 && convId2 && convId1.toLowerCase() === convId2.toLowerCase()) return true;
    const id1 = convId1 || extractConversationId(url1);
    const id2 = convId2 || extractConversationId(url2);
    if (id1 && id2 && id1.toLowerCase() === id2.toLowerCase()) return true;
    if (!url1 || !url2) return false;
    if (url1 === url2) return true;
    try {
      const p1 = new URL(url1, location.origin).pathname.replace(/\/+$/, '').toLowerCase();
      const p2 = new URL(url2, location.origin).pathname.replace(/\/+$/, '').toLowerCase();
      return p1 === p2;
    } catch (_) {
      return false;
    }
  }

  function getExtra() {
    try {
      const value = JSON.parse(localStorage.getItem(EXTRA_KEY) || 'null');
      if (!value) return 0;
      const curId = currentConversationId();
      if (value.conversationId && curId && value.conversationId.toLowerCase() === curId.toLowerCase()) {
        return Math.max(0, parseInt(value.extra, 10) || 0);
      }
      if (isSameConversation(value.url, location.href, value.conversationId, curId)) {
        return Math.max(0, parseInt(value.extra, 10) || 0);
      }
      return 0;
    } catch (_) {
      return 0;
    }
  }

  function setExtra(extra) {
    try {
      if (extra > 0) {
        localStorage.setItem(EXTRA_KEY, JSON.stringify({
          url: location.href,
          conversationId: currentConversationId(),
          extra
        }));
      } else {
        localStorage.removeItem(EXTRA_KEY);
      }
    } catch (_) {}
  }

  function getDomTurns() {
    const list = Array.from(document.querySelectorAll(
      'article[data-testid^="conversation-turn-"], div[data-turn-id-container]'
    ));
    if (list.length > 0) return list;

    const byRole = Array.from(document.querySelectorAll('[data-message-author-role]')).map((el) => {
      return el.closest('article') || el.closest('[data-testid^="conversation-turn-"]') || el;
    });
    return Array.from(new Set(byRole));
  }

  function firstTurnId() {
    const items = document.querySelectorAll('[data-turn-id-container], article[data-testid^="conversation-turn-"], [data-testid^="conversation-turn-"], [data-message-author-role]');
    for (const el of items) {
      const id = el.getAttribute('data-turn-id-container') || el.getAttribute('data-testid') || el.getAttribute('data-message-id');
      if (id) return id;
    }
    return null;
  }

  function saveScrollAnchor() {
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: location.href, conversationId: currentConversationId(), anchor: firstTurnId() }));
    } catch (_) {}
  }

  function restoreScrollAnchor() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null'); } catch (_) { return; }
    const curId = currentConversationId();
    if (!saved || !isSameConversation(saved.url, location.href, saved.conversationId, curId) || !saved.anchor) return;

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const safe = globalThis.CSS?.escape ? CSS.escape(saved.anchor) : saved.anchor.replace(/"/g, '\\"');
      const el = document.querySelector(`[data-turn-id-container="${safe}"]`) ||
                 document.querySelector(`[data-testid="${safe}"]`) ||
                 document.querySelector(`[data-message-id="${safe}"]`);
      if (el) {
        clearInterval(timer);
        try { sessionStorage.removeItem(SCROLL_KEY); } catch (_) {}
        requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      } else if (tries > 30) {
        clearInterval(timer);
      }
    }, 150);
  }

  function findMessagesContainer() {
    const turn = document.querySelector(
      'article[data-testid^="conversation-turn-"], div[data-turn-id-container], [data-message-author-role]'
    );
    if (turn?.parentElement) return turn.parentElement;
    const main = document.querySelector('main');
    if (main) {
      const scrollable = main.querySelector(
        'div[class*="react-scroll-to-bottom"], div[class*="overflow-y-auto"], div[class*="conversation-items"], div.flex-1.overflow-hidden'
      );
      if (scrollable) {
        const inner = scrollable.querySelector('div.flex.flex-col') || scrollable;
        return inner;
      }
      return main;
    }
    return null;
  }

  function isDark() {
    return document.documentElement.classList.contains('dark') || document.documentElement.style.colorScheme === 'dark';
  }

  function arrowIcon(direction = 'up') {
    const points = direction === 'up' ? '5 12 12 5 19 12' : '5 12 12 19 19 12';
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="${points}"/></svg>`;
  }

  function makeActionCard({ title, subtitle, meta, badge, direction = 'up', compact = false, onClick }) {
    const dark = isDark();
    const colors = dark ? {
      bg: '#343541', hover: '#40414f', text: '#ececf1', border: '#565869', hoverBorder: '#6b6c7b',
      sub: 'rgba(255,255,255,0.60)', meta: 'rgba(255,255,255,0.40)', badgeBg: 'rgba(255,255,255,0.10)',
      badgeBorder: 'rgba(255,255,255,0.20)', badgeText: '#d1d5db', shadow: '0 1px 3px rgba(0,0,0,0.30)'
    } : {
      bg: '#f7f7f8', hover: '#ececf1', text: '#2d333a', border: '#d1d5db', hoverBorder: '#b4b9c2',
      sub: '#6b7280', meta: '#9ca3af', badgeBg: 'rgba(0,0,0,0.04)', badgeBorder: 'rgba(0,0,0,0.12)',
      badgeText: '#4b5563', shadow: '0 1px 3px rgba(0,0,0,0.08)'
    };

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(NAV_ATTR, 'btn');
    button.style.cssText = [
      'display:flex','align-items:center','justify-content:space-between','width:min(500px,calc(100vw - 40px))',
      `padding:${compact ? '10px 14px' : '14px 16px'}`,'border-radius:12px','font-size:13px',`color:${colors.text}`,
      `background:${colors.bg}`,`border:1px solid ${colors.border}`,`box-shadow:${colors.shadow}`,'cursor:pointer',
      'transition:background 150ms ease,border-color 150ms ease','font-family:inherit','text-align:left','box-sizing:border-box'
    ].join(';');

    const badgeHtml = badge > 0 ? `<span style="background:${colors.badgeBg};border:1px solid ${colors.badgeBorder};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;color:${colors.badgeText};white-space:nowrap;flex-shrink:0;">${badge} ẩn</span>` : '';
    button.innerHTML = `
      <span style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
        <span style="color:${dark ? '#ececf1' : '#565869'};flex-shrink:0;display:flex;align-items:center;">${arrowIcon(direction)}</span>
        <span style="display:flex;flex-direction:column;gap:2px;text-align:left;min-width:0;">
          <span style="font-weight:700;font-size:13px;">${title}</span>
          ${subtitle ? `<span style="font-size:11px;color:${colors.sub};">${subtitle}</span>` : ''}
          ${meta ? `<span style="font-size:10px;color:${colors.meta};margin-top:1px;">${meta}</span>` : ''}
        </span>
      </span>
      ${badgeHtml}
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = colors.hover;
      button.style.borderColor = colors.hoverBorder;
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = colors.bg;
      button.style.borderColor = colors.border;
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function removeControls() {
    controls?.remove();
    controls = null;
    document.querySelectorAll(`[${NAV_ATTR}]`).forEach((el) => el.remove());
  }

  function withObserverSuspended(fn) {
    if (observer) observer.disconnect();
    try {
      fn();
    } finally {
      if (observer && document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }
  }

  function applyDomTrim() {
    withObserverSuspended(() => {
      const turns = getDomTurns();
      const extra = getExtra();

      if (!settings.enabled) {
        turns.forEach((turn) => {
          turn.style.removeProperty('display');
          turn.removeAttribute('data-aicc-hidden');
        });
        removeControls();
        lastTurnCount = turns.length;
        lastAppliedExtra = extra;
        lastAppliedLimit = settings.messageLimit;
        lastAppliedEnabled = false;
        return;
      }

      const totalTurns = turns.length;
      if (totalTurns === 0) {
        removeControls();
        lastTurnCount = 0;
        return;
      }

      const effectivePairs = settings.messageLimit + extra;
      const turnsToKeep = Math.max(1, effectivePairs * 2);
      const hiddenCount = Math.max(0, totalTurns - turnsToKeep);
      const hiddenPairs = Math.ceil(hiddenCount / 2);

      for (let i = 0; i < totalTurns; i++) {
        if (i < hiddenCount) {
          turns[i].style.setProperty('display', 'none', 'important');
          turns[i].setAttribute('data-aicc-hidden', 'true');
        } else {
          turns[i].style.removeProperty('display');
          turns[i].removeAttribute('data-aicc-hidden');
        }
      }

      lastTurnCount = totalTurns;
      lastAppliedExtra = extra;
      lastAppliedLimit = settings.messageLimit;
      lastAppliedEnabled = true;

      const hasOlder = hiddenCount > 0 || (status && status.hasOlderMessages);
      if (!hasOlder && extra <= 0) {
        removeControls();
        return;
      }

      const container = findMessagesContainer();
      if (!container) return;

      if (controls?.isConnected && controls.parentElement === container) {
        controls.remove();
        controls = null;
      }
      document.querySelectorAll(`[${NAV_ATTR}="top"]`).forEach((el) => el.remove());

      const wrapper = document.createElement('div');
      wrapper.setAttribute(NAV_ATTR, 'top');
      wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 0 4px;margin-bottom:10px;width:100%;box-sizing:border-box;';

      const loadStepPairs = Math.min(settings.loadStep, hiddenPairs || settings.loadStep);

      if (hasOlder) {
        wrapper.appendChild(makeActionCard({
          title: `Tải ${loadStepPairs} lượt hỏi–đáp trước đó`,
          subtitle: `Mỗi lượt gồm câu hỏi của bạn + câu trả lời của ChatGPT.`,
          meta: hiddenPairs > 0 ? `Còn ${hiddenPairs} lượt cũ đang được ẩn để giảm lag.` : 'Bấm để nạp thêm các lượt trò chuyện cũ.',
          badge: hiddenPairs,
          direction: 'up',
          onClick: () => {
            const nextExtra = extra + settings.loadStep;
            setExtra(nextExtra);
            if (hiddenCount > 0) {
              // Path A: Older turns already in DOM, reveal without reload
              applyDomTrim();
            } else if (status && status.hasOlderMessages) {
              // Path B: Older turns were trimmed upstream at network level, persist and reload
              saveScrollAnchor();
              try { sessionStorage.setItem('aicc_fixlag_navigating', '1'); } catch (_) {}
              location.reload();
            } else {
              applyDomTrim();
            }
          }
        }));
      }

      if (extra > 0) {
        wrapper.appendChild(makeActionCard({
          title: `Thu gọn về ${settings.messageLimit} lượt hỏi–đáp mới nhất`,
          subtitle: `Ẩn lại ${extra} lượt hỏi–đáp đã tải thêm để giảm lag.`,
          meta: '',
          badge: 0,
          direction: 'down',
          compact: true,
          onClick: () => {
            setExtra(0);
            if (status && status.hasOlderMessages && hiddenCount <= 0) {
              saveScrollAnchor();
              try { sessionStorage.setItem('aicc_fixlag_navigating', '1'); } catch (_) {}
              location.reload();
            } else {
              applyDomTrim();
            }
          }
        }));
      }

      const firstVisibleTurn = turns.find((t) => !t.hasAttribute('data-aicc-hidden'));
      container.insertBefore(wrapper, firstVisibleTurn || container.firstChild);
      controls = wrapper;
    });
  }

  function acceptStatus(payload) {
    if (!payload) return;
    const curId = currentConversationId();
    const matches = isSameConversation(payload.url, location.href, payload.conversationId, curId) ||
                    (payload.conversationId && curId && payload.conversationId.toLowerCase() === curId.toLowerCase()) ||
                    (!curId && payload.conversationId);
    if (!matches) return;
    status = payload;
    applyDomTrim();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'aicc-fixlag-status') return;
    acceptStatus(event.data.payload);
  });

  chrome.storage.local.get({ [OPT_KEY]: DEFAULTS }, (result) => {
    settings = normalize(result[OPT_KEY]);
    syncConfig();
    try {
      const curId = currentConversationId();
      const cached = JSON.parse(
        (curId ? sessionStorage.getItem(`aicc_fixlag_status_${curId}`) : null) ||
        sessionStorage.getItem(LAST_STATUS_KEY) ||
        'null'
      );
      if (cached) acceptStatus(cached);
    } catch (_) {}
    applyDomTrim();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[OPT_KEY]) return;
    settings = normalize(changes[OPT_KEY].newValue);
    syncConfig();
    applyDomTrim();
  });

  let lastUrl = location.href;
  let lastConvId = currentConversationId();

  function checkRouteChange() {
    const curConvId = currentConversationId();
    let urlChanged = false;
    if (location.href !== lastUrl || curConvId !== lastConvId) {
      const isDifferentConv = (curConvId && lastConvId && curConvId !== lastConvId) ||
                              (!curConvId && lastConvId && !location.pathname.includes('/c/'));
      lastUrl = location.href;
      lastConvId = curConvId;
      urlChanged = true;

      if (isDifferentConv) {
        status = null;
        removeControls();
        try {
          const extra = JSON.parse(localStorage.getItem(EXTRA_KEY) || 'null');
          if (extra && !isSameConversation(extra.url, location.href, extra.conversationId, curConvId)) {
            localStorage.removeItem(EXTRA_KEY);
          }
        } catch (_) {}
      }

      if (!status && curConvId) {
        try {
          const cached = JSON.parse(
            sessionStorage.getItem(`aicc_fixlag_status_${curConvId}`) ||
            sessionStorage.getItem(LAST_STATUS_KEY) ||
            'null'
          );
          if (cached) acceptStatus(cached);
        } catch (_) {}
      }
    }

    const turns = getDomTurns();
    const extra = getExtra();
    const stateChanged = urlChanged ||
                         turns.length !== lastTurnCount ||
                         extra !== lastAppliedExtra ||
                         settings.messageLimit !== lastAppliedLimit ||
                         settings.enabled !== lastAppliedEnabled;

    if (stateChanged) {
      applyDomTrim();
    }
  }

  setInterval(checkRouteChange, 500);

  // MutationObserver with extension-mutation filtering and debounce
  if (typeof MutationObserver !== 'undefined') {
    let debounceTimer = 0;
    observer = new MutationObserver((mutations) => {
      // Ignore mutations solely caused by our navigation controls
      const isExtensionOnly = mutations.every((m) => {
        const isExt = (n) => n.nodeType === 1 && (n.hasAttribute?.(NAV_ATTR) || n.closest?.(`[${NAV_ATTR}]`));
        if (isExt(m.target)) return true;
        const addedExt = Array.from(m.addedNodes).every(isExt);
        const removedExt = Array.from(m.removedNodes).every(isExt);
        return addedExt && removedExt;
      });
      if (isExtensionOnly) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        applyDomTrim();
      }, 100);
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  }
})();
