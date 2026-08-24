/**
 * Comprehensive Automated Unit, Integration & Differential Security Test Suite for AI Copy Cleaner
 */
// E2E Test Run: Testing gemini-and-chatgpt automated workflow
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Mock DataTransfer for Node environment
global.DataTransfer = class DataTransfer {
  constructor() {
    this.data = {};
  }
  setData(format, data) {
    this.data[format] = data;
  }
  getData(format) {
    return this.data[format];
  }
};

// Load sanitizer module
const sanitizerPath = path.join(__dirname, '..', 'src', 'utils', 'sanitizer.js');
const { cleanAIHtml, isSafeUrl, decodeHtmlEntities } = require(sanitizerPath);

console.log('🧪 Starting AI Copy Cleaner Full Verification, Parity & Security Test Suite...\n');

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// 1. ChatGPT tests
it('Cleans ChatGPT paragraph with data-* and random classes', () => {
  const dirty = '<p class="whitespace-pre-wrap font-sans text-base" data-message-author-role="assistant" data-message-id="123">Xin chào <strong>thế giới</strong>!</p>';
  const clean = cleanAIHtml(dirty);
  assert.strictEqual(clean, '<p>Xin chào <strong>thế giới</strong>!</p>');
});

// 2. Gemini tests & UI overlay removal
it('Cleans Gemini output and removes UI overlay containers and badges', () => {
  const dirty = '<div class="model-response-text" data-turn-id="abc"><p>Nội dung phản hồi</p><div class="overlay-container hero-overlay-container"></div></div>';
  const clean = cleanAIHtml(dirty);
  assert.ok(!clean.includes('data-turn-id'));
  assert.ok(!clean.includes('overlay-container'));
  assert.ok(clean.includes('<p>Nội dung phản hồi</p>'));
});

// 3. Claude & DeepSeek code block tests
it('Preserves language-* classes on <code> tags while stripping copy buttons and UI junk', () => {
  const dirty = '<pre class="bg-black rounded-md"><div class="code-header"><button class="copy-code-button">Sao chép</button></div><code class="hljs language-python p-4 text-sm" data-highlighted="yes">print("Hello Antigravity")</code></pre>';
  const clean = cleanAIHtml(dirty);
  assert.ok(clean.includes('<code class="language-python">'), `Expected language-python class in ${clean}`);
  assert.ok(!clean.includes('Sao chép'), `Expected copy button removed in ${clean}`);
  assert.ok(!clean.includes('data-highlighted'), `Expected data attribute removed in ${clean}`);
  assert.ok(!clean.includes('hljs'), `Expected hljs removed from code class in ${clean}`);
});

// 4. Perplexity citation removal
it('Strips Perplexity & AI Studio citation tags and empty SVG buttons', () => {
  const dirty = '<p>Thuyết tương đối rộng do Einstein đề xuất <button class="citation-tag">[1]</button><svg class="icon"><path d="M0 0"/></svg>.</p>';
  const clean = cleanAIHtml(dirty);
  assert.ok(!clean.includes('[1]'), `Expected citation tag removed in ${clean}`);
  assert.ok(!clean.includes('<svg'), `Expected empty SVG removed in ${clean}`);
  assert.ok(clean.includes('Thuyết tương đối rộng do Einstein đề xuất'));
});

// 5. Table formatting preservation
it('Preserves table structure and colspan/rowspan attributes while stripping arbitrary attributes', () => {
  const dirty = '<table class="min-w-full border" style="width: 100%" foo="bar"><tr class="bg-gray-100"><th colspan="2" class="p-2 border" nonce="123">Tiêu đề</th></tr><tr><td rowspan="2" class="p-2 border">Ô 1</td><td class="p-2">Ô 2</td></tr></table>';
  const clean = cleanAIHtml(dirty);
  assert.ok(clean.includes('<th colspan="2">Tiêu đề</th>'), `Expected th with colspan in ${clean}`);
  assert.ok(clean.includes('<td rowspan="2">Ô 1</td>'), `Expected td with rowspan in ${clean}`);
  assert.ok(!clean.includes('style='), `Expected style removed in ${clean}`);
  assert.ok(!clean.includes('class='), `Expected class removed in ${clean}`);
  assert.ok(!clean.includes('foo='), `Expected arbitrary foo= attribute removed in ${clean}`);
  assert.ok(!clean.includes('nonce='), `Expected nonce= attribute removed in ${clean}`);
});

