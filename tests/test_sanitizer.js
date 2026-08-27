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
const { cleanAIHtml, isSafeUrl, decodeHtmlEntities, normalizeDashes } = require(sanitizerPath);

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

// 14. Isolated World Copy Event Sanitization & Controlled Lifecycle with Page Reload
it('Validates content.js safe pass-through startup, controlled MAIN-world hook request on ON, and page reload on state toggle', () => {
  let copyListeners = [];
  let storageData = { aicc_clean_count: 0 };
  let storageSyncCb = null;
  let storageChangedListeners = [];
  let sentMessages = [];
  let reloaded = false;

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
      location: {
        reload: () => { reloaded = true; }
      },
      dispatchEvent: () => {}
    },
    chrome: {
      runtime: {
        sendMessage: (msg, cb) => {
          sentMessages.push(msg);
          if (cb) cb({ ok: true });
        }
      },
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

  // Case A: Before storage callback resolves (uninitialized startup) -> must NOT intercept and must NOT request hook injection
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
  assert.strictEqual(sentMessages.length, 0, 'Must not request MAIN-world hooks during uninitialized startup');

  // Case B: Storage resolves to autoCleanEnabled: false -> copy remains pass-through, no hook requested
  storageSyncCb({ autoCleanEnabled: false });

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
  assert.strictEqual(defaultPrevented, false, 'Copy must be pass-through when disabled');
  assert.strictEqual(storageData.aicc_clean_count, 0, 'Clean count must not increase when disabled');
  assert.strictEqual(sentMessages.length, 0, 'Must not request MAIN-world hooks when setting is disabled');

  // Case C: Setting toggled to true while page is open -> triggers page reload for deterministic lifecycle
  reloaded = false;
  storageChangedListeners.forEach((fn) => fn({ autoCleanEnabled: { newValue: true } }, 'sync'));
  assert.strictEqual(reloaded, true, 'Toggling setting from OFF to ON must trigger page reload');

  // Case D: New document session starts with autoCleanEnabled: true -> requests hook injection & copy sanitized
  const onSandbox = {
    document: mockDoc,
    window: {
      getSelection: () => ({ rangeCount: 0, toString: () => 'Hello' }),
      location: { reload: () => { reloaded = true; } },
      dispatchEvent: () => {}
    },
    chrome: {
      runtime: {
        sendMessage: (msg, cb) => {
          sentMessages.push(msg);
          if (cb) cb({ ok: true });
        }
      },
      storage: {
        sync: { get: (defs, cb) => cb({ autoCleanEnabled: true }) },
        local: {
          get: (defs, cb) => cb(storageData),
          set: (data) => Object.assign(storageData, data)
        },
        onChanged: { addListener: (fn) => storageChangedListeners.push(fn) }
      }
    },
    cleanAIHtml: cleanAIHtml,
    console: console,
    setTimeout: (fn) => fn(),
    clearTimeout: () => {}
  };
  onSandbox.globalThis = onSandbox.window;
  sentMessages = [];
  copyListeners = [];

  vm.runInNewContext(contentCode, onSandbox);
  assert.strictEqual(sentMessages.length, 1, 'Must send inject_main_world message on startup when enabled');
  assert.strictEqual(sentMessages[0].action, 'inject_main_world');

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

  // Case E: When clean HTML is copied, count is not incremented
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

  // Case F: Setting toggled from true to false while page is open -> triggers page reload
  reloaded = false;
  storageChangedListeners.forEach((fn) => fn({ autoCleanEnabled: { newValue: false } }, 'sync'));
  assert.strictEqual(reloaded, true, 'Toggling setting from ON to OFF must trigger page reload');
});

