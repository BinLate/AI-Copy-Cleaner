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

  function getExtra() {
    try {
      const value = JSON.parse(localStorage.getItem(EXTRA_KEY) || 'null');
      return value?.url === location.href ? Math.max(0, parseInt(value.extra, 10) || 0) : 0;
    } catch (_) {
      return 0;
    }
  }

  function setExtra(extra) {
    try {
      if (extra > 0) localStorage.setItem(EXTRA_KEY, JSON.stringify({ url: location.href, extra }));
      else localStorage.removeItem(EXTRA_KEY);
    } catch (_) {}
  }

  function firstTurnId() {
    const items = document.querySelectorAll('[data-turn-id-container], [data-testid^="conversation-turn-"]');
    for (const el of items) {
      const id = el.getAttribute('data-turn-id-container') || el.getAttribute('data-testid');
      if (id) return id;
    }
    return null;
  }

  function saveScrollAnchor() {
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ url: location.href, anchor: firstTurnId() }));
    } catch (_) {}
  }

  function restoreScrollAnchor() {
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null'); } catch (_) { return; }
    if (!saved || saved.url !== location.href || !saved.anchor) return;

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const safe = globalThis.CSS?.escape ? CSS.escape(saved.anchor) : saved.anchor.replace(/"/g, '\\"');
      const el = document.querySelector(`[data-turn-id-container="${safe}"]`) || document.querySelector(`[data-testid="${safe}"]`);
      if (el) {
        clearInterval(timer);
        try { sessionStorage.removeItem(SCROLL_KEY); } catch (_) {}
        requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      } else if (tries > 30) {
        clearInterval(timer);
      }
    }, 150);
  }

  function reloadWithExtra(nextExtra) {
    saveScrollAnchor();
    setExtra(nextExtra);
    try { sessionStorage.setItem('aicc_fixlag_navigating', '1'); } catch (_) {}
    location.reload();
  }

  function findMessagesContainer() {
    const turn = document.querySelector('div[data-turn-id-container]');
    if (turn?.parentElement) return turn.parentElement;
    const fallback = document.querySelector('[data-testid^="conversation-turn-"]');
    return fallback?.parentElement || null;
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

  function ensureControls(retry = 0) {
    const extra = getExtra();
    if (!settings.enabled || !status || (!status.hasOlderMessages && extra <= 0)) {
      removeControls();
      return;
    }

    const container = findMessagesContainer();
    if (!container) {
      if (retry < 10) setTimeout(() => ensureControls(retry + 1), 500);
      return;
    }

    if (controls?.isConnected && controls.parentElement === container) {
      controls.remove();
      controls = null;
    }
    document.querySelectorAll(`[${NAV_ATTR}]`).forEach((el) => el.remove());

    const wrapper = document.createElement('div');
    wrapper.setAttribute(NAV_ATTR, 'top');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 0 4px;margin-bottom:10px;width:100%;box-sizing:border-box;';

    const totalTurns = status.totalTurns ?? status.totalMessages ?? 0;
    const renderedTurns = status.renderedTurns ?? status.renderedMessages ?? 0;
    const hiddenCount = Math.max(0, totalTurns - renderedTurns);

    if (status.hasOlderMessages) {
      wrapper.appendChild(makeActionCard({
        title: `Tải ${Math.min(settings.loadStep, hiddenCount || settings.loadStep)} lượt hỏi–đáp trước đó`,
        subtitle: `Mỗi lượt gồm câu hỏi của bạn + câu trả lời của ChatGPT.`,
        meta: hiddenCount > 0 ? `Còn ${hiddenCount} lượt cũ đang được ẩn.` : 'Có thể đổi số lượng trong cài đặt extension.',
        badge: hiddenCount,
        direction: 'up',
        onClick: () => reloadWithExtra(extra + settings.loadStep)
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
        onClick: () => reloadWithExtra(0)
      }));
    }

    const firstTurn = container.querySelector(':scope > [data-turn-id-container], :scope > [data-testid^="conversation-turn-"]');
    container.insertBefore(wrapper, firstTurn || container.firstChild);
    controls = wrapper;
  }

  function acceptStatus(payload) {
    if (!payload || payload.url !== location.href) return;
    status = payload;
    ensureControls();
    restoreScrollAnchor();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.type !== 'aicc-fixlag-status') return;
    acceptStatus(event.data.payload);
  });

  chrome.storage.local.get({ [OPT_KEY]: DEFAULTS }, (result) => {
    settings = normalize(result[OPT_KEY]);
    syncConfig();
    try {
      const cached = JSON.parse(sessionStorage.getItem(LAST_STATUS_KEY) || 'null');
      if (cached) acceptStatus(cached);
    } catch (_) {}
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[OPT_KEY]) return;
    settings = normalize(changes[OPT_KEY].newValue);
    syncConfig();
    ensureControls();
  });

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      status = null;
      removeControls();
      try {
        const extra = JSON.parse(localStorage.getItem(EXTRA_KEY) || 'null');
        if (extra?.url !== location.href) localStorage.removeItem(EXTRA_KEY);
      } catch (_) {}
    }
    if (status && !controls?.isConnected) ensureControls();
  }, 1200);
})();