// 6. Safe Links and Images
it('Preserves safe href, target, title, rel on <a> and safe src, alt on <img>', () => {
  const dirty = '<p><a href="https://deepmind.google" target="_blank" title="DeepMind" rel="noopener" formaction="https://bad.com" class="text-blue-500 underline" data-click-id="xyz">Google DeepMind</a> <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" alt="Dot" crossorigin="anonymous" /></p>';
  const clean = cleanAIHtml(dirty);
  assert.ok(clean.includes('href="https://deepmind.google"'));
  assert.ok(clean.includes('target="_blank"'));
  assert.ok(clean.includes('title="DeepMind"'));
  assert.ok(clean.includes('rel="noopener"'));
  assert.ok(!clean.includes('formaction='), `Expected formaction removed in ${clean}`);
  assert.ok(!clean.includes('crossorigin='), `Expected crossorigin removed in ${clean}`);
  assert.ok(clean.includes('src="data:image/png;base64,'));
  assert.ok(clean.includes('alt="Dot"'));
});

// 7. Security: Attribute injection through href and src escaping
it('Prevents attribute injection in href and src by escaping double quotes', () => {
  const injection = '<a href=\'https://safe.example/" onclick="alert(1)\'>Link</a><img src=\'https://safe.example/img.png" onerror="alert(2)\' alt="Test" />';
  const clean = cleanAIHtml(injection);
  assert.ok(!clean.includes('onclick="alert(1)"'), `onclick injected: ${clean}`);
  assert.ok(!clean.includes('onerror="alert(2)"'), `onerror injected: ${clean}`);
  assert.ok(clean.includes('&quot;'), `Expected double quote escaped to &quot;: ${clean}`);
});

// 8. Security: Hyphenated, custom and namespaced/colon tags attribute sanitization
it('Sanitizes custom, hyphenated and colon-namespaced element tags by stripping all attributes', () => {
  const custom = '<x-custom-tag onclick="alert(1)" foo="bar"><x:custom onclick="alert(2)" data-test="yes"><my-element class="bad">Text</my-element></x:custom></x-custom-tag>';
  const clean = cleanAIHtml(custom);
  assert.strictEqual(clean, '<x-custom-tag><x:custom><my-element>Text</my-element></x:custom></x-custom-tag>');
});

// 9. Parity & Spec: Duplicate attributes handling (first occurrence retained, subsequent ignored)
it('Handles duplicate attributes following HTML parser specification (first occurrence wins)', () => {
  const duplicateHref1 = '<a href="javascript:alert(1)" href="https://example.com">x</a>';
  const clean1 = cleanAIHtml(duplicateHref1);
  assert.strictEqual(clean1, '<a>x</a>', `First href was unsafe, subsequent href must be ignored: ${clean1}`);

  const duplicateHref2 = '<a href="https://example.com" href="javascript:alert(1)">x</a>';
  const clean2 = cleanAIHtml(duplicateHref2);
  assert.strictEqual(clean2, '<a href="https://example.com">x</a>', `First href was safe, subsequent href must be ignored: ${clean2}`);

  const duplicateTarget = '<a target="_blank" target="_self">x</a>';
  const cleanTarget = cleanAIHtml(duplicateTarget);
  assert.strictEqual(cleanTarget, '<a target="_blank">x</a>', `First target must be retained: ${cleanTarget}`);

  const duplicateImg = '<img src="javascript:x" src="https://example.com/x.png">';
  const cleanImg = cleanAIHtml(duplicateImg);
  assert.strictEqual(cleanImg, '<img>', `First unsafe src must cause src to be removed: ${cleanImg}`);
});

