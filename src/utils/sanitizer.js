/**
 * AI-Copy-Cleaner Sanitizer Module
 * Bóc tách triệt để thuộc tính, class rác, nút bấm copy, overlay UI từ ChatGPT, Gemini, Claude, DeepSeek, AI Studio, Perplexity, Copilot
 * BẢO TỒN 100% CẤU TRÚC THẺ HTML (<p>, <h1>-<h6>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <code>...)
 * BẢO TỒN class nhận diện ngôn ngữ lập trình trên thẻ <code> (vd: class="language-python")
 * BẢO VỆ AN NINH: 100% Strict Tag & Attribute Allowlist Parity giữa DOMParser và Regex Fallback
 */

const LANGUAGE_CLASS_REGEX = /(?:language|lang|hljs)-([a-zA-Z0-9_+-]+)/i;
const JUNK_OVERLAY_REGEX = /(?:overlay-container|hero-overlay-container|spark-licensed-center|citation-tag|copy-code-button|code-header|action-bar|feedback-container)/i;
const SAFE_LINK_REGEX = /^(?:https?:\/\/|mailto:|tel:|#|\/|\.\/|\.\.\/)/i;
// Chỉ cho phép ảnh raster tĩnh an toàn (png, jpeg, jpg, webp, gif) - Chặn SVG data URIs chống XSS
const SAFE_IMAGE_REGEX = /^(?:https?:\/\/|\/|data:image\/(?:png|jpeg|jpg|webp|gif);base64,)/i;

/**
 * Chuẩn hóa dấu gạch nối AI: thay thế en-dash (U+2013), em-dash (U+2014), Unicode minus (U+2212) bằng ASCII hyphen '-'.
 * Áp dụng cho cả văn bản thường và nội dung trong <code> để đảm bảo CLI flags/identifiers luôn dùng dấu '-'.
 * - Không thay đổi các dấu gạch ngang khác (U+2010 hyphen, U+2011 non-breaking hyphen, U+2015 horizontal bar).
 * - Hàm pure: không thay đổi input nếu không phải chuỗi hoặc rỗng, idempotent khi gọi nhiều lần.
 */
const DASH_CHARS_REGEX = /[\u2013\u2014\u2212]/g;
function normalizeDashes(s) {
  if (typeof s !== 'string' || s.length === 0) return s;
  return s.replace(DASH_CHARS_REGEX, '-');
}

// Strict Allowlist thuộc tính theo thẻ áp dụng đồng nhất cho cả DOM và Regex fallback
const ALLOWED_ATTRIBUTES = {
  a: new Set(['href', 'target', 'title', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  table: new Set(['colspan', 'rowspan', 'align']),
  th: new Set(['colspan', 'rowspan', 'align']),
  td: new Set(['colspan', 'rowspan', 'align']),
  tr: new Set(['colspan', 'rowspan', 'align']),
  code: new Set(['class'])
};

// Từ điển Named Character References phổ biến trong HTML5
const NAMED_ENTITIES = {
  '&quot;': '"', '&quot': '"',
  '&apos;': "'", '&apos': "'",
  '&amp;': '&', '&amp': '&',
  '&lt;': '<', '&lt': '<',
  '&gt;': '>', '&gt': '>',
  '&colon;': ':', '&colon': ':',
  '&sol;': '/', '&sol': '/',
  '&bsol;': '\\', '&bsol': '\\',
  '&tab;': '\t', '&tab': '\t',
  '&newline;': '\n', '&newline': '\n',
  '&nbsp;': ' ', '&nbsp': ' '
};

/**
 * Giải mã toàn diện HTML Character References (numeric decimal/hex có hoặc không có dấu chấm phẩy, named entities)
 */
function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  let res = str;

  // 1. Giải mã Hexadecimal numeric references (có hoặc không có ';')
  res = res.replace(/&#x([0-9a-fA-F]+);?/gi, (_, hex) => {
    const code = parseInt(hex, 16);
    return isNaN(code) ? '' : String.fromCodePoint(code);
  });

  // 2. Giải mã Decimal numeric references (có hoặc không có ';')
  res = res.replace(/&#([0-9]+);?/g, (_, dec) => {
    const code = parseInt(dec, 10);
    return isNaN(code) ? '' : String.fromCodePoint(code);
  });

  // 3. Giải mã Named entities
  res = res.replace(/&[a-zA-Z0-9]+;?/g, (match) => {
    const lower = match.toLowerCase();
    return NAMED_ENTITIES[lower] !== undefined ? NAMED_ENTITIES[lower] : match;
  });

  return res;
}

