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

// Emulate helper functions from mainWorld.js
const HIDDEN_ROLES = new Set(['system', 'tool', 'thinking']);
const PAGE_CONV = /(?:\/c\/|\/g\/[^/]+\/c\/)([^/?#]+)/i;

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

function isPotentialConversationPath(pathname) {
  if (!pathname || typeof pathname !== 'string') return false;
  const lower = pathname.toLowerCase();
  if (/\.(?:js|css|png|jpe?g|svg|woff2?|wasm|ico|json|map)(?:\?|$)/i.test(lower)) return false;
  if (lower.includes('/conversations')) return false;
  if (lower.includes('/conversation_limit') || lower.includes('/stream_status') || lower.includes('/textdocs')) return false;
  return /\/(?:backend-api|backend-anon)\/(?:f\/)?(?:conversation|shared_conversation)\/[^/]+/i.test(lower);
}

function sameConversationUrl(url1, url2) {
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
  test('Matches standard and frontend-proxied conversation GET endpoints', () => {
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/f/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-anon/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-anon/f/conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/shared_conversation/12345'), true);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345?model=gpt-4o'), true);
  });

  test('Rejects non-tree endpoints and static assets', () => {
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversations?offset=0&limit=28'), false);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation_limit'), false);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345/stream_status'), false);
    assert.strictEqual(isPotentialConversationPath('/backend-api/conversation/12345/textdocs'), false);
    assert.strictEqual(isPotentialConversationPath('/assets/index.js'), false);
  });

  // 4. Conversation ID extraction from URL
  test('Extracts conversation ID from standard and Custom GPT paths', () => {
    const match1 = '/c/67a12345-abcd'.match(PAGE_CONV);
    assert.strictEqual(match1[1], '67a12345-abcd');

    const match2 = '/g/g-abc12345/c/67a99999-wxyz'.match(PAGE_CONV);
    assert.strictEqual(match2[1], '67a99999-wxyz');
  });

  // 5. sameConversationUrl normalization
  test('Normalizes and matches conversation URLs correctly', () => {
    assert.strictEqual(sameConversationUrl('https://chatgpt.com/c/12345', 'https://chatgpt.com/c/12345/'), true);
    assert.strictEqual(sameConversationUrl('https://chatgpt.com/c/12345?model=4o', 'https://chatgpt.com/c/12345#bottom'), true);
    assert.strictEqual(sameConversationUrl('https://chatgpt.com/c/12345', 'https://chatgpt.com/c/67890'), false);
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
        postMessage: () => {},
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

  console.log(`\n========================================`);
  console.log(`Test Results: ${passCount} passed, ${failCount} failed`);
  console.log(`========================================\n`);

  if (failCount > 0) process.exit(1);
})();
