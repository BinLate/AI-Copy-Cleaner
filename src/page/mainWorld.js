(() => {
  'use strict';

  if (window.__AICC_NETWORK_TRIMMER_PATCHED__) return;
  window.__AICC_NETWORK_TRIMMER_PATCHED__ = true;

  const CONFIG_KEY = 'aicc_fixlag_config';
  const EXTRA_KEY = 'aicc_fixlag_extra';
  const LAST_STATUS_KEY = 'aicc_fixlag_last_status';
  const NAV_KEY = 'aicc_fixlag_navigating';
  const DEFAULT_CONFIG = { enabled: true, messageLimit: 15 };
  const HIDDEN_ROLES = new Set(['system', 'tool', 'thinking']);
  const PAGE_CONV = /(?:\/c\/|\/g\/[^/]+\/c\/)([^/?#]+)/i;
  const nativeJSONParse = JSON.parse.bind(JSON);
  const nativeFetch = window.fetch.bind(window);

  let currentConversationId = null;
  let resolveWasmReady;
  window.__AICC_WASM_READY_PROMISE__ = new Promise((resolve) => {
    resolveWasmReady = resolve;
  });
  window.__AICC_WASM_INITIALIZED__ = false;
  window.__AICC_TRIM_SKIP__ = null;
  window.__AICC_TRIM_LAST__ = null;

  const treeGetsSeen = new Set();
  const bootstrapInFlight = new Set();

  function setSkip(reason) {
    window.__AICC_TRIM_SKIP__ = reason;
  }

  function parseConfig(raw) {
    const value = typeof raw === 'string' ? nativeJSONParse(raw) : raw;
    const limit = Number.parseInt(value?.messageLimit, 10);
    return {
      enabled: value?.enabled !== false,
      messageLimit: Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : DEFAULT_CONFIG.messageLimit
    };
  }

  function getConfig() {
    try {
      const fromDom = document.documentElement.dataset.aiccFixlagConfig;
      if (fromDom) return parseConfig(fromDom);
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) return parseConfig(stored);
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  function configIsReady() {
    try {
      return !!(document.documentElement.dataset.aiccFixlagConfig || localStorage.getItem(CONFIG_KEY));
    } catch (_) {
      return false;
    }
  }

  async function ensureConfigReady(timeoutMs = 400) {
    if (configIsReady()) return getConfig();
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (configIsReady()) return getConfig();
    }
    return getConfig();
  }

  function getExtra() {
    try {
      const value = nativeJSONParse(localStorage.getItem(EXTRA_KEY) || 'null');
      if (value) {
        const curPath = location.pathname.replace(/\/+$/, '').toLowerCase();
        const valPath = new URL(value.url || '', location.origin).pathname.replace(/\/+$/, '').toLowerCase();
        if (curPath === valPath) return Math.max(0, parseInt(value.extra, 10) || 0);
      }
    } catch (_) {}
    return 0;
  }

  function requestParts(input, init) {
    let urlString;
    let method;
    if (input instanceof Request) {
      urlString = input.url;
      method = String(init?.method || input.method || 'GET').toUpperCase();
    } else if (typeof URL !== 'undefined' && input instanceof URL) {
      urlString = input.href;
      method = String(init?.method || 'GET').toUpperCase();
    } else {
      urlString = String(input);
      method = String(init?.method || 'GET').toUpperCase();
    }
    let pathname = '';
    try {
      pathname = new URL(urlString, location.href).pathname;
    } catch (_) {
      pathname = urlString;
    }
    return { urlString, method, pathname };
  }

  function isPotentialConversationPath(pathname) {
    if (!pathname || typeof pathname !== 'string') return false;
    const lower = pathname.toLowerCase();
    if (/\.(?:js|css|png|jpe?g|svg|woff2?|wasm|ico|json|map)(?:\?|$)/i.test(lower)) return false;
    if (lower.includes('/conversations')) return false;
    if (lower.includes('/conversation_limit') || lower.includes('/stream_status') || lower.includes('/textdocs')) return false;
    return /\/(?:backend-api|backend-anon)\/(?:f\/)?(?:conversation|shared_conversation)\/[^/]+/i.test(lower);
  }

  function isTreeGet(method, pathname) {
    return (method === 'GET' || !method) && isPotentialConversationPath(pathname);
  }

  function pageConversationId() {
    const match = location.pathname.match(PAGE_CONV);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function isJsonishResponse(response) {
    const type = (response.headers.get('content-type') || '').toLowerCase();
    return !type || type.includes('json') || type.includes('text/plain');
  }

  function looksLikeConversationData(data) {
    return !!(
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      data.mapping &&
      typeof data.mapping === 'object' &&
      typeof data.current_node === 'string' &&
      data.mapping[data.current_node]
    );
  }

  function nodeRole(node) {
    const role = node?.message?.author?.role || node?.message?.role || node?.role || '';
    return String(role).toLowerCase();
  }

  function isVisibleMessage(node) {
    const role = nodeRole(node);
    if (!role) return false;
    if (HIDDEN_ROLES.has(role)) return false;
    if (node.message?.metadata?.is_visually_hidden_from_conversation) return false;
    return true;
  }

  function isUserTurn(node) {
    return isVisibleMessage(node) && nodeRole(node) === 'user';
  }

  function buildCurrentPath(mapping, currentNode) {
    const path = [];
    const seen = new Set();
    let id = currentNode;
    const max = Object.keys(mapping).length + 5;
    while (id && mapping[id] && !seen.has(id) && path.length < max) {
      seen.add(id);
      path.push(id);
      id = mapping[id].parent;
    }
    return path.reverse();
  }

  function countQaPairs(mapping, path) {
    let visible = 0;
    let pairs = 0;
    let roleTurns = 0;
    let lastRole = null;
    for (const id of path) {
      const node = mapping[id];
      if (!isVisibleMessage(node)) continue;
      visible++;
      const role = nodeRole(node);
      if (role !== lastRole) {
        roleTurns++;
        lastRole = role;
      }
      if (isUserTurn(node)) pairs++;
    }
    return { visible, turns: pairs, roleTurns };
  }

  function isPrefetchConversation(conversationId) {
    if (!conversationId) return false;
    const match = location.pathname.match(PAGE_CONV);
    if (!match) return false;
    return !decodeURIComponent(match[1]).toLowerCase().includes(String(conversationId).toLowerCase());
  }

  function cutIndexForUserPairs(mapping, path, keepTurns) {
    const pairStarts = [];
    for (let i = 0; i < path.length; i++) {
      if (isUserTurn(mapping[path[i]])) pairStarts.push(i);
    }
    if (!pairStarts.length) return -1;
    const start = Math.max(0, pairStarts.length - keepTurns);
    return pairStarts[start];
  }

  function cutIndexForRoleTurns(mapping, path, keepTurns) {
    let turnCount = 0;
    let lastRole = null;
    let cutIndex = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      const node = mapping[path[i]];
      if (!isVisibleMessage(node)) continue;
      const role = nodeRole(node);
      if (role !== lastRole) {
        turnCount++;
        lastRole = role;
      }
      if (turnCount > keepTurns) {
        cutIndex = i + 1;
        break;
      }
    }
    return cutIndex;
  }

  function trimConversation(data, baseLimit, extra) {
    const mapping = data?.mapping;
    const currentNode = data?.current_node;
    if (!mapping || typeof currentNode !== 'string' || !mapping[currentNode]) return null;

    const path = buildCurrentPath(mapping, currentNode);
    if (!path.length) return null;

    const effectiveLimit = Math.max(1, baseLimit + extra);
    const totals = countQaPairs(mapping, path);
    const originalRootId = path[0];
    const originalRootNode = mapping[originalRootId];
    const hasOriginalRoot = !!(originalRootNode && !isVisibleMessage(originalRootNode));

    const pairCut = cutIndexForUserPairs(mapping, path, effectiveLimit);
    const usePairs = pairCut >= 0 && totals.turns > 0;
    const overLimit = usePairs
      ? totals.turns > effectiveLimit
      : totals.roleTurns > Math.max(1, effectiveLimit * 2) || totals.visible > Math.max(2, effectiveLimit * 2);

    if (!overLimit) {
      return {
        data,
        unchanged: true,
        totalTurns: usePairs ? totals.turns : Math.ceil(totals.roleTurns / 2),
        renderedTurns: usePairs ? totals.turns : Math.ceil(totals.roleTurns / 2),
        totalVisibleMessages: totals.visible,
        renderedVisibleMessages: totals.visible,
        hasOlderMessages: false,
        rootId: originalRootId,
        absoluteMessages: totals.visible
      };
    }

    const cutIndex = usePairs
      ? pairCut
      : cutIndexForRoleTurns(mapping, path, Math.max(2, effectiveLimit * 2));

    let keptRaw = path.slice(cutIndex);
    const keptVisible = keptRaw.filter((id) => isVisibleMessage(mapping[id]));
    if (!keptVisible.length) return null;

    if (hasOriginalRoot && keptRaw[0] === originalRootId) keptRaw = keptRaw.slice(1);

    const newMapping = {};
    if (hasOriginalRoot) {
      newMapping[originalRootId] = {
        ...originalRootNode,
        parent: null,
        children: keptRaw[0] ? [keptRaw[0]] : []
      };
    }

    let turnsKept = 0;
    for (let i = 0; i < keptRaw.length; i++) {
      const id = keptRaw[i];
      const originalNode = mapping[id];
      if (!originalNode) continue;
      const prevId = i === 0 ? (hasOriginalRoot ? originalRootId : null) : keptRaw[i - 1];
      const nextId = keptRaw[i + 1] || null;
      newMapping[id] = {
        ...originalNode,
        id: originalNode.id || id,
        parent: prevId ?? null,
        children: nextId ? [nextId] : []
      };
      if (isUserTurn(originalNode)) turnsKept++;
    }

    if (!usePairs) {
      const keptStats = countQaPairs(newMapping, keptRaw);
      turnsKept = Math.max(1, Math.ceil(keptStats.roleTurns / 2));
    }

    const newRoot = hasOriginalRoot ? originalRootId : keptRaw[0];
    const newCurrent = keptRaw[keptRaw.length - 1] || currentNode;
    if (!newRoot || !newCurrent) return null;

    return {
      data: {
        ...data,
        mapping: newMapping,
        current_node: newCurrent,
        root: newRoot
      },
      unchanged: false,
      totalTurns: usePairs ? totals.turns : Math.ceil(totals.roleTurns / 2),
      renderedTurns: turnsKept,
      totalVisibleMessages: totals.visible,
      renderedVisibleMessages: keptVisible.length,
      hasOlderMessages: true,
      rootId: originalRootId,
      absoluteMessages: totals.visible
    };
  }

  function publishStatus(status) {
    const payload = { ...status, url: location.href };
    try { sessionStorage.setItem(LAST_STATUS_KEY, JSON.stringify(payload)); } catch (_) {}
    window.postMessage({ type: 'aicc-fixlag-status', payload }, '*');
  }

  function rewriteResponse(response, body) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    headers.delete('content-length');
    headers.delete('content-encoding');
    const rewritten = new Response(JSON.stringify(body), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
    try { Object.defineProperty(rewritten, 'url', { value: response.url }); } catch (_) {}
    try {
      if (response.type) Object.defineProperty(rewritten, 'type', { value: response.type });
    } catch (_) {}
    return rewritten;
  }

  function statusFields(result, extra, config, conversationId) {
    return {
      totalMessages: result.totalTurns,
      renderedMessages: result.renderedTurns,
      totalTurns: result.totalTurns,
      renderedTurns: result.renderedTurns,
      totalVisibleMessages: result.totalVisibleMessages,
      renderedVisibleMessages: result.renderedVisibleMessages,
      extraMessages: extra,
      hasOlderMessages: result.hasOlderMessages,
      baseLimit: config.messageLimit,
      conversationId: conversationId || null,
      absoluteMessages: result.absoluteMessages,
      rootId: result.rootId
    };
  }

  function noteConversation(data) {
    if (data.conversation_id) treeGetsSeen.add(String(data.conversation_id));
    const prefetch = isPrefetchConversation(data.conversation_id);
    if (prefetch || !data.conversation_id || data.conversation_id === currentConversationId) {
      return { switched: false };
    }
    const switched = currentConversationId !== null;
    if (switched) {
      try {
        localStorage.removeItem(EXTRA_KEY);
        sessionStorage.removeItem(NAV_KEY);
      } catch (_) {}
    }
    currentConversationId = data.conversation_id;
    return { switched };
  }

  function applyTrimToData(data, via) {
    if (!looksLikeConversationData(data)) return data;

    const config = getConfig();
    const prefetch = isPrefetchConversation(data.conversation_id);
    const switched = noteConversation(data).switched;
    const extra = prefetch || switched ? 0 : getExtra();

    window.__AICC_TRIM_LAST__ = {
      via,
      enabled: config.enabled,
      limit: config.messageLimit,
      extra,
      mappingSize: Object.keys(data.mapping).length,
      conversationId: data.conversation_id || null
    };

    if (!config.enabled) {
      setSkip('disabled');
      if (!prefetch) {
        const origPath = buildCurrentPath(data.mapping, data.current_node);
        const stats = countQaPairs(data.mapping, origPath);
        publishStatus(statusFields({
          totalTurns: stats.turns || Math.ceil(stats.roleTurns / 2),
          renderedTurns: stats.turns || Math.ceil(stats.roleTurns / 2),
          totalVisibleMessages: stats.visible,
          renderedVisibleMessages: stats.visible,
          hasOlderMessages: false,
          absoluteMessages: stats.visible,
          rootId: origPath[0]
        }, 0, config, data.conversation_id));
      }
      return data;
    }

    const result = trimConversation(data, config.messageLimit, extra);
    if (!result) {
      setSkip('no-mapping');
      return data;
    }

    window.__AICC_TRIM_LAST__.totalTurns = result.totalTurns;
    window.__AICC_TRIM_LAST__.keptTurns = result.renderedTurns;
    window.__AICC_TRIM_LAST__.trimmed = !result.unchanged;

    if (result.unchanged || !result.hasOlderMessages) {
      setSkip('no-visible-trim');
      if (!prefetch) publishStatus(statusFields(result, extra, config, data.conversation_id));
      return data;
    }

    setSkip(null);
    if (!prefetch) publishStatus(statusFields(result, extra, config, data.conversation_id));
    return result.data;
  }

  async function processConversationResponse(response) {
    try {
      if (!isJsonishResponse(response)) {
        setSkip('not-json');
        return response;
      }

      let text = await response.clone().text();
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const data = nativeJSONParse(text);
      if (!looksLikeConversationData(data)) {
        setSkip('no-mapping');
        return response;
      }

      const trimmed = applyTrimToData(data, 'fetch');
      if (trimmed === data) return response;
      return rewriteResponse(response, trimmed);
    } catch (error) {
      console.warn('[AI Copy Cleaner] Conversation trim fallback:', error);
      setSkip('no-mapping');
      return response;
    }
  }

  async function interceptedFetch(...args) {
    const { method, pathname } = requestParts(args[0], args[1]);
    window.__AICC_TRIM_LAST_URL_SEEN__ = pathname;
    if (!isTreeGet(method, pathname)) {
      return nativeFetch(...args);
    }

    if (window.__AICC_WASM_INITIALIZED__ === true && window.__AICC_WASM_READY_PROMISE__) {
      await Promise.race([
        window.__AICC_WASM_READY_PROMISE__,
        new Promise((resolve) => setTimeout(resolve, 2000))
      ]);
    }

    await ensureConfigReady();
    const response = await nativeFetch(...args);
    return processConversationResponse(response);
  }

  // Intercept XMLHttpRequest for complete coverage
  const OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR && typeof OriginalXHR.prototype.open === 'function') {
    const origOpen = OriginalXHR.prototype.open;
    const origSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function (method, url, ...rest) {
      this.__aicc_method = String(method || 'GET').toUpperCase();
      this.__aicc_url = url;
      return origOpen.call(this, method, url, ...rest);
    };

    OriginalXHR.prototype.send = function (body) {
      const { method, pathname } = requestParts(this.__aicc_url, { method: this.__aicc_method });
      if (!isTreeGet(method, pathname)) {
        return origSend.call(this, body);
      }

      const onReady = () => {
        if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
          try {
            const rawText = this.responseText;
            if (rawText) {
              const data = nativeJSONParse(rawText);
              if (looksLikeConversationData(data)) {
                const trimmed = applyTrimToData(data, 'xhr');
                if (trimmed !== data) {
                  const trimmedText = JSON.stringify(trimmed);
                  Object.defineProperty(this, 'responseText', { value: trimmedText, configurable: true });
                  Object.defineProperty(this, 'response', { value: trimmedText, configurable: true });
                }
              }
            }
          } catch (_) {}
        }
      };
      this.addEventListener('readystatechange', onReady);
      return origSend.call(this, body);
    };
  }

  async function initWasm() {
    try {
      if (window.WasmTrimmer && typeof window.WasmTrimmer.initialize === 'function') {
        window.__AICC_WASM_INITIALIZED__ = !!(await window.WasmTrimmer.initialize());
      } else {
        window.__AICC_WASM_INITIALIZED__ = false;
      }
    } catch (_) {
      window.__AICC_WASM_INITIALIZED__ = false;
    }
    resolveWasmReady();
  }

  function scheduleBootstrap(conversationId) {
    if (!conversationId || treeGetsSeen.has(conversationId) || bootstrapInFlight.has(conversationId)) return;
    if (!getConfig().enabled) return;
    bootstrapInFlight.add(conversationId);
    const delays = [250, 900, 2000];
    (async () => {
      for (const ms of delays) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        if (treeGetsSeen.has(conversationId)) return;
        if (!getConfig().enabled) return;
        if (pageConversationId() !== conversationId) return;
        try {
          await window.fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`);
        } catch (_) {}
      }
    })().finally(() => bootstrapInFlight.delete(conversationId));
  }

  let lastPath = location.pathname;
  function onRoute() {
    const id = pageConversationId();
    if (id) scheduleBootstrap(id);
    else setSkip('not-tree-get');
  }

  window.fetch = function (...args) {
    return interceptedFetch(...args);
  };
  
  onRoute();
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      onRoute();
    }
  }, 400);

  initWasm();
})();