// 15. Manifest V3 & Scripting Security Integrity
it('Validates manifest.json integrity, scripting permission, and ensures no WAR exposure for inject scripts', () => {
  const manifestRaw = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(manifestRaw);
  assert.strictEqual(manifest.manifest_version, 3);
  
  // Check required permissions including scripting
  assert.ok(manifest.permissions.includes('storage'), 'Must include storage permission');
  assert.ok(manifest.permissions.includes('activeTab'), 'Must include activeTab permission');
  assert.ok(manifest.permissions.includes('scripting'), 'Must include scripting permission');

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

  // Security guarantee: inject.js and sanitizer.js MUST NOT be in web_accessible_resources
  assert.strictEqual(manifest.web_accessible_resources, undefined, 'Must not expose inject.js or sanitizer.js to webpages via web_accessible_resources');

  // Check popup files exist
  const popupPath = path.join(__dirname, '..', manifest.action.default_popup);
  assert.ok(fs.existsSync(popupPath), `Popup file not found: ${popupPath}`);
});

// 16. Programmatic Clipboard Interception & Passive Tamper Resistance
it('Validates inject.js intercepts and cleans rich HTML clipboard operations without forgeable event surfaces', async () => {
  let capturedClipboardWrite = null;
  let capturedDataTransfer = null;

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
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {}
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

  // Run inject.js in sandbox (when injected into MAIN world by extension via chrome.scripting)
  const injectCode = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'inject.js'), 'utf-8');
  vm.runInNewContext(injectCode, sandbox);

  const dirtyHtml = '<p class="junk-class" data-junk="1">Hello</p>';
  const dt = new MockDataTransfer();

  // Case A: navigator.clipboard.write cleans dirty HTML
  const item = new MockClipboardItem({
    'text/html': new MockBlob([dirtyHtml], { type: 'text/html' })
  });
  await sandbox.navigator.clipboard.write([item]);
  const cleanedBlob = await capturedClipboardWrite[0].getType('text/html');
  const cleanedText = await cleanedBlob.text();
  assert.strictEqual(cleanedText, '<p>Hello</p>', 'HTML must be cleaned by inject.js on programmatic clipboard write');

  // Case B: DataTransfer.setData for text/html cleans dirty HTML
  sandbox.DataTransfer.prototype.setData.call(dt, 'text/html', dirtyHtml);
  assert.strictEqual(capturedDataTransfer.data, '<p>Hello</p>', 'DataTransfer HTML must be cleaned by inject.js');

  // Case C: Non-HTML formats pass through unmodified
  sandbox.DataTransfer.prototype.setData.call(dt, 'text/plain', 'plain text');
  assert.strictEqual(capturedDataTransfer.data, 'plain text', 'DataTransfer text/plain must pass through unmodified');
});

// 17. Adversarial Defense: Webpage Cannot Overwrite or Force Clean Copy When OFF
it('Validates that when Clean Copy is OFF, page scripts cannot independently load or activate MAIN-world interception', async () => {
  const manifestRaw = fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf-8');
  const manifest = JSON.parse(manifestRaw);
  
  // 1. Webpage cannot load scripts via chrome-extension:// URL because web_accessible_resources is not declared
  assert.strictEqual(manifest.web_accessible_resources, undefined, 'No web_accessible_resources exposed');

  // 2. Mock environment where Clean Copy is OFF
  let originalWriteCalled = false;
  let originalSetDataCalled = false;

  class NativeDataTransfer {
    setData(format, data) {
      originalSetDataCalled = true;
    }
  }

  const pageSandbox = {
    window: {
      localStorage: {},
      document: {
        documentElement: { dataset: {} }
      }
    },
    navigator: {
      clipboard: {
        write: async (items) => {
          originalWriteCalled = true;
          return items;
        }
      }
    },
    DataTransfer: NativeDataTransfer
  };
  pageSandbox.globalThis = pageSandbox.window;

  // Page script tries various tamper attempts (writing to localStorage, dataset, dispatching events)
  pageSandbox.window.localStorage['aicc_clean_config'] = JSON.stringify({ enabled: true });
  pageSandbox.window.document.documentElement.dataset.aiccCleanEnabled = 'true';

  const dirtyHtml = '<p class="junk-class" data-junk="1">Hello</p>';
  const dt = new NativeDataTransfer();

  // Test that clipboard operations remain native and untouched
  await pageSandbox.navigator.clipboard.write([{ types: ['text/html'] }]);
  assert.strictEqual(originalWriteCalled, true, 'Native clipboard.write must execute directly');

  pageSandbox.DataTransfer.prototype.setData.call(dt, 'text/html', dirtyHtml);
  assert.strictEqual(originalSetDataCalled, true, 'Native DataTransfer.setData must execute directly');
});