/**
 * Chuẩn hóa URL theo chuẩn WHATWG (loại bỏ khoảng trắng / control characters nhúng)
 */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const decoded = decodeHtmlEntities(url);
  return decoded.trim().replace(/[\x00-\x1F\x7F-\x9F\s]/g, '');
}

/**
 * Kiểm tra URL an toàn chống tấn công XSS / Script Injection
 * Chỉ cho phép https, http, mailto, tel, relative path (#, /, ./) cho liên kết
 * Chỉ cho phép https, http, relative path và safe base64 raster data URIs cho hình ảnh
 */
function isSafeUrl(url, isImage = false) {
  if (!url || typeof url !== 'string') return false;
  const normalized = normalizeUrl(url).toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('ftp:') ||
    normalized.startsWith('chrome-extension:') ||
    normalized.startsWith('moz-extension:') ||
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('data:image/svg')
  ) {
    return false;
  }
  return isImage ? SAFE_IMAGE_REGEX.test(normalized) : SAFE_LINK_REGEX.test(normalized);
}

/**
 * Làm sạch chuỗi HTML từ AI
 * @param {string} html 
 * @param {Object} options 
 * @returns {string} HTML sạch giữ nguyên định dạng thẻ
 */
function cleanAIHtml(html, options = {}) {
  if (!html || typeof html !== 'string') return '';

  // 1. Sử dụng DOMParser nếu ở môi trường Trình duyệt / Extension
  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      // Bọc try/catch chống lỗi CSP Trusted Types trên một số trang như Gemini
      const doc = parser.parseFromString(html, 'text/html');
      cleanDOMNode(doc.body, options);
      return doc.body.innerHTML.trim();
    } catch (e) {
      console.warn('AI-Copy-Cleaner: DOMParser fallback to regex parser.', e);
      return cleanHtmlRegexFallback(html);
    }
  } else {
    // 2. Môi trường Node.js / Fallback Regex an toàn
    return cleanHtmlRegexFallback(html);
  }
}

/**
 * Duyệt đệ quy tất cả các Element Node trong DOM theo Strict Allowlist
 */
function cleanDOMNode(node, options) {
  if (!node) return;

  const children = Array.from(node.childNodes);
  for (const child of children) {
    // Text node: chuẩn hóa dấu gạch nối AI (–, —, −) → '-'. NodeType 3 không có attributes hay children
    // nên cập nhật trực tiếp nodeValue là đủ và an toàn — DOM tree giữ nguyên, innerHTML serialize lại
    // sẽ tự chứa ký tự ASCII. Áp dụng cho cả text bên trong <code> theo Q3 đã duyệt.
    if (child.nodeType === 3) {
      const original = child.nodeValue;
      if (typeof original === 'string' && original.length > 0 && DASH_CHARS_REGEX.test(original)) {
        child.nodeValue = original.replace(DASH_CHARS_REGEX, '-');
      }
      continue;
    }
    if (child.nodeType === 1) { // Element Node
      const tagName = child.tagName.toLowerCase();

      // Xóa các phần tử UI rác (nút Copy code, overlay, citation popups...)
      if (isJunkElement(child, tagName)) {
        child.remove();
        continue;
      }

      // Xóa thẻ script, iframe, object, embed, style, meta, link, template nguy hiểm nếu có
      if (['script', 'iframe', 'object', 'embed', 'style', 'meta', 'link', 'template'].includes(tagName)) {
        child.remove();
        continue;
      }

      // Xử lý an toàn nếu node là HTMLTemplateElement có .content DocumentFragment
      if (child.content && child.content.nodeType === 11) {
        child.remove();
        continue;
      }

      // Xử lý các thuộc tính trên thẻ
      const attributes = Array.from(child.attributes);
      let preservedLangClass = null;

      for (const attr of attributes) {
        const attrName = attr.name.toLowerCase();

        // Kiểm tra giữ lại ngôn ngữ lập trình cho <code> hoặc <pre>
        if ((tagName === 'code' || tagName === 'pre') && attrName === 'class') {
          const match = attr.value.match(LANGUAGE_CLASS_REGEX);
          if (match) {
            preservedLangClass = `language-${match[1].toLowerCase()}`;
          }
        }

        // Với thẻ <a>: kiểm tra an toàn URL href
        if (tagName === 'a') {
          if (attrName === 'href') {
            if (!isSafeUrl(attr.value, false)) {
              child.removeAttribute(attr.name);
            }
          } else if (!ALLOWED_ATTRIBUTES.a.has(attrName)) {
            child.removeAttribute(attr.name);
          }
        } else if (tagName === 'img') {
          // Với thẻ <img>: kiểm tra an toàn URL src (chỉ cho phép raster images an toàn)
          if (attrName === 'src') {
            if (!isSafeUrl(attr.value, true)) {
              child.removeAttribute(attr.name);
            }
          } else if (!ALLOWED_ATTRIBUTES.img.has(attrName)) {
            child.removeAttribute(attr.name);
          }
        } else if (ALLOWED_ATTRIBUTES[tagName]) {
          // Với bảng: chỉ giữ lại các thuộc tính trong allowlist
          if (!ALLOWED_ATTRIBUTES[tagName].has(attrName)) {
            child.removeAttribute(attr.name);
          }
        } else {
          // Xóa tất cả thuộc tính trên mọi thẻ khác (p, div, h1-h6, span, ul, ol, li, custom tags, namespaced tags...)
          child.removeAttribute(attr.name);
        }
      }

      // Gán lại class ngôn ngữ chuẩn nếu có trên thẻ <code>
      if (preservedLangClass && tagName === 'code') {
        child.setAttribute('class', preservedLangClass);
      }

      // Đệ quy xử lý tiếp các node con
      cleanDOMNode(child, options);
    }
  }
}