// 10. Parity & Security: Comprehensive Character Reference & Entity Decoding
it('Decodes semicolonless, hex, decimal and named character references in URLs before safety validation', () => {
  const decSemi = '<a href="https&#58;//example.com">x</a>';
  assert.strictEqual(cleanAIHtml(decSemi), '<a href="https://example.com">x</a>');

  const decNoSemi = '<a href="https&#58//example.com">x</a>';
  assert.strictEqual(cleanAIHtml(decNoSemi), '<a href="https://example.com">x</a>');

  const hexSemi = '<a href="https&#x3a;//example.com">x</a>';
  assert.strictEqual(cleanAIHtml(hexSemi), '<a href="https://example.com">x</a>');

  const hexNoSemi = '<a href="https&#x3a//example.com">x</a>';
  assert.strictEqual(cleanAIHtml(hexNoSemi), '<a href="https://example.com">x</a>');

  const namedEntities = '<a href="https&colon;&sol;&sol;example.com">x</a>';
  assert.strictEqual(cleanAIHtml(namedEntities), '<a href="https://example.com">x</a>');

  const tabEntity = '<a href="https&Tab;://example.com">x</a>';
  assert.strictEqual(cleanAIHtml(tabEntity), '<a href="https://example.com">x</a>');

  const maliciousDec = '<a href="jav&#97;script:alert(1)">bad</a>';
  assert.strictEqual(cleanAIHtml(maliciousDec), '<a>bad</a>');

  const maliciousHex = '<a href="jav&#x61;script:alert(1)">bad</a>';
  assert.strictEqual(cleanAIHtml(maliciousHex), '<a>bad</a>');
});

// 11. Security: Rejects non-allowlisted schemes (file:, ftp:, chrome-extension:, javascript:, data:text/html)
it('Strictly rejects file:, ftp:, chrome-extension:, javascript:, data:text/html and inline event handlers', () => {
  const malicious = '<p><a href="file:///C:/Windows/system32">File</a><a href="ftp://example.com">FTP</a><a href="chrome-extension://xyz/evil.js">Ext</a><img src="data:image/svg+xml;base64,PHN2Zz4=" /><a href="javascript:alert(1)">Click</a><img src="data:text/html,<script>alert(1)</script>" onerror="alert(2)" /><object data="evil.swf"></object><meta http-equiv="refresh" content="0;url=evil.com"></p>';
  const clean = cleanAIHtml(malicious);
  assert.ok(!clean.includes('file:///'), `file: scheme must be rejected: ${clean}`);
  assert.ok(!clean.includes('ftp://'), `ftp: scheme must be rejected: ${clean}`);
  assert.ok(!clean.includes('chrome-extension://'), `chrome-extension: must be rejected: ${clean}`);
  assert.ok(!clean.includes('data:image/svg'), `data:image/svg+xml must be rejected: ${clean}`);
  assert.ok(!clean.includes('javascript:'), `javascript: must be rejected: ${clean}`);
  assert.ok(!clean.includes('data:text/html'), `data:text/html must be rejected: ${clean}`);
  assert.ok(!clean.includes('onerror'), `onerror must be stripped: ${clean}`);
  assert.ok(!clean.includes('<object'), `<object> tag must be stripped: ${clean}`);
  assert.ok(!clean.includes('<meta'), `<meta> tag must be stripped: ${clean}`);
});

// 12. Security Review B001: Strips <template> tags and dangerous nested template content
it('Strips <template> tags and prevents dangerous nested elements inside templates', () => {
  const templatePayload = '<p>Safe before</p><template><img src="x" onerror="alert(1)"><script>alert(2)</script><p>Inside template</p></template><p>Safe after</p>';
  const clean = cleanAIHtml(templatePayload);
  assert.ok(!clean.includes('<template'), `<template> must be completely stripped: ${clean}`);
  assert.ok(!clean.includes('onerror'), `onerror inside template must be removed: ${clean}`);
  assert.ok(!clean.includes('<script'), `<script> inside template must be removed: ${clean}`);
  assert.ok(clean.includes('<p>Safe before</p>'));
  assert.ok(clean.includes('<p>Safe after</p>'));
});