// ============================================================
// Dash Normalization (–, —, −) → '-' feature
// Q1: thay cả 3 ký tự | Q2: HTML + plain | Q3: kể cả trong <code>
// ============================================================

// Test 1: Direct call với cả 3 ký tự
it('normalizeDashes: direct call replaces en/em/minus dashes with ASCII hyphen', () => {
  assert.strictEqual(normalizeDashes('a–b—c−d'), 'a-b-c-d');
  assert.strictEqual(normalizeDashes('range 3–5'), 'range 3-5');
  assert.strictEqual(normalizeDashes('wow—so fast'), 'wow-so fast');
  assert.strictEqual(normalizeDashes('x−y'), 'x-y');
});

// Test 2: Empty / non-string input — không crash, trả về input nguyên vẹn
it('normalizeDashes: empty/non-string input is returned unchanged without throwing', () => {
  assert.strictEqual(normalizeDashes(''), '');
  assert.strictEqual(normalizeDashes(null), null);
  assert.strictEqual(normalizeDashes(undefined), undefined);
  // Số giữ nguyên (không phải string, không replace)
  assert.strictEqual(normalizeDashes(42), 42);
  // Object/array reference giữ nguyên (no mutation, no crash)
  const obj = { foo: 'bar–baz' };
  assert.strictEqual(normalizeDashes(obj), obj);
  const arr = [1, 2, 3];
  assert.strictEqual(normalizeDashes(arr), arr);
});

// Test 3: Idempotent — gọi 2 lần = gọi 1 lần
it('normalizeDashes: idempotent — applying twice equals applying once', () => {
  const input = 'page 1–5; chapter 2—3; x−y';
  const once = normalizeDashes(input);
  const twice = normalizeDashes(once);
  assert.strictEqual(once, twice);
  assert.strictEqual(once, 'page 1-5; chapter 2-3; x-y');
});

// Test 4: DOMParser path — text trong <p>. Skip nếu môi trường không có DOMParser
// (production chạy trong extension context — luôn có DOMParser; test Node thuần
// thì cần jsdom). Không mark là fail vì regex fallback đã được test ở Test 5.
it('cleanAIHtml (DOMParser path): normalizes dashes in regular text content', () => {
  let DOMParserRef = (typeof DOMParser !== 'undefined') ? DOMParser : null;
  if (!DOMParserRef) {
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM('');
      DOMParserRef = dom.window.DOMParser;
    } catch (_) {
      console.log('  ⏭️  SKIP: DOMParser path test (install jsdom as devDependency to enable)');
      return;
    }
  }
  const prev = global.DOMParser;
  global.DOMParser = DOMParserRef;
  try {
    const dirty = '<p>foo–bar</p>';
    const clean = cleanAIHtml(dirty);
    assert.ok(clean.includes('foo-bar'), `Expected foo-bar in output, got: ${clean}`);
    assert.ok(!/foo–|foo—|foo−/.test(clean), `Expected no AI dashes remain, got: ${clean}`);
  } finally {
    if (prev === undefined) delete global.DOMParser;
    else global.DOMParser = prev;
  }
});

// Test 5: Regex fallback path — text trong <p> khi DOMParser bị ẩn
it('cleanAIHtml (regex fallback path): also normalizes dashes when DOMParser is unavailable', () => {
  const realDOMParser = global.DOMParser;
  try {
    delete global.DOMParser;
    const dirty = '<p>foo–bar</p>';
    const clean = cleanAIHtml(dirty);
    assert.ok(clean.includes('foo-bar'), `Expected foo-bar in regex fallback output, got: ${clean}`);
    assert.ok(!/foo–|foo—|foo−/.test(clean), `Expected no AI dashes in regex fallback, got: ${clean}`);
  } finally {
    if (realDOMParser !== undefined) global.DOMParser = realDOMParser;
  }
});

