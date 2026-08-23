/**
 * Test Suite for ChatGPT Fix Lag Trimmer & Network Interceptor
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('🧪 Starting AI Copy Cleaner ChatGPT Fix Lag Test Suite...\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    failCount++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}\n`);
    failCount++;
  }
}

// Emulate helper functions from mainWorld.js and index.js
const HIDDEN_ROLES = new Set(['system', 'tool', 'thinking']);

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

function cutIndexForUserPairs(mapping, path, keepTurns) {
  const pairStarts = [];
  for (let i = 0; i < path.length; i++) {
    if (isUserTurn(mapping[path[i]])) pairStarts.push(i);
  }
  if (!pairStarts.length) return -1;
  const start = Math.max(0, pairStarts.length - keepTurns);
  return pairStarts[start];
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

function extractConversationId(urlOrPath) {
  if (!urlOrPath) return null;
  try {
    const path = (urlOrPath.includes('://') ? new URL(urlOrPath, 'https://chatgpt.com').pathname : urlOrPath).toLowerCase();
    const match = path.match(/(?:\/c\/|\/share\/|\/canvas\/c\/|\/conversation\/|\/shared_conversation\/)([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  } catch (_) {
    return null;
  }
}

function isPotentialConversationPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return false;
  const lower = pathname.toLowerCase();
  if (/\.(?:js|css|png|jpe?g|svg|woff2?|wasm|ico|json|map)(?:\?|$)/i.test(lower)) return false;
  if (lower.includes('/conversations') || lower.includes('/conversation_limit') || lower.includes('/stream_status') || lower.includes('/textdocs') || lower.includes('/synthesize')) return false;
  return /\/(?:backend-api|backend-anon)\/(?:.*?\/)?(?:conversation|shared_conversation)\/[^/?#]+/i.test(lower);
}

function isSameConversation(url1, url2, convId1, convId2) {
  if (convId1 && convId2 && convId1.toLowerCase() === convId2.toLowerCase()) return true;
  const id1 = convId1 || extractConversationId(url1);
  const id2 = convId2 || extractConversationId(url2);
  if (id1 && id2 && id1.toLowerCase() === id2.toLowerCase()) return true;
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;
  try {
    const p1 = new URL(url1, 'https://chatgpt.com').pathname.replace(/\/+$/, '').toLowerCase();
    const p2 = new URL(url2, 'https://chatgpt.com').pathname.replace(/\/+$/, '').toLowerCase();
    return p1 === p2;
  } catch (_) {
    return false;
  }
}

// Helper to build a mock conversation data object
function createMockConversation(turnCount) {
  const mapping = {
    'root-node': {
      id: 'root-node',
      message: null,
      parent: null,
      children: ['user-0']
    }
  };

  let lastNode = 'root-node';
  for (let i = 0; i < turnCount; i++) {
    const userNodeId = `user-${i}`;
    const assistantNodeId = `assistant-${i}`;

    mapping[lastNode].children = [userNodeId];

    mapping[userNodeId] = {
      id: userNodeId,
      message: {
        id: `msg-u-${i}`,
        author: { role: 'user' },
        content: { parts: [`Question ${i}`] }
      },
      parent: lastNode,
      children: [assistantNodeId]
    };

    mapping[assistantNodeId] = {
      id: assistantNodeId,
      message: {
        id: `msg-a-${i}`,
        author: { role: 'assistant' },
        content: { parts: [`Answer ${i}`] }
      },
      parent: userNodeId,
      children: []
    };

    lastNode = assistantNodeId;
  }

  return {
    title: 'Test Thread',
    conversation_id: 'test-uuid-1234',
    current_node: lastNode,
    mapping
  };
}

(async () => {
  // 1. Trimming short vs long conversations
  test('Does not trim conversation within message limit', () => {
    const data = createMockConversation(10);
    const result = trimConversation(data, 15, 0);
    assert.strictEqual(result.unchanged, true);
    assert.strictEqual(result.hasOlderMessages, false);
    assert.strictEqual(result.renderedTurns, 10);
    assert.strictEqual(result.totalTurns, 10);
  });

  test('Trims long conversation down to message limit and sets correct pointers', () => {
    const data = createMockConversation(30);
    const result = trimConversation(data, 15, 0);
    assert.strictEqual(result.unchanged, false);
    assert.strictEqual(result.hasOlderMessages, true);
    assert.strictEqual(result.totalTurns, 30);
    assert.strictEqual(result.renderedTurns, 15);

    const trimmedMapping = result.data.mapping;
    assert(trimmedMapping['root-node'], 'Root node preserved');
    assert.strictEqual(trimmedMapping['root-node'].children[0], 'user-15');
    assert.strictEqual(trimmedMapping['user-15'].parent, 'root-node');
    assert.strictEqual(trimmedMapping['assistant-29'].children.length, 0);
    assert.strictEqual(result.data.current_node, 'assistant-29');
  });

  test('Respects extra window from Tải thêm', () => {
    const data = createMockConversation(30);
    const result = trimConversation(data, 15, 5); // 15 + 5 = 20 turns
    assert.strictEqual(result.renderedTurns, 20);
    assert.strictEqual(result.data.mapping['root-node'].children[0], 'user-10');
  });

  // 2. Preserves reasoning/thinking and tool call nodes within kept turns
  test('Preserves tool calls and thinking metadata attached to turns', () => {
    const data = createMockConversation(20);
    data.mapping['thinking-18'] = {
      id: 'thinking-18',
      message: {
        id: 'msg-t-18',
        author: { role: 'thinking' },
        metadata: { is_visually_hidden_from_conversation: true }
      },
      parent: 'user-18',
      children: ['assistant-18']
    };
    data.mapping['user-18'].children = ['thinking-18'];
    data.mapping['assistant-18'].parent = 'thinking-18';

    const result = trimConversation(data, 5, 0);
    assert.strictEqual(result.renderedTurns, 5);
    const m = result.data.mapping;
    assert(m['thinking-18'], 'Thinking node is preserved in the trimmed graph');
    assert.strictEqual(m['thinking-18'].parent, 'user-18');
    assert.strictEqual(m['assistant-18'].parent, 'thinking-18');
  });

  // 3. Endpoint matching regex
  test('Matches standard, GPTs, gizmos, and workspace projects conversation GET endpoints', () => {
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/f/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-anon/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-anon/f/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/shared_conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/gizmos/g-p-12345/conversation/67890'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/projects/proj-abc/conversation/67890'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345?model=gpt-4o'), true);
  });

  test('Rejects non-tree endpoints and static assets', () => {
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversations?offset=0&limit=28'), false);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation_limit'), false);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345/stream_status'), false);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345/textdocs'), false);
    assert.strictEqual(isPotentialConversationPath('/backend-api/synthesize?message_id=123'), false);
    assert.strictEqual(isPotentialConversationPath('/assets/index.js'), false);
  });

  // 4. Conversation ID extraction from various ChatGPT URL formats
  test('Extracts conversation ID from standard, GPTs, Projects, Share and Canvas paths', () => {
    assert.strictEqual(extractConversationId('/c/67a12345-abcd'), '67a12345-abcd');
    assert.strictEqual(extractConversationId('/g/g-abc12345/c/67a99999-wxyz'), '67a99999-wxyz');
    assert.strictEqual(extractConversationId('/projects/proj-123/c/67a55555-mmmm'), '67a55555-mmmm');
    assert.strictEqual(extractConversationId('/share/67a88888-qqqq'), '67a88888-qqqq');
    assert.strictEqual(extractConversationId('/canvas/c/67a77777-cccc'), '67a77777-cccc');
  });

  // 5. isSameConversation matching
  test('Matches conversations accurately across SPA pushState transitions and URL variants', () => {
    // Exact URL match
    assert.strictEqual(isSameConversation('https://chatgpt.com/c/12345', 'https://chatgpt.com/c/12345/'), true);
    assert.strictEqual(isSameConversation('https://chatgpt.com/c/12345?model=4o', 'https://chatgpt.com/c/12345#bottom'), true);

    // Matching via conversationId when root URL is transitioning to /c/12345
    assert.strictEqual(isSameConversation('https://chatgpt.com/', 'https://chatgpt.com/c/test-uuid-1234', 'test-uuid-1234', 'test-uuid-1234'), true);
    assert.strictEqual(isSameConversation('https://chatgpt.com/c/test-uuid-1234', 'https://chatgpt.com/g/g-abc/c/test-uuid-1234'), true);

    // Different conversations
    assert.strictEqual(isSameConversation('https://chatgpt.com/c/12345', 'https://chatgpt.com/c/67890'), false);
  });

  // 6. Integration Test: mainWorld.js XHR and Fetch Interception Execution
  await testAsync('Integrates and trims conversation in full mainWorld.js execution environment for both fetch and XHR', async () => {
    const mock30 = createMockConversation(30);
    const rawJsonString = JSON.stringify(mock30);

    class MockXHR {
      constructor() {
        this.readyState = 0;
        this.status = 0;
        this.responseType = '';
        this._responseText = '';
        this._response = null;
        this._listeners = [];
      }
      open(method, url) {
        this._method = method;
        this._url = url;
        this.readyState = 1;
      }
      addEventListener(event, handler) {
        this._listeners.push({ event, handler });
      }
      send() {
        this.readyState = 4;
        this.status = 200;
        if (this.responseType === 'json') {
          this._response = JSON.parse(rawJsonString);
        } else {
          this._responseText = rawJsonString;
          this._response = rawJsonString;
        }
        for (const l of this._listeners) {
          if (l.event === 'readystatechange' || l.event === 'load') {
            l.handler();
          }
        }
      }
    }

    Object.defineProperty(MockXHR.prototype, 'responseText', {
      get() { return this._responseText; },
      configurable: true
    });
    Object.defineProperty(MockXHR.prototype, 'response', {
      get() { return this._response; },
      configurable: true
    });

    let postedStatus = null;
    const sandbox = {
      window: {
        location: { href: 'https://chatgpt.com/c/test-uuid-1234', pathname: '/c/test-uuid-1234', origin: 'https://chatgpt.com' },
        fetch: async (url) => ({
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'application/json']]),
          clone() {
            return {
              text: async () => rawJsonString
            };
          }
        }),
        postMessage: (msg) => {
          if (msg?.type === 'aicc-fixlag-status') {
            postedStatus = msg.payload;
          }
        },
        XMLHttpRequest: MockXHR
      },
      document: {
        documentElement: { dataset: {} }
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      location: { href: 'https://chatgpt.com/c/test-uuid-1234', pathname: '/c/test-uuid-1234', origin: 'https://chatgpt.com' },
      Headers: class { constructor() { this.m = new Map(); } set(k, v) { this.m.set(k, v); } delete(k) { this.m.delete(k); } },
      Response: class { constructor(b, init) { this.body = b; this.status = init?.status; } text() { return Promise.resolve(this.body); } json() { return Promise.resolve(JSON.parse(this.body)); } },
      Request: class { constructor(u, init) { this.url = u; this.method = init?.method || 'GET'; } },
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      Promise: Promise,
      URL: URL,
      console: console
    };
    sandbox.window.Headers = sandbox.Headers;
    sandbox.window.Response = sandbox.Response;
    sandbox.window.Request = sandbox.Request;
    sandbox.window.setTimeout = setTimeout;
    sandbox.window.setInterval = setInterval;
    sandbox.window.Promise = Promise;
    sandbox.globalThis = sandbox.window;

    const mainWorldCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'page', 'mainWorld.js'), 'utf-8');
    vm.runInNewContext(mainWorldCode, sandbox);

    // Test fetch interception
    const fetchResponse = await sandbox.window.fetch('https://chatgpt.com/backend-api/conversation/test-uuid-1234');
    const trimmedData = await fetchResponse.json();
    assert.strictEqual(Object.keys(trimmedData.mapping).length, 31); // 1 root + 15 user + 15 assistant = 31
    assert.strictEqual(postedStatus.conversationId, 'test-uuid-1234');
    assert.strictEqual(postedStatus.renderedTurns, 15);
    assert.strictEqual(postedStatus.totalTurns, 30);
    assert.strictEqual(postedStatus.hasOlderMessages, true);

    // Test XHR interception with responseType = 'json'
    const xhrJson = new sandbox.window.XMLHttpRequest();
    xhrJson.responseType = 'json';
    xhrJson.open('GET', '/backend-api/conversation/test-uuid-1234');
    xhrJson.send();
    assert.strictEqual(typeof xhrJson.response, 'object');
    assert.strictEqual(Object.keys(xhrJson.response.mapping).length, 31);

    // Test XHR interception with default text response
    const xhrText = new sandbox.window.XMLHttpRequest();
    xhrText.open('GET', '/backend-api/conversation/test-uuid-1234');
    xhrText.send();
    assert.strictEqual(typeof xhrText.responseText, 'string');
    const parsedFromText = JSON.parse(xhrText.responseText);
    assert.strictEqual(Object.keys(parsedFromText.mapping).length, 31);
  });

  // 7. Test: DOM Trimmer, Dual-Path Load More, Collapse, and Observer Loop Prevention in index.js
  await testAsync('Content Script DOM Trimmer: hides turns, supports dual-path load-more and prevents observer loops', async () => {
    // Construct a mock DOM environment
    class MockElement {
      constructor(tagName) {
        this.tagName = tagName.toUpperCase();
        this.attributes = new Map();
        this.classList = {
          contains: () => false
        };
        this.style = {
          _props: {},
          setProperty(k, v) { this._props[k] = v; },
          removeProperty(k) { delete this._props[k]; },
          get display() { return this._props['display'] || ''; },
          set display(v) { if (v) this._props['display'] = v; else delete this._props['display']; }
        };
        this.children = [];
        this.parentElement = null;
        this._listeners = {};
        this.nodeType = 1;
      }
      setAttribute(k, v) { this.attributes.set(k, String(v)); }
      getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
      removeAttribute(k) { this.attributes.delete(k); }
      hasAttribute(k) { return this.attributes.has(k); }
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      }
      insertBefore(child, ref) {
        child.parentElement = this;
        const idx = this.children.indexOf(ref);
        if (idx >= 0) this.children.splice(idx, 0, child);
        else this.children.push(child);
        return child;
      }
      remove() {
        if (this.parentElement) {
          const idx = this.parentElement.children.indexOf(this);
          if (idx >= 0) this.parentElement.children.splice(idx, 1);
          this.parentElement = null;
        }
      }
      get isConnected() {
        return !!this.parentElement;
      }
      addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
      }
      click() {
        if (this._listeners['click']) {
          const ev = { preventDefault() {}, stopPropagation() {} };
          this._listeners['click'].forEach((fn) => fn(ev));
        }
      }
      closest(sel) {
        let cur = this;
        while (cur) {
          if (sel.startsWith('article') && cur.tagName === 'ARTICLE') return cur;
          if (sel.includes('data-turn-id-container') && cur.hasAttribute('data-turn-id-container')) return cur;
          if (sel.includes('data-aicc-navigation') && cur.hasAttribute('data-aicc-navigation')) return cur;
          cur = cur.parentElement;
        }
        return null;
      }
      querySelector(sel) {
        function walk(n) {
          for (const c of n.children) {
            if (sel.includes('[data-aicc-navigation') && c.hasAttribute && c.hasAttribute('data-aicc-navigation')) return c;
            if (sel.includes('article') && c.tagName === 'ARTICLE') return c;
            if (sel.includes('button') && c.tagName === 'BUTTON') return c;
            const found = walk(c);
            if (found) return found;
          }
          return null;
        }
        return walk(this);
      }
      querySelectorAll(sel) {
        const res = [];
        function walk(n) {
          for (const c of n.children) {
            if (sel.includes('article') && c.tagName === 'ARTICLE') res.push(c);
            else if (sel.includes('data-aicc-navigation') && c.hasAttribute && c.hasAttribute('data-aicc-navigation')) res.push(c);
            walk(c);
          }
        }
        walk(this);
        return res;
      }
    }

    const mockDoc = {
      documentElement: new MockElement('html'),
      body: new MockElement('body'),
      createElement(tag) { return new MockElement(tag); },
      querySelector(sel) {
        if (sel === 'main') return mainContainer;
        return this.body.querySelector(sel);
      },
      querySelectorAll(sel) {
        return this.body.querySelectorAll(sel);
      },
      addEventListener() {}
    };

    const mainContainer = new MockElement('main');
    mockDoc.body.appendChild(mainContainer);

    const turnsContainer = new MockElement('div');
    mainContainer.appendChild(turnsContainer);

    // Create 10 mock articles (5 user + 5 assistant turns)
    const turnElements = [];
    for (let i = 0; i < 10; i++) {
      const art = new MockElement('article');
      art.setAttribute('data-testid', `conversation-turn-${i}`);
      turnsContainer.appendChild(art);
      turnElements.push(art);
    }

    let storageLocal = {
      aicc_optimizer_settings: { enabled: true, messageLimit: 2, loadStep: 2 } // 2 QA pairs = 4 articles
    };

    let reloadsTriggered = 0;
    const mockSessionStorage = {
      m: new Map(),
      getItem(k) { return this.m.get(k) || null; },
      setItem(k, v) { this.m.set(k, String(v)); },
      removeItem(k) { this.m.delete(k); }
    };
    const mockLocalStorage = {
      m: new Map(),
      getItem(k) { return this.m.get(k) || null; },
      setItem(k, v) { this.m.set(k, String(v)); },
      removeItem(k) { this.m.delete(k); }
    };

    let observerCallback = null;
    let observerDisconnected = false;

    class MockMutationObserver {
      constructor(cb) {
        observerCallback = cb;
      }
      observe() { observerDisconnected = false; }
      disconnect() { observerDisconnected = true; }
    }

    const windowListeners = {};
    let storageChangeListeners = [];
    const sandbox = {
      window: {
        addEventListener: (evt, fn) => {
          if (!windowListeners[evt]) windowListeners[evt] = [];
          windowListeners[evt].push(fn);
        },
        dispatchEvent: (e) => {
          if (windowListeners[e.type]) windowListeners[e.type].forEach((fn) => fn(e));
        },
        postMessage: (msg) => {
          if (windowListeners['message']) {
            const ev = { source: sandbox.window, data: msg };
            windowListeners['message'].forEach((fn) => fn(ev));
          }
        },
        location: { href: 'https://chatgpt.com/c/test-uuid-1234', pathname: '/c/test-uuid-1234', origin: 'https://chatgpt.com', reload: () => { reloadsTriggered++; } }
      },
      document: mockDoc,
      chrome: {
        storage: {
          local: {
            get: (keys, cb) => cb(storageLocal),
            set: (obj) => { Object.assign(storageLocal, obj); }
          },
          onChanged: {
            addListener: (fn) => storageChangeListeners.push(fn)
          }
        }
      },
      localStorage: mockLocalStorage,
      sessionStorage: mockSessionStorage,
      location: { href: 'https://chatgpt.com/c/test-uuid-1234', pathname: '/c/test-uuid-1234', origin: 'https://chatgpt.com', reload: () => { reloadsTriggered++; } },
      MutationObserver: MockMutationObserver,
      CustomEvent: class {},
      Number: Number,
      JSON: JSON,
      Math: Math,
      parseInt: parseInt,
      setTimeout: (fn) => fn(),
      clearTimeout: () => {},
      setInterval: () => {},
      URL: URL,
      Array: Array,
      Set: Set,
      console: console
    };
    sandbox.globalThis = sandbox.window;

    const indexCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'index.js'), 'utf-8');
    vm.runInNewContext(indexCode, sandbox);

    // Initial trim verification: 10 turns, limit = 2 pairs (4 turns) -> 6 hidden, 4 visible
    const hidden = turnElements.filter((t) => t.getAttribute('data-aicc-hidden') === 'true');
    const visible = turnElements.filter((t) => !t.hasAttribute('data-aicc-hidden'));
    assert.strictEqual(hidden.length, 6, 'First 6 turns should be hidden');
    assert.strictEqual(visible.length, 4, 'Last 4 turns should be visible');

    // Controls verification: top action wrapper attached
    const controlsWrapper = turnsContainer.querySelector('[data-aicc-navigation="top"]');
    assert(controlsWrapper, 'Top action card wrapper should be attached');

    // Path A Test: Click Load More when hidden turns are in DOM -> reveals 2 more pairs without reload
    const loadBtn = controlsWrapper.children[0];
    assert(loadBtn, 'Load button should exist');
    loadBtn.click();

    assert.strictEqual(reloadsTriggered, 0, 'Should not reload when turns exist in DOM');
    const hiddenAfterLoad = turnElements.filter((t) => t.getAttribute('data-aicc-hidden') === 'true');
    const visibleAfterLoad = turnElements.filter((t) => !t.hasAttribute('data-aicc-hidden'));
    assert.strictEqual(hiddenAfterLoad.length, 2, '2 turns remain hidden after loading 2 pairs');
    assert.strictEqual(visibleAfterLoad.length, 8, '8 turns now visible');

    // Collapse Test: Click Collapse card -> restores to 4 visible turns
    const updatedControls = turnsContainer.querySelector('[data-aicc-navigation="top"]');
    const collapseBtn = updatedControls.children[1]; // second button is collapse
    assert(collapseBtn, 'Collapse button should exist when extra > 0');
    collapseBtn.click();

    const hiddenAfterCollapse = turnElements.filter((t) => t.getAttribute('data-aicc-hidden') === 'true');
    assert.strictEqual(hiddenAfterCollapse.length, 6, 'Collapsed back to 6 hidden turns');

    // Path B Test: When status.hasOlderMessages is true and all DOM turns are visible -> triggers reload
    // Update settings so messageLimit is 5 (10 turns visible, hiddenCount === 0)
    storageLocal.aicc_optimizer_settings.messageLimit = 5;
    storageChangeListeners.forEach((fn) => fn({
      aicc_optimizer_settings: {
        newValue: { enabled: true, messageLimit: 5, loadStep: 2 }
      }
    }, 'local'));

    // Dispatch status message indicating upstream has older messages
    sandbox.window.postMessage({
      type: 'aicc-fixlag-status',
      payload: {
        hasOlderMessages: true,
        totalTurns: 30,
        renderedTurns: 5,
        totalVisibleMessages: 60,
        renderedVisibleMessages: 10,
        conversationId: 'test-uuid-1234',
        url: 'https://chatgpt.com/c/test-uuid-1234'
      }
    });

    const pathBControls = turnsContainer.querySelector('[data-aicc-navigation="top"]');
    assert(pathBControls, 'Top action card wrapper should be attached for upstream hasOlderMessages');

    const pathBLoadBtn = pathBControls.children[0];
    assert(pathBLoadBtn, 'Path B Load button should exist');
    reloadsTriggered = 0;
    pathBLoadBtn.click();

    assert.strictEqual(reloadsTriggered, 1, 'Path B should trigger location.reload() exactly once');
    const savedExtra = JSON.parse(mockLocalStorage.getItem('aicc_fixlag_extra') || '{}');
    assert.strictEqual(savedExtra.extra, 2, 'Extra should increase by loadStep (2)');
    assert(mockSessionStorage.getItem('aicc_fixlag_scroll_restore'), 'Scroll anchor should be saved');
    assert.strictEqual(mockSessionStorage.getItem('aicc_fixlag_navigating'), '1', 'Navigating flag should be set');
  });

  // 8. Test: Upstream 30 QA pairs -> initially trimmed to 15 -> post-reload with extra=5 trimmed to 20
  test('Upstream integration: 30 QA pairs initially trimmed to 15, and after load-more with extra=5 trimmed to 20', () => {
    const upstreamData = createMockConversation(30);

    // Initial load: limit = 15, extra = 0
    const initialResult = trimConversation(upstreamData, 15, 0);
    assert.strictEqual(initialResult.renderedTurns, 15, 'Initially renders 15 turns');
    assert.strictEqual(initialResult.totalTurns, 30, 'Total turns is 30');
    assert.strictEqual(initialResult.hasOlderMessages, true, 'hasOlderMessages is true');

    // Post-reload: limit = 15, extra = 5
    const postReloadResult = trimConversation(upstreamData, 15, 5);
    assert.strictEqual(postReloadResult.renderedTurns, 20, 'Post-reload renders 20 turns (15 + 5)');
    assert.strictEqual(postReloadResult.totalTurns, 30, 'Total turns remains 30');
    assert.strictEqual(postReloadResult.hasOlderMessages, true, 'Still has 10 older messages');
  });

  console.log(`\n========================================`);
  console.log(`Test Results: ${passCount} passed, ${failCount} failed`);
  console.log(`========================================\n`);

  if (failCount > 0) process.exit(1);
})();