/**
 * Kiểm tra xem có phải phần tử UI rác cần xóa không
 */
function isJunkElement(el, tagName) {
  // Nút bấm UI trong khung code hoặc bong bóng chat (Copy button, retry button, feedback, citation)
  if (tagName === 'button') {
    const text = (el.textContent || '').trim().toLowerCase();
    if (!text || text === 'copy' || text === 'copy code' || text === 'sao chép' || text === 'copied' || text === 'đã sao chép' || /^\[?\d+\]?$/.test(text)) {
      return true;
    }
  }

  // Icon SVG độc lập không có văn bản ngữ nghĩa
  if (tagName === 'svg') {
    if (!el.textContent || el.textContent.trim() === '') {
      return true;
    }
  }

  const className = el.getAttribute('class') || '';
  if (JUNK_OVERLAY_REGEX.test(className)) {
    if (!el.textContent || el.textContent.trim() === '' || /^\[?\d+\]?$/.test(el.textContent.trim())) {
      return true;
    }
  }

  return false;
}

/**
 * Fallback Parser an toàn áp dụng 100% Strict Per-Element Attribute Allowlist, Duplicate Attr Spec & Comprehensive Entity Decoding
 */
function cleanHtmlRegexFallback(html) {
  let cleaned = html;

  // 1. Xóa bỏ hoàn toàn các khối thẻ nguy hiểm và nội dung bên trong
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  cleaned = cleaned.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  cleaned = cleaned.replace(/<template\b[^<]*(?:(?!<\/template>)<[^<]*)*<\/template>/gi, '');
  cleaned = cleaned.replace(/<embed\b[^>]*>/gi, '');
  cleaned = cleaned.replace(/<meta\b[^>]*>/gi, '');
  cleaned = cleaned.replace(/<link\b[^>]*>/gi, '');

  // 2. Xóa các nút copy code rác & citation buttons <button>...</button>
  cleaned = cleaned.replace(/<button[^>]*>(?:\s*|Copy|Copy code|Sao chép|Copied|\[?\d+\]?)<\/button>/gi, '');

  // 3. Xóa các thẻ SVG rác
  cleaned = cleaned.replace(/<svg[^>]*>.*?<\/svg>/gi, '');

  // 4. Parse và lọc nghiêm ngặt từng thẻ (bao gồm cả custom/hyphenated/namespaced tags như x:custom, custom-tag) theo ALLOWED_ATTRIBUTES allowlist
  cleaned = cleaned.replace(/<([a-zA-Z][a-zA-Z0-9_:-]*)((?:\s+[^>]*?)?)(\s*\/?)>/g, (fullMatch, rawTagName, rawAttrs, selfClosing) => {
    const tagName = rawTagName.toLowerCase();

    // Thẻ nguy hiểm bị loại bỏ
    if (['script', 'iframe', 'style', 'object', 'embed', 'meta', 'link', 'template'].includes(tagName)) {
      return '';
    }

    const tagAllowlist = ALLOWED_ATTRIBUTES[tagName];
    const allowedAttrs = [];
    const seenAttrs = new Set(); // Tuân thủ HTML Spec: Giữ thuộc tính đầu tiên xuất hiện, bỏ qua thuộc tính trùng lặp tiếp theo

    if (rawAttrs && rawAttrs.trim()) {
      // Regex trích xuất từng cặp name và value
      const attrRegex = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let match;
      while ((match = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = match[1].toLowerCase();
        
        // Nếu thuộc tính đã xuất hiện trước đó trên cùng thẻ, bỏ qua theo đúng HTML parser spec
        if (seenAttrs.has(attrName)) {
          continue;
        }
        seenAttrs.add(attrName);

        const rawVal = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : (match[4] || ''));

        // Xử lý riêng cho thẻ code: chỉ giữ class ngôn ngữ
        if (tagName === 'code' && attrName === 'class') {
          const decodedVal = decodeHtmlEntities(rawVal);
          const langMatch = decodedVal.match(LANGUAGE_CLASS_REGEX);
          if (langMatch) {
            allowedAttrs.push(`class="language-${langMatch[1].toLowerCase()}"`);
          }
          continue;
        }

        // Xử lý riêng cho thẻ a href (chuẩn hóa WHATWG và thoát double quotes)
        if (tagName === 'a' && attrName === 'href') {
          if (isSafeUrl(rawVal, false)) {
            const normalized = normalizeUrl(rawVal);
            const escapedVal = normalized.replace(/"/g, '&quot;');
            allowedAttrs.push(`href="${escapedVal}"`);
          }
          continue;
        }

        // Xử lý riêng cho thẻ img src (chuẩn hóa WHATWG và thoát double quotes)
        if (tagName === 'img' && attrName === 'src') {
          if (isSafeUrl(rawVal, true)) {
            const normalized = normalizeUrl(rawVal);
            const escapedVal = normalized.replace(/"/g, '&quot;');
            allowedAttrs.push(`src="${escapedVal}"`);
          }
          continue;
        }

        // Kiểm tra thuộc tính có trong allowlist của thẻ không
        if (tagAllowlist && tagAllowlist.has(attrName)) {
          const decodedVal = decodeHtmlEntities(rawVal);
          const escapedVal = decodedVal.replace(/"/g, '&quot;');
          allowedAttrs.push(`${attrName}="${escapedVal}"`);
        }
      }
    }

    const attrsStr = allowedAttrs.length > 0 ? ` ${allowedAttrs.join(' ')}` : '';
    const slashStr = selfClosing ? selfClosing.trim() : '';
    return `<${tagName}${attrsStr}${slashStr ? ' ' + slashStr : ''}>`;
  });

  // Chuẩn hóa dấu gạch nối AI ở đầu ra cuối cùng (text thường + text trong <code>)
  cleaned = normalizeDashes(cleaned);

  return cleaned.trim();
}

// Đóng băng và gắn bất biến vào global scope để bảo vệ chống can thiệp từ page scripts
const apiExports = Object.freeze({
  cleanAIHtml,
  isSafeUrl,
  decodeHtmlEntities,
  normalizeUrl,
  normalizeDashes
});

function defineImmutableProperty(target, name, value) {
  try {
    Object.defineProperty(target, name, {
      value: value,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } catch (_) {
    try { target[name] = value; } catch (__) {}
  }
}

if (typeof window !== 'undefined') {
  defineImmutableProperty(window, 'cleanAIHtml', cleanAIHtml);
  defineImmutableProperty(window, 'isSafeUrl', isSafeUrl);
  defineImmutableProperty(window, 'decodeHtmlEntities', decodeHtmlEntities);
  defineImmutableProperty(window, 'normalizeUrl', normalizeUrl);
  defineImmutableProperty(window, 'normalizeDashes', normalizeDashes);
}
if (typeof globalThis !== 'undefined') {
  defineImmutableProperty(globalThis, 'cleanAIHtml', cleanAIHtml);
  defineImmutableProperty(globalThis, 'isSafeUrl', isSafeUrl);
  defineImmutableProperty(globalThis, 'decodeHtmlEntities', decodeHtmlEntities);
  defineImmutableProperty(globalThis, 'normalizeUrl', normalizeUrl);
  defineImmutableProperty(globalThis, 'normalizeDashes', normalizeDashes);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = apiExports;
}
