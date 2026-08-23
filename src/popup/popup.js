'use strict';

const OPT_KEY = 'aicc_optimizer_settings';
const DEFAULT_OPT = { enabled: true, messageLimit: 15, loadStep: 5 };
const $ = (id) => document.getElementById(id);
let saved = { clean: true, opt: { ...DEFAULT_OPT } };

function clamp(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function currentState() {
  return {
    clean: $('cleanEnabled').checked,
    opt: {
      enabled: $('optimizerEnabled').checked,
      messageLimit: clamp($('messageLimit').value, 1, 200, 15),
      loadStep: clamp($('loadStep').value, 1, 50, 5)
    }
  };
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function refreshUi() {
  const state = currentState();
  $('messageLimit').value = state.opt.messageLimit;
  $('loadStep').value = state.opt.loadStep;
  $('limitStat').textContent = state.opt.messageLimit;
  $('stepStat').textContent = state.opt.loadStep;
  $('optimizerDetails').classList.toggle('disabled', !state.opt.enabled);
  $('saveRow').classList.toggle('hidden', same(state, saved));
}

function step(id, delta, min, max) {
  const el = $(id);
  el.value = clamp(Number(el.value) + delta, min, max, min);
  refreshUi();
}

async function load() {
  try {
    $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  } catch (_) {}

  const [local, sync] = await Promise.all([
    chrome.storage.local.get({ [OPT_KEY]: DEFAULT_OPT, aicc_clean_count: 0 }),
    chrome.storage.sync.get({ autoCleanEnabled: true })
  ]);

  const opt = { ...DEFAULT_OPT, ...(local[OPT_KEY] || {}) };
  saved = { clean: sync.autoCleanEnabled !== false, opt };

  $('cleanEnabled').checked = saved.clean;
  $('optimizerEnabled').checked = !!opt.enabled;
  $('messageLimit').value = opt.messageLimit;
  $('loadStep').value = opt.loadStep;
  if ($('cleanStat')) {
    $('cleanStat').textContent = String(local.aicc_clean_count || 0);
  }
  refreshUi();
}

async function save() {
  const state = currentState();
  try {
    localStorage.setItem('aicc_clean_config', JSON.stringify({ enabled: state.clean }));
  } catch (_) {}
  await Promise.all([
    chrome.storage.local.set({ [OPT_KEY]: state.opt, autoCleanEnabled: state.clean }),
    chrome.storage.sync.set({ autoCleanEnabled: state.clean })
  ]);
  saved = state;
  refreshUi();
  const toast = $('savedToast');
  if (toast) {
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1200);
  }
}

let saveTimer = 0;
function queueSave() {
  refreshUi();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    save();
  }, 200);
}

['cleanEnabled', 'optimizerEnabled', 'messageLimit', 'loadStep'].forEach((id) => {
  const el = $(id);
  if (el) {
    el.addEventListener('input', queueSave);
    el.addEventListener('change', queueSave);
  }
});

$('limitDec').addEventListener('click', () => {
  step('messageLimit', -1, 1, 200);
  queueSave();
});
$('limitInc').addEventListener('click', () => {
  step('messageLimit', 1, 1, 200);
  queueSave();
});
$('stepDec').addEventListener('click', () => {
  step('loadStep', -1, 1, 50);
  queueSave();
});
$('stepInc').addEventListener('click', () => {
  step('loadStep', 1, 1, 50);
  queueSave();
});
$('saveBtn').addEventListener('click', save);

load();
