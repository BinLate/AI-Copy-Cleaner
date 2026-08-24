/** AI Copy Cleaner - MAIN world clipboard API interception (Private MessagePort & Safe Startup) */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  // Local immutable reference to sanitizer function
  const sanitize = typeof cleanAIHtml === 'function' ? cleanAIHtml : (typeof window !== 'undefined' ? window.cleanAIHtml : null);
  if (typeof sanitize !== 'function') return;

  // Safe default: pass-through until trusted extension storage state is pushed via private MessagePort
  let enabledState = false;

  // Receive private point-to-point MessagePort from content script
  const handlePortInit = (event) => {
    if (event.data === '__aicc_init_port__' && event.ports?.[0]) {
      const port = event.ports[0];
      port.onmessage = (e) => {
        if (typeof e.data?.enabled === 'boolean') {
          enabledState = e.data.enabled;
        }
      };
      window.removeEventListener('message', handlePortInit);
    }
  };
  window.addEventListener('message', handlePortInit);

  const originalWrite = navigator.clipboard?.write;
  if (originalWrite) {
    navigator.clipboard.write = async function (items) {
      if (!Array.isArray(items) || !enabledState) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
      try {
        const output = [];
        for (const item of items) {
          if (item.types?.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const raw = await htmlBlob.text();
            const cleaned = sanitize(raw);
            const types = {};
            for (const type of item.types) {
              types[type] = type === 'text/html' ? new Blob([cleaned], { type: 'text/html' }) : await item.getType(type);
            }
            output.push(new ClipboardItem(types));
          } else {
            output.push(item);
          }
        }
        return originalWrite.call(navigator.clipboard, output);
      } catch (_) {
        return originalWrite.apply(navigator.clipboard, arguments);
      }
    };
  }

  const originalSetData = window.DataTransfer?.prototype?.setData;
  if (originalSetData) {
    DataTransfer.prototype.setData = function (format, data) {
      if (enabledState && format === 'text/html' && typeof data === 'string') {
        const cleaned = sanitize(data);
        return originalSetData.call(this, format, cleaned);
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
