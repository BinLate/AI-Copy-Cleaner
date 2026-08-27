/**
 * Lifecycle regression tests (Round 1 review findings B001 & B002)
 * - B001: deterministic sync-first startup resolution, no sync/local race
 * - B002: MAIN-world injection marked only after confirmed background success
 * Run: node tests/test_lifecycle.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
let failed = 0;

async function it(desc, fn) {
  try {
    await fn();
    console.log(`  \u2705 PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  \u274c FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Content-script sandbox                                              */
/* ------------------------------------------------------------------ */
function loadContentScript(opts) {
  const o = Object.assign(
    {
      syncData: {},            // snapshot returned by sync.get
      localData: {},           // snapshot returned by local.get
      syncFails: false,        // sync read errors
      localFails: false,       // local read errors
      deferSyncCb: null,       // fn(syncInvoke) to defer sync callback
      deferLocalCb: null,      // fn(localInvoke) to defer local callback
    },
    opts
  );

  const sendMessageCalls = [];
  let pendingResponseCb = null;
  const changeListeners = [];
  const copyHandlers = [];
  let reloadCount = 0;

  function makeArea(name, data, fails, defer) {
    return {
      get(_query, cb) {
        const invoke = () => {
          if (fails) {
            chrome.runtime.lastError = { message: name + ' read failed' };
            cb(undefined);
            chrome.runtime.lastError = null;
          } else {
            cb(JSON.parse(JSON.stringify(data)));
          }
        };
        if (defer) defer(invoke);
        else invoke();
      },
    };
  }

  const chrome = {
    runtime: {
      lastError: null,
      sendMessage(msg, cb) {
        sendMessageCalls.push(msg);
        pendingResponseCb = cb;
      },
    },
    storage: {
      sync: makeArea('sync', o.syncData, o.syncFails, o.deferSyncCb),
      local: makeArea('local', o.localData, o.localFails, o.deferLocalCb),
      onChanged: {
        addListener(fn) {
          changeListeners.push(fn);
        },
      },
    },
  };

  const window = {
    location: {
      reload() {
        reloadCount++;
      },
    },
  };
  const document = {
    addEventListener(type, fn) {
      if (type === 'copy') copyHandlers.push(fn);
    },
  };

  const ctx = vm.createContext({ chrome, window, document, setTimeout, clearTimeout });
  const srcPath = path.join(__dirname, '..', 'src', 'content', 'content.js');
  vm.runInContext(fs.readFileSync(srcPath, 'utf8'), ctx, { filename: 'content.js' });

  return {
    sendMessageCalls,
    changeListeners,
    copyHandlers,
    getMarker: () => window.__aiccMainWorldInjected === true,
    getReloadCount: () => reloadCount,
    respondOk() {
      const cb = pendingResponseCb;
      pendingResponseCb = null;
      if (cb) cb({ ok: true });
    },
    respondFail(reason) {
      const cb = pendingResponseCb;
      pendingResponseCb = null;
      if (cb) cb({ ok: false, error: reason || 'injection_failed' });
    },
    respondTransportError() {
      const cb = pendingResponseCb;
      pendingResponseCb = null;
      chrome.runtime.lastError = { message: 'message port closed' };
      if (cb) cb();
      chrome.runtime.lastError = null;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Background sandbox                                                  */
/* ------------------------------------------------------------------ */
function loadBackground(executeScriptImpl) {
  let onMessageListener = null;
  const chrome = {
    runtime: {
      onMessage: { addListener(fn) { onMessageListener = fn; } },
      onInstalled: { addListener(_fn) {} },
      lastError: null,
    },
    storage: {
      local: { get: (_d, cb) => cb({}), set: () => {} },
      sync: { get: (_d, cb) => cb({}), set: () => {} },
    },
  };
  if (executeScriptImpl) {
    chrome.scripting = { executeScript: executeScriptImpl };
  }
  const ctx = vm.createContext({ chrome, console });
  const srcPath = path.join(__dirname, '..', 'src', 'background', 'background.js');
  vm.runInContext(fs.readFileSync(srcPath, 'utf8'), ctx, { filename: 'background.js' });

  return {
    chrome,
    inject(sender, respond) {
      return onMessageListener({ action: 'inject_main_world' }, sender, respond);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */
(async () => {
  console.log('\ud83e\uddea Lifecycle regression tests (B001 storage race, B002 injection confirmation)\n');

  /* ---------------- B001 ---------------- */

  await it('B001: sync=false beats local=true when sync resolves first (no injection)', async () => {
    const s = loadContentScript({
      syncData: { autoCleanEnabled: false },
      localData: { autoCleanEnabled: true },
    });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 0, 'must NOT request MAIN-world hooks');
    assert.strictEqual(s.getMarker(), false, 'marker must stay unset');
    assert.strictEqual(s.getReloadCount(), 0);
    s.changeListeners.forEach((fn) =>
      fn({ autoCleanEnabled: { oldValue: false, newValue: true } }, 'sync')
    );
    assert.strictEqual(s.getReloadCount(), 1, 'reload expected when OFF->ON on sync area');
  });

  await it('B001: local resolving first cannot flip ON when sync says false (order-independent)', async () => {
    let releaseSync;
    const s = loadContentScript({
      syncData: { autoCleanEnabled: false },
      localData: { autoCleanEnabled: true },
      deferSyncCb: (invoke) => { releaseSync = invoke; },
    });
    await sleep(10);
    assert.strictEqual(s.sendMessageCalls.length, 0, 'no decision before authoritative sync read');
    releaseSync();
    await sleep(10);
    assert.strictEqual(s.sendMessageCalls.length, 0, 'sync=false must keep hooks off');
    assert.strictEqual(s.getMarker(), false);
  });

  await it('B001: sync=false + local key missing resolves OFF', async () => {
    const s = loadContentScript({
      syncData: { autoCleanEnabled: false },
      localData: {},
    });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 0);
  });

  await it('B001: sync key absent falls back to local=false (OFF)', async () => {
    const s = loadContentScript({
      syncData: {},
      localData: { autoCleanEnabled: false },
    });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 0, 'disabled via fallback');
  });

  await it('B001: sync key absent falls back to local=true (ON + injection)', async () => {
    const s = loadContentScript({
      syncData: {},
      localData: { autoCleanEnabled: true },
    });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 1, 'hooks requested');
    s.respondOk();
    await sleep(10);
    assert.strictEqual(s.getMarker(), true);
  });

  await it('B001: storage-read failure keeps safe pass-through (OFF, no injection)', async () => {
    const s = loadContentScript({ syncFails: true, localData: {} });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 0);
  });

  await it('B001: both reads failing keeps pass-through (OFF)', async () => {
    const s = loadContentScript({ syncFails: true, localFails: true });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 0);
    assert.strictEqual(s.getReloadCount(), 0);
  });

  await it('B001: onChanged ignores local-area flips, reacts only to sync area', async () => {
    const s = loadContentScript({
      syncData: { autoCleanEnabled: true },
      localData: { autoCleanEnabled: true },
    });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 1);
    s.changeListeners.forEach((fn) =>
      fn({ autoCleanEnabled: { oldValue: true, newValue: false } }, 'local')
    );
    assert.strictEqual(s.getReloadCount(), 0, 'local-area flip ignored');
    s.changeListeners.forEach((fn) =>
      fn({ autoCleanEnabled: { oldValue: true, newValue: false } }, 'sync')
    );
    assert.strictEqual(s.getReloadCount(), 1, 'sync-area flip honored');
  });

  /* ---------------- B002 ---------------- */

  await it('B002: marker set only after confirmed ok response', async () => {
    const s = loadContentScript({ syncData: { autoCleanEnabled: true } });
    await sleep(20);
    assert.strictEqual(s.sendMessageCalls.length, 1, 'request sent');
    assert.strictEqual(s.getMarker(), false, 'NOT marked before confirmation');
    s.respondOk();
    await sleep(10);
    assert.strictEqual(s.getMarker(), true, 'marked after confirmed success');
  });

  await it('B002: failed injection retries within bound and succeeds afterwards', async () => {
    const s = loadContentScript({ syncData: { autoCleanEnabled: true } });
    await sleep(20);
    s.respondTransportError(); // first attempt fails at transport level
    await sleep(10);
    assert.strictEqual(s.getMarker(), false);
    await sleep(1700); // wait out bounded retry backoff (1500ms default)
    assert.ok(s.sendMessageCalls.length >= 2, 'retry issued');
    s.respondOk();
    await sleep(10);
    assert.strictEqual(s.getMarker(), true, 'second attempt confirms success');
  });

  await it('B002: persistent failure stops after bounded retries, never marks injected', async () => {
    const s = loadContentScript({ syncData: { autoCleanEnabled: true } });
    await sleep(20);
    for (let i = 0; i < 3; i++) {
      if (s.sendMessageCalls.length > i) s.respondFail('boom');
      await sleep(1650);
    }
    const countAfterBound = s.sendMessageCalls.length;
    assert.ok(countAfterBound <= 3, `bounded at 3 attempts, got ${countAfterBound}`);
    assert.strictEqual(s.getMarker(), false, 'never falsely marked');
    await sleep(1650);
    assert.strictEqual(s.sendMessageCalls.length, countAfterBound, 'retry budget exhausted');
  });

  await it('B002 background: ok:true only after executeScript resolves, channel kept open', async () => {
    let resolveExec;
    const b = loadBackground(
      () => new Promise((res) => { resolveExec = res; })
    );
    const responses = [];
    const ret = b.inject({ tab: { id: 42 }, frameId: 0 }, (r) => responses.push(r));
    assert.strictEqual(ret, true, 'listener must keep the channel open');
    await sleep(10);
    assert.strictEqual(responses.length, 0, 'no premature success');
    resolveExec([]);
    await sleep(10);
    assert.strictEqual(responses.length, 1, 'exactly one response');
    assert.strictEqual(responses[0].ok, true, 'success only post-resolve');
  });

  await it('B002 background: rejection reports ok:false with error reason', async () => {
    let rejectExec;
    const b = loadBackground(
      () => new Promise((_res, rej) => { rejectExec = rej; })
    );
    const responses = [];
    b.inject({ tab: { id: 7 }, frameId: 0 }, (r) => responses.push(r));
    await sleep(10);
    rejectExec(new Error('cannot access contents of frame'));
    await sleep(10);
    assert.strictEqual(responses.length, 1);
    assert.strictEqual(responses[0].ok, false);
    assert.ok(/cannot access contents/.test(responses[0].error), 'reason surfaced');
  });

  await it('B002 background: unavailable chrome.scripting reports ok:false immediately', async () => {
    const b = loadBackground(null); // scripting API missing entirely
    const responses = [];
    const ret = b.inject({ tab: { id: 9 }, frameId: 0 }, (r) => responses.push(r));
    assert.strictEqual(ret, true);
    assert.strictEqual(responses.length, 1, 'immediate single response');
    assert.strictEqual(responses[0].ok, false);
    assert.strictEqual(responses[0].error, 'scripting_unavailable');
  });

  console.log(`\nLifecycle Test Results: ${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
