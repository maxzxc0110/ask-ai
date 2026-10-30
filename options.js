import { PROVIDER_LIST, getProvider, testConnection } from './providers.js';

const $ = (s) => document.querySelector(s);

const DEFAULTS = {
  providerId: 'openai',
  protocol: 'auto',
  apiKey: '',
  model: '',
  models: [],
  baseUrl: '',
  maxChars: 14000,
  temperature: 0.3,
  maxTokens: 4096,
  includeBody: true,
  autoSession: true,
  systemPrompt:
    '你是一个嵌在 Chrome 侧边栏里的网页助手。用户正在浏览一个网页，并把页面内容提供给你。' +
    '请基于页面内容作答：具体、直接、优先引用页面里的原文细节；页面里没有的信息就说明没有，不要编造。' +
    '默认用中文回答，除非用户用其他语言提问。',
};

const els = {
  provider: $('#provider'),
  protocol: $('#protocol'),
  protocolHint: $('#protocol-hint'),
  apiKey: $('#apiKey'),
  models: $('#models'),
  modelList: $('#model-list'),
  baseUrl: $('#baseUrl'),
  maxChars: $('#maxChars'),
  maxTokens: $('#maxTokens'),
  temperature: $('#temperature'),
  temperatureOut: $('#temperature-out'),
  systemPrompt: $('#systemPrompt'),
  autoSession: $('#autoSession'),
  keyHint: $('#key-hint'),
  peek: $('#peek'),
  test: $('#test'),
  testResult: $('#test-result'),
  save: $('#save'),
  reset: $('#reset'),
  saveFlag: $('#save-flag'),
};

let settings = { ...DEFAULTS };

/** "a, b ,c" → ["a","b","c"] */
function parseModels(text) {
  return String(text || '')
    .split(/[,，;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const PROTOCOL_NOTE = {
  auto: '中转站/自建服务常常只提供其中一种格式，选错了会返回 404 或参数错误。',
  openai: 'POST {Base URL}/chat/completions，Authorization: Bearer。绝大多数中转站与自建服务都是这个格式。',
  anthropic: 'POST {Base URL}/messages，x-api-key 头。选这个格式时 Base URL 通常要填中转站地址。',
  gemini: 'POST {Base URL}/models/{模型}:streamGenerateContent?key=...',
};

function readForm() {
  const models = parseModels(els.models.value);
  return {
    providerId: els.provider.value,
    protocol: els.protocol.value,
    apiKey: els.apiKey.value.trim(),
    models,
    model: models.includes(settings.model) ? settings.model : (models[0] || settings.model || ''),
    baseUrl: els.baseUrl.value.trim(),
    maxChars: Number(els.maxChars.value) || DEFAULTS.maxChars,
    maxTokens: Number(els.maxTokens.value) || DEFAULTS.maxTokens,
    temperature: Number(els.temperature.value),
    systemPrompt: els.systemPrompt.value,
    autoSession: els.autoSession.checked,
  };
}

function fillForm() {
  els.provider.value = settings.providerId;
  els.protocol.value = settings.protocol || 'auto';
  els.apiKey.value = settings.apiKey || '';
  const list = Array.isArray(settings.models) ? settings.models : settings.model ? [settings.model] : [];
  els.models.value = list.join(', ');
  els.baseUrl.value = settings.baseUrl || '';
  els.maxChars.value = settings.maxChars;
  els.maxTokens.value = settings.maxTokens;
  els.temperature.value = settings.temperature;
  els.temperatureOut.textContent = String(settings.temperature);
  els.systemPrompt.value = settings.systemPrompt;
  els.autoSession.checked = settings.autoSession !== false;
  syncProvider();
}

function syncProvider() {
  const p = getProvider(els.provider.value);
  els.keyHint.textContent = p.keyHint;
  els.modelList.innerHTML = p.models.map((m) => '<option value="' + m + '"></option>').join('');
  // 没填过模型时，用该供应商的常用模型做默认
  if (!parseModels(els.models.value).length && p.models.length) {
    els.models.value = p.models.join(', ');
  }
}

function syncProtocol() {
  els.protocolHint.textContent = PROTOCOL_NOTE[els.protocol.value] || PROTOCOL_NOTE.auto;
}

async function persist(showFlag = true) {
  settings = { ...settings, ...readForm() };
  await chrome.storage.local.set({ settings });
  if (showFlag) {
    els.saveFlag.classList.add('show');
    setTimeout(() => els.saveFlag.classList.remove('show'), 1600);
  }
}

function bind() {
  els.provider.addEventListener('change', () => {
    syncProvider();
    persist();
  });

  els.protocol.addEventListener('change', () => {
    syncProtocol();
    persist();
  });

  els.temperature.addEventListener('input', () => {
    els.temperatureOut.textContent = els.temperature.value;
  });

  els.peek.addEventListener('click', () => {
    const show = els.apiKey.type === 'password';
    els.apiKey.type = show ? 'text' : 'password';
    els.peek.textContent = show ? '隐藏' : '显示';
  });

  els.save.addEventListener('click', () => persist());

  els.reset.addEventListener('click', async () => {
    settings = { ...DEFAULTS, providerId: settings.providerId, protocol: settings.protocol };
    fillForm();
    syncProtocol();
    await persist();
  });

  els.test.addEventListener('click', async () => {
    const p = getProvider(els.provider.value);
    els.testResult.className = 'test-result';
    els.testResult.textContent = '测试中…';
    els.test.disabled = true;
    try {
      await persist(false);
      await testConnection(p, settings);
      els.testResult.className = 'test-result ok';
      els.testResult.textContent = '连接正常，可以用了';
    } catch (e) {
      els.testResult.className = 'test-result err';
      els.testResult.textContent = String((e && e.message) || e).slice(0, 240);
    } finally {
      els.test.disabled = false;
    }
  });

  ['apiKey', 'models', 'baseUrl', 'maxChars', 'maxTokens', 'systemPrompt', 'autoSession'].forEach((id) => {
    els[id].addEventListener('change', () => persist());
  });
}

async function init() {
  const got = await chrome.storage.local.get(['settings']);
  settings = { ...DEFAULTS, ...(got.settings || {}) };
  if (!Array.isArray(settings.models)) {
    settings.models = settings.model ? [settings.model] : [];
  }

  els.provider.innerHTML = PROVIDER_LIST.map(
    (p) => '<option value="' + p.id + '">' + p.label + '</option>'
  ).join('');

  fillForm();
  syncProtocol();
  bind();
}

init();
