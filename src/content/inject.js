/** AI Copy Cleaner - MAIN world clipboard API interception (Passive, Immutable & Tamper-Resistant) */
(() => {
  'use strict';
  if (window.__aiCopyCleanerInjected) return;
  window.__aiCopyCleanerInjected = true;

  // Local immutable reference to sanitizer function
  const sanitize = typeof cleanAIHtml === 'function' ? cleanAIHtml : (typeof window !== 'undefined' ? window.cleanAIHtml : null);
  if (typeof sanitize !== 'function') return;

  // Chuẩn hóa dấu gạch nối AI (–, —, −) → '-'. Có thể đã được expose bởi sanitizer.js thông qua
  // window/globalThis, hoặc cùng context nếu inject.js chạy cùng isolated world. Tìm theo thứ tự:
  // globalThis → window. Guard typeof để tránh TypeError khi chưa load.
  const normalizeDashesFn = (typeof normalizeDashes === 'function' && normalizeDashes)
    || (typeof window !== 'undefined' && typeof window.normalizeDashes === 'function' && window.normalizeDashes)
    || null;

  const originalWrite = navigator.clipboard?.write;
  if (originalWrite) {
    navigator.clipboard.write = async function (items) {
      if (!Array.isArray(items)) {
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
              if (type === 'text/html') {
                types[type] = new Blob([cleaned], { type: 'text/html' });
              } else if (type === 'text/plain' && normalizeDashesFn) {
                // Áp dụng dash normalization cho text/plain blob (tránh gây trùng sanitize nếu text/plain
                // đã được xử lý ở content.js — hàm normalizeDashes idempotent)
                const plainBlob = await item.getType('text/plain');
                const plainRaw = await plainBlob.text();
                const plainCleaned = normalizeDashesFn(plainRaw);
                types[type] = new Blob([plainCleaned], { type: 'text/plain' });
              } else {
                types[type] = await item.getType(type);
              }
            }
            output.push(new ClipboardItem(types));
          } else if (item.types?.includes('text/plain') && normalizeDashesFn) {
            // Item không có text/html nhưng có text/plain (vd: chỉ text) — vẫn normalize dashes
            const types = {};
            for (const type of item.types) {
              if (type === 'text/plain') {
                const plainBlob = await item.getType('text/plain');
                const plainRaw = await plainBlob.text();
                types[type] = new Blob([normalizeDashesFn(plainRaw)], { type: 'text/plain' });
              } else {
                types[type] = await item.getType(type);
              }
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
      if (format === 'text/html' && typeof data === 'string') {
        try {
          const cleaned = sanitize(data);
          return originalSetData.call(this, format, cleaned);
        } catch (_) {
          return originalSetData.call(this, format, data);
        }
      }
      // Chuẩn hóa dấu gạch nối AI cho text/plain (–, —, −) → '-'. Áp dụng nếu helper đã sẵn sàng.
      if (format === 'text/plain' && typeof data === 'string' && normalizeDashesFn) {
        try {
          return originalSetData.call(this, format, normalizeDashesFn(data));
        } catch (_) {
          return originalSetData.call(this, format, data);
        }
      }
      return originalSetData.call(this, format, data);
    };
  }
})();