// 13. Security Review B002: Tamper Resistance and API Immutability
it('Ensures sanitizer functions cannot be mutated or overridden on globalThis', () => {
  const originalClean = globalThis.cleanAIHtml;
  assert.strictEqual(typeof originalClean, 'function');
  try {
    globalThis.cleanAIHtml = () => 'hacked';
  } catch (_) {}
  assert.strictEqual(globalThis.cleanAIHtml, originalClean, 'globalThis.cleanAIHtml must be immutable');
});

// 14. Isolated World Copy Event Sanitization & Safe Startup
it('Validates content.js is safe pass-through before storage resolution and sanitizes when enabled', () => {
  let copyListeners = [];
  let storageData = { aicc_clean_count: 0 };
  let storageSyncCb = null;
  let storageChangedListeners = [];

  const mockDoc = {
    addEventListener: (type, fn) => {
      if (type === 'copy') copyListeners.push(fn);
    },
    getElementById: () => null,
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      appendChild: () => {},
      getBoundingClientRect: () => ({})
    }),
    head: { appendChild: () => {} },
    documentElement: { appendChild: () => {} }
  };

  const contentSandbox = {
    document: mockDoc,
    window: {
      getSelection: () => ({
        rangeCount: 0,
        toString: () => 'Hello'
      }),
      dispatchEvent: () => {}
    },
    chrome: {
      storage: {
        sync: {
          get: (defs, cb) => { storageSyncCb = cb; } // Deferred to test uninitialized state
        },
        local: {
          get: (defs, cb) => cb(storageData),
          set: (data) => Object.assign(storageData, data)
        },
        onChanged: {
          addListener: (fn) => storageChangedListeners.push(fn)
        }
      }
    },
    cleanAIHtml: cleanAIHtml,
    console: console,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {}
  };
  contentSandbox.globalThis = contentSandbox.window;

  const contentCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'content.js'), 'utf-8');
  vm.runInNewContext(contentCode, contentSandbox);

  const dirtyHtml = '<p class="junk-class" data-junk="1">Hello</p>';

  // Case A: Before storage callback resolves (uninitialized startup) -> must NOT intercept (fail safe pass-through)
  let clipboardSetData = {};
  let defaultPrevented = false;
  const fakeCopyUninit = {
    clipboardData: {
      getData: (fmt) => (fmt === 'text/html' ? dirtyHtml : ''),
      setData: (fmt, val) => { clipboardSetData[fmt] = val; }
    },
    preventDefault: () => { defaultPrevented = true; }
  };

  copyListeners.forEach((fn) => fn(fakeCopyUninit));
  assert.strictEqual(defaultPrevented, false, 'Uninitialized copy must be pass-through without intercepting');
  assert.strictEqual(storageData.aicc_clean_count, 0, 'Clean count must not increase when uninitialized');

  // Resolve storage to enabled: true
  storageSyncCb({ autoCleanEnabled: true });

  // Case B: When enabled and resolved, dirty HTML is sanitized on copy
  clipboardSetData = {};
  defaultPrevented = false;
  const fakeCopyEnabled = {
    clipboardData: {
      getData: (fmt) => (fmt === 'text/html' ? dirtyHtml : ''),
      setData: (fmt, val) => { clipboardSetData[fmt] = val; }
    },
    preventDefault: () => { defaultPrevented = true; }
  };

  copyListeners.forEach((fn) => fn(fakeCopyEnabled));
  assert.strictEqual(defaultPrevented, true, 'Default copy must be intercepted when enabled');
  assert.strictEqual(clipboardSetData['text/html'], '<p>Hello</p>', 'Sanitized HTML placed on clipboard');
  assert.strictEqual(storageData.aicc_clean_count, 1, 'Clean count incremented when HTML was modified');

  // Case C: When clean HTML is copied, count is not incremented
  const cleanHtml = '<p>Hello</p>';
  clipboardSetData = {};
  defaultPrevented = false;
  const fakeCopyClean = {
    clipboardData: {
      getData: (fmt) => (fmt === 'text/html' ? cleanHtml : ''),
      setData: (fmt, val) => { clipboardSetData[fmt] = val; }
    },
    preventDefault: () => { defaultPrevented = true; }
  };

  copyListeners.forEach((fn) => fn(fakeCopyClean));
  assert.strictEqual(storageData.aicc_clean_count, 1, 'Clean count must not increase for already clean HTML');

  // Case D: When disabled via storage, copy is not intercepted
  storageChangedListeners.forEach((fn) => fn({ autoCleanEnabled: { newValue: false } }));
  clipboardSetData = {};
  defaultPrevented = false;
  const fakeCopyDisabled = {
    clipboardData: {
      getData: (fmt) => (fmt === 'text/html' ? dirtyHtml : ''),
      setData: (fmt, val) => { clipboardSetData[fmt] = val; }
    },
    preventDefault: () => { defaultPrevented = true; }
  };

  copyListeners.forEach((fn) => fn(fakeCopyDisabled));
  assert.strictEqual(defaultPrevented, false, 'Default copy must not be intercepted when disabled');
  assert.strictEqual(storageData.aicc_clean_count, 1, 'Clean count must not increase when disabled');
});