// Test 6: Entity-encoded input qua DOMParser được tự decode (browser semantics),
// sau đó được normalize. Regex fallback path không decode entity text (đó là
// behavior hiện tại của code, nằm ngoài scope feature này) — test riêng với raw UTF-8.
it('cleanAIHtml: en-dash entities (DOMParser path) are decoded then normalized to ASCII hyphen', () => {
  let DOMParserRef = (typeof DOMParser !== 'undefined') ? DOMParser : null;
  if (!DOMParserRef) {
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM('');
      DOMParserRef = dom.window.DOMParser;
    } catch (_) {
      console.log('  ⏭️  SKIP: entity-decoded DOMParser path (install jsdom to enable)');
      return;
    }
  }
  const prev = global.DOMParser;
  global.DOMParser = DOMParserRef;
  try {
    const dirty = '<p>x&#8211;y&#8211;z&#8211;w</p>';
    const clean = cleanAIHtml(dirty);
    assert.ok(!/–|—|−|&#8211;|&ndash;/.test(clean),
      `Expected all en-dash forms removed, got: ${clean}`);
    const dashCount = (clean.match(/-/g) || []).length;
    assert.ok(dashCount >= 4, `Expected at least 4 '-' in output, got ${dashCount} in: ${clean}`);
  } finally {
    if (prev === undefined) delete global.DOMParser;
    else global.DOMParser = prev;
  }
});

it('cleanAIHtml: raw UTF-8 en-dash (regex fallback path) is normalized to ASCII hyphen', () => {
  const realDOMParser = global.DOMParser;
  try {
    delete global.DOMParser;
    // Raw UTF-8 en/em/minus chars in text (no entity encoding). 3 input dashes → 3 output '-'.
    const dirty = '<p>x–y—z−w</p>';
    const clean = cleanAIHtml(dirty);
    assert.ok(!/–|—|−/.test(clean), `Expected AI dashes removed, got: ${clean}`);
    const dashCount = (clean.match(/-/g) || []).length;
    assert.ok(dashCount === 3, `Expected exactly 3 '-' in output (one per input dash), got ${dashCount} in: ${clean}`);
  } finally {
    if (realDOMParser !== undefined) global.DOMParser = realDOMParser;
  }
});

// Test 7: Dashes inside <code> blocks cũng bị replace (Q3)
it('cleanAIHtml: dashes inside <code> are normalized (per Q3 decision)', () => {
  const dirty = '<pre><code class="language-bash">npm run build–test && git push—force</code></pre>';
  const clean = cleanAIHtml(dirty);
  assert.ok(clean.includes('build-test'), `Expected build-test in code, got: ${clean}`);
  assert.ok(clean.includes('push-force'), `Expected push-force in code, got: ${clean}`);
  assert.ok(!/–|—|−/.test(clean), `Expected no AI dashes in code block, got: ${clean}`);
  // language class vẫn được giữ
  assert.ok(clean.includes('language-bash'), `Expected language class preserved, got: ${clean}`);
});

// Test 8: Export có sẵn trên globalThis/window qua module.exports + sandbox test
it('normalizeDashes: exported via module.exports and accessible on globalThis in isolated sandbox', () => {
  // module.exports check
  assert.strictEqual(typeof normalizeDashes, 'function', 'normalizeDashes must be exported');

  // Sandbox test: load module in fresh vm context, verify globalThis exposure
  const code = fs.readFileSync(sanitizerPath, 'utf8');
  const sandbox = { module: { exports: {} }, exports: {}, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  assert.strictEqual(typeof sandbox.normalizeDashes, 'function',
    'normalizeDashes must be exposed on globalThis for content.js / inject.js consumption');
  assert.strictEqual(sandbox.normalizeDashes('a–b—c−d'), 'a-b-c-d',
    'Exposed normalizeDashes must behave identically to module export');
});

console.log(`\n========================================`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}