// 15. Manifest V3 & Codebase Reference Integrity
it('Validates manifest.json integrity and ensures all referenced files exist', () => {
  const manifestRaw = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(manifestRaw);
  assert.strictEqual(manifest.manifest_version, 3);
  
  // Check host permissions
  const requiredHosts = [
    'https://chatgpt.com/*',
    'https://chat.openai.com/*',
    'https://gemini.google.com/*',
    'https://claude.ai/*',
    'https://chat.deepseek.com/*',
    'https://aistudio.google.com/*',
    'https://*.perplexity.ai/*',
    'https://copilot.microsoft.com/*'
  ];
  for (const host of requiredHosts) {
    assert.ok(manifest.host_permissions.includes(host), `Missing host permission: ${host}`);
  }

  // Check background service worker exists
  const swPath = path.join(__dirname, '..', manifest.background.service_worker);
  assert.ok(fs.existsSync(swPath), `Service worker not found: ${swPath}`);

  // Check all content script files exist
  for (const cs of manifest.content_scripts) {
    for (const jsFile of cs.js) {
      const fullPath = path.join(__dirname, '..', jsFile);
      assert.ok(fs.existsSync(fullPath), `Content script not found: ${fullPath}`);
    }
  }

  // Check popup files exist
  const popupPath = path.join(__dirname, '..', manifest.action.default_popup);
  assert.ok(fs.existsSync(popupPath), `Popup file not found: ${popupPath}`);
});

// 16. Programmatic Clipboard Interception & Bridge Handshake Pairing
it('Validates inject.js pairs once at startup, safely passes through when uninitialized, and rejects forged sync events', async () => {
  let capturedClipboardWrite = null;
  let capturedDataTransfer = null;
  let eventListeners = [];

  class MockDataTransfer {
    setData(format, data) {
      capturedDataTransfer = { format, data };
    }
  }

  class MockBlob {
    constructor(parts, opts) {
      this.parts = parts;
      this.type = opts?.type;
    }
    async text() {
      return this.parts.join('');
    }
  }

  class MockClipboardItem {
    constructor(types) {
      this.types = Object.keys(types);
      this._types = types;
    }
    async getType(t) {
      return this._types[t];
    }
  }

  const sandbox = {
    window: {
      addEventListener: (type, fn, opts) => {
        eventListeners.push({ type, fn, once: !!opts?.once });
      },
      dispatchEvent: (e) => {
        const matching = eventListeners.filter(l => l.type === e.type);
        matching.forEach(l => {
          l.fn(e);
          if (l.once) {
            const idx = eventListeners.indexOf(l);
            if (idx !== -1) eventListeners.splice(idx, 1);
          }
        });
      }
    },
    navigator: {
      clipboard: {
        write: async (items) => {
          capturedClipboardWrite = items;
          return items;
        }
      }
    },
    DataTransfer: MockDataTransfer,
    Blob: MockBlob,
    ClipboardItem: MockClipboardItem,
    cleanAIHtml: cleanAIHtml,
    console: console
  };
  sandbox.window.DataTransfer = MockDataTransfer;
  sandbox.globalThis = sandbox.window;

  // Run inject.js in sandbox
  const injectCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'inject.js'), 'utf-8');
  vm.runInNewContext(injectCode, sandbox);

  const validToken = 'secret_session_uuid_12345';
  const dirtyHtml = '<p class="junk-class" data-junk="1">Hello</p>';
  const dt = new MockDataTransfer();

  // Case A: Uninitialized state before pairing -> pass-through (fails safe)
  const itemUninit = new MockClipboardItem({
    'text/html': new MockBlob([dirtyHtml], { type: 'text/html' })
  });
  await sandbox.navigator.clipboard.write([itemUninit]);
  const uninitBlob = await capturedClipboardWrite[0].getType('text/html');
  const uninitText = await uninitBlob.text();
  assert.strictEqual(uninitText, dirtyHtml, 'Uninitialized inject.js must be pass-through without modifying HTML');

  sandbox.DataTransfer.prototype.setData.call(dt, 'text/html', dirtyHtml);
  assert.strictEqual(capturedDataTransfer.data, dirtyHtml, 'DataTransfer uninitialized must be pass-through');

  // Case B: One-time pairing handshake from content script
  sandbox.window.dispatchEvent({
    type: '__aicc_pair_bridge__',
    detail: { key: validToken, enabled: false }
  });

  // Hostile script attempts second pairing attempt with a hostile key -> must be ignored because listener was once: true
  sandbox.window.dispatchEvent({
    type: '__aicc_pair_bridge__',
    detail: { key: 'hostile_key_stolen', enabled: true }
  });

  // Hostile script attempts sync with hostile key -> rejected
  sandbox.window.dispatchEvent({
    type: '__aicc_sync_bridge__',
    detail: { key: 'hostile_key_stolen', enabled: true }
  });

  capturedClipboardWrite = null;
  await sandbox.navigator.clipboard.write([itemUninit]);
  const ignoredBlob = await capturedClipboardWrite[0].getType('text/html');
  const ignoredText = await ignoredBlob.text();
  assert.strictEqual(ignoredText, dirtyHtml, 'Forged sync with invalid key must be rejected');

  // Case C: Trusted sync event from content script with validToken -> enables sanitization
  sandbox.window.dispatchEvent({
    type: '__aicc_sync_bridge__',
    detail: { key: validToken, enabled: true }
  });

  capturedClipboardWrite = null;
  capturedDataTransfer = null;
  const itemEnabled = new MockClipboardItem({
    'text/html': new MockBlob([dirtyHtml], { type: 'text/html' })
  });
  await sandbox.navigator.clipboard.write([itemEnabled]);
  const cleanedBlob = await capturedClipboardWrite[0].getType('text/html');
  const cleanedText = await cleanedBlob.text();
  assert.strictEqual(cleanedText, '<p>Hello</p>', 'HTML must be cleaned when enabled via trusted bridge sync');

  sandbox.DataTransfer.prototype.setData.call(dt, 'text/html', dirtyHtml);
  assert.strictEqual(capturedDataTransfer.data, '<p>Hello</p>', 'DataTransfer HTML must be sanitized when enabled via trusted sync');

  // Case D: Trusted sync event disabling -> pass-through
  sandbox.window.dispatchEvent({
    type: '__aicc_sync_bridge__',
    detail: { key: validToken, enabled: false }
  });

  capturedClipboardWrite = null;
  capturedDataTransfer = null;
  const itemDisabled = new MockClipboardItem({
    'text/html': new MockBlob([dirtyHtml], { type: 'text/html' })
  });
  await sandbox.navigator.clipboard.write([itemDisabled]);
  const disabledBlob = await capturedClipboardWrite[0].getType('text/html');
  const disabledText = await disabledBlob.text();
  assert.strictEqual(disabledText, dirtyHtml, 'HTML must remain unchanged when disabled via trusted bridge sync');

  sandbox.DataTransfer.prototype.setData.call(dt, 'text/html', dirtyHtml);
  assert.strictEqual(capturedDataTransfer.data, dirtyHtml, 'DataTransfer must not sanitize when disabled via trusted sync');
});

console.log(`\n========================================`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}

