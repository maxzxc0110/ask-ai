import { PROVIDER_LIST, getProvider, buildRequest, streamCompletion, readErr } from './providers.js';

const $ = (s) => document.querySelector(s);

const els = {
  provider: $('#provider'),
  options: $('#open-options'),
  sessionBtn: $('#session-btn'),
  sessionMenu: $('#session-menu'),
  menuNew: $('#menu-new'),
  menuList: $('#menu-list'),
  sessionTitle: $('#session-title'),
  ctxTitle: $('#ctx-title'),
  ctxMeta: $('#ctx-meta'),
  ctxDot: $('#ctx-dot'),
  ctxSize: $('#ctx-size'),
  modelTag: $('#model-tag'),
  toggleBody: $('#toggle-body'),
  refresh: $('#refresh'),
  thread: $('#thread'),
  empty: $('#empty'),
  quick: $('#quick'),
  input: $('#input'),
  send: $('#send'),
  stop: $('#stop'),
};

const DEFAULTS = {
  providerId: 'openai',
  protocol: 'auto', // auto | openai | anthropic | gemini
  apiKey: '',
  model: '',
  baseUrl: '',
  maxChars: 14000,
  temperature: 0.3,
  maxTokens: 4096,
  includeBody: true,
  autoSession: true, // 打开新页面自动开新会话
  systemPrompt:
    '你是一个嵌在 Chrome 侧边栏里的网页助手。用户正在浏览一个网页，并把页面内容提供给你。' +
    '请基于页面内容作答：具体、直接、优先引用页面里的原文细节；页面里没有的信息就说明没有，不要编造。' +
    '默认用中文回答，除非用户用其他语言提问。',
};

let settings = { ...DEFAULTS };

/* ---------------- 会话状态 ---------------- */

let sessions = {};   // id -> { id, url, title, messages, createdAt, updatedAt }
let urlIndex = {};   // 归一化 URL -> sessionId
let currentByWin = {}; // windowId -> sessionId
let sessionId = null;
let messages = [];
let windowId = null;
let lastUrl = null;

let page = { title: '', url: '', text: '', selection: '', ok: false, error: '' };
let busy = false;
let controller = null;
let renderTimer = null;

const normUrl = (u) => {
  try {
    const x = new URL(u);
    x.hash = '';
    return x.href;
  } catch {
    return u || '';
  }
};

const uid = () => 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return '';
  }
};

/* ---------------- 设置 ---------------- */

async function loadSettings() {
  const got = await chrome.storage.local.get(['settings']);
  settings = { ...DEFAULTS, ...(got.settings || {}) };
}

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
}

/* ---------------- 会话读写 ---------------- */

async function loadSessions() {
  const got = await chrome.storage.local.get(['sessions', 'urlIndex', 'currentByWin']);
  sessions = got.sessions || {};
  urlIndex = got.urlIndex || {};
  currentByWin = got.currentByWin || {};
}

function saveSessions() {
  chrome.storage.local.set({ sessions, urlIndex, currentByWin });
}

function pruneSessions() {
  const ids = Object.keys(sessions);
  if (ids.length <= 40) return;
  ids.sort((a, b) => sessions[a].updatedAt - sessions[b].updatedAt);
  for (const id of ids.slice(0, ids.length - 40)) {
    delete sessions[id];
    for (const u in urlIndex) if (urlIndex[u] === id) delete urlIndex[u];
  }
}

function createSession(url) {
  const id = uid();
  sessions[id] = {
    id,
    url: url || null,
    title: '新会话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (url) urlIndex[normUrl(url)] = id;
  pruneSessions();
  return id;
}

/** 页面 URL 对应的会话：没有就建一个 */
function sessionForUrl(url) {
  const key = normUrl(url);
  if (!key) return null;
  let id = urlIndex[key];
  if (!id || !sessions[id]) {
    id = createSession(url);
  }
  return id;
}

function switchSession(id) {
  if (!sessions[id]) return;
  sessionId = id;
  currentByWin[windowId] = id;
  messages = sessions[id].messages;
  render();
  renderSessionMenu();
  saveSessions();
}

function touch() {
  if (sessionId && sessions[sessionId]) {
    sessions[sessionId].updatedAt = Date.now();
    sessions[sessionId].messages = messages;
  }
  saveSessions();
}

function sessionTitleOf(s) {
  if (s.messages && s.messages.length) {
    const first = s.messages.find((m) => m.role === 'user');
    if (first) {
      const t = String(first.text).replace(/\s+/g, ' ').trim();
      return t.length > 20 ? t.slice(0, 20) + '…' : t;
    }
  }
  return s.url ? hostOf(s.url) : '新会话';
}

function renderSessionMenu() {
  const list = els.menuList;
  list.innerHTML = '';
  const ids = Object.keys(sessions).sort((a, b) => sessions[b].updatedAt - sessions[a].updatedAt);
  if (!ids.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-empty';
    empty.textContent = '还没有会话';
    list.append(empty);
    return;
  }
  for (const id of ids) {
    const s = sessions[id];
    const item = document.createElement('button');
    item.className = 'menu-item' + (id === sessionId ? ' active' : '');
    const t = document.createElement('span');
    t.className = 'mi-title';
    t.textContent = sessionTitleOf(s);
    const u = document.createElement('span');
    u.className = 'mi-url';
    u.textContent = s.url ? hostOf(s.url) : '独立会话';
    item.append(t, u);
    item.onclick = () => {
      switchSession(id);
      closeMenu();
    };
    list.append(item);
  }
}

function openMenu() {
  renderSessionMenu();
  els.sessionMenu.hidden = false;
  els.sessionBtn.setAttribute('aria-expanded', 'true');
}

function closeMenu() {
  els.sessionMenu.hidden = true;
  els.sessionBtn.setAttribute('aria-expanded', 'false');
}

/* ---------------- 页面正文抽取（在页面上下文执行） ---------------- */

function extractFromPage() {
  const JUNK =
    'script,style,noscript,svg,canvas,iframe,nav,footer,header,aside,form,button,input,select,' +
    '[role="navigation"],[role="banner"],[role="complementary"],[aria-hidden="true"],' +
    '.ad,.ads,.advert,.advertisement,.cookie,.cookie-banner,#comments,.related,.share,.social';

  const PREFERRED = [
    'article', 'main', '[role="main"]', '#content', '#main-content',
    '.post-content', '.article-content', '.entry-content', '.markdown-body', '.rich_media_content',
  ];

  let root = null;
  for (const sel of PREFERRED) {
    const el = document.querySelector(sel);
    if (el) {
      const len = (el.innerText || '').trim().length;
      if (len > 400) { root = el; break; }
    }
  }
  if (!root) root = document.body;
  if (!root) return { title: document.title, url: location.href, text: '', selection: '' };

  const clone = root.cloneNode(true);
  clone.querySelectorAll(JUNK).forEach((n) => n.remove());
  clone
    .querySelectorAll('p,div,section,article,li,h1,h2,h3,h4,h5,h6,tr,pre,blockquote,br,td,dd,dt')
    .forEach((n) => n.append('\n'));

  let text = clone.textContent || '';
  text = text
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const selection = String(window.getSelection ? window.getSelection().toString() : '').trim();

  return {
    title: (document.title || '').trim(),
    url: location.href,
    text,
    selection: selection.slice(0, 4000),
  };
}

async function refreshContext() {
  els.ctxDot.className = 'ctx-dot';
  els.ctxTitle.textContent = '正在读取当前页面…';
  els.ctxMeta.textContent = '—';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('没有找到活动标签页');
    const url = tab.url || '';
    if (/^(chrome|edge|about|devtools|chrome-extension|moz-extension|view-source):/i.test(url)) {
      throw new Error('浏览器内置页面读不到内容');
    }
    const res = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractFromPage,
    });
    const data = res && res[0] ? res[0].result : null;
    if (!data) throw new Error('页面读取失败（可能没有内容权限）');
    page = { ...data, ok: true, error: '' };
    els.ctxDot.className = 'ctx-dot ok';
    els.ctxTitle.textContent = page.title || page.url || '当前页面';
    els.ctxTitle.title = page.url || '';
    const chars = (page.text || '').length;
    const sel = page.selection ? ` · 选区 ${page.selection.length} 字` : '';
    els.ctxMeta.textContent = `${chars} 字${sel}`;
    els.ctxSize.textContent = `正文 ${chars} 字`;
  } catch (e) {
    page = { title: '', url: '', text: '', selection: '', ok: false, error: String(e.message || e) };
    els.ctxDot.className = 'ctx-dot err';
    els.ctxTitle.textContent = '读不到这个页面';
    els.ctxMeta.textContent = String(e.message || e);
    els.ctxSize.textContent = '无正文';
  }
}

/* ---------------- Markdown ---------------- */

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function mdToHtml(src) {
  const blocks = [];
  let s = String(src).replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    blocks.push('<pre><code>' + escapeHtml(String(code).replace(/\n$/, '')) + '</code></pre>');
    return '%%BLOCK' + (blocks.length - 1) + '%%';
  });

  s = escapeHtml(s);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|\n)#{1,3}\s+(.+)/g, (_m, p1, p2) => p1 + '<h3>' + p2 + '</h3>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');

  s = s.replace(/(^|\n)[-*]\s+(.+)/g, '$1<li>$2</li>');
  s = s.replace(/(^|\n)\d+\.\s+(.+)/g, '$1<li>$2</li>');
  s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
  s = s.replace(/<ul>\s*<li>/g, '<ul><li>');

  s = s
    .split(/\n{2,}/)
    .map((chunk) => {
      const t = chunk.trim();
      if (!t) return '';
      if (/^<(h\d|ul|pre|ol|blockquote)/.test(t) || /^%%BLOCK\d+%%$/.test(t)) return t;
      return '<p>' + t.replace(/\n/g, '<br>') + '</p>';
    })
    .join('');

  s = s.replace(/%%BLOCK(\d+)%%/g, (_m, i) => blocks[Number(i)]);
  return s || '<p></p>';
}

/* ---------------- 渲染 ---------------- */

function render() {
  els.empty.hidden = messages.length > 0;
  els.thread.querySelectorAll('.msg').forEach((n) => n.remove());

  messages.forEach((m) => {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + m.role;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (m.role === 'user') {
      bubble.textContent = m.text;
    } else if (m.error) {
      bubble.innerHTML = '<div class="err"><b>出错了</b>' + escapeHtml(m.text) + '</div>';
    } else if (m.streaming) {
      bubble.classList.add('streaming');
      bubble.textContent = m.text;
    } else {
      bubble.innerHTML = mdToHtml(m.text);
    }

    if (m.role === 'assistant') {
      const role = document.createElement('div');
      role.className = 'msg-role';
      role.textContent = m.providerLabel || 'AI';
      wrap.append(role);
    }

    wrap.append(bubble);

    if (m.role === 'assistant' && !m.streaming && !m.error) {
      const tools = document.createElement('div');
      tools.className = 'msg-tools';

      const copy = document.createElement('button');
      copy.textContent = '复制';
      copy.onclick = () =>
        navigator.clipboard.writeText(m.text).then(() => {
          copy.textContent = '已复制';
          setTimeout(() => (copy.textContent = '复制'), 1400);
        });

      const regen = document.createElement('button');
      regen.textContent = '重新生成';
      regen.onclick = () => regenerate(messages.indexOf(m));

      tools.append(copy, regen);
      wrap.append(tools);
    }

    els.thread.append(wrap);
  });

  els.sessionTitle.textContent = sessionTitleOf(sessions[sessionId] || { messages, url: page.url });
  els.thread.scrollTop = els.thread.scrollHeight;
}

function updateStreamingBubble(index) {
  const node = els.thread.querySelectorAll('.msg')[index];
  if (!node) return;
  const bubble = node.querySelector('.bubble');
  const m = messages[index];
  if (!bubble || !m) return;
  bubble.classList.add('streaming');
  bubble.textContent = m.text;
  els.thread.scrollTop = els.thread.scrollHeight;
}

/* ---------------- 上下文拼装 ---------------- */

function clip(text, max) {
  const t = String(text || '');
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.72);
  const tail = max - head;
  return t.slice(0, head) + '\n\n…（中间省略 ' + (t.length - max) + ' 字）…\n\n' + t.slice(-tail);
}

function buildSystemText() {
  const parts = [settings.systemPrompt];
  if (settings.includeBody) {
    if (page.ok && page.text) {
      parts.push(
        '\n【当前网页】\n标题：' + page.title + '\n网址：' + page.url +
          '\n正文（截断到 ' + settings.maxChars + ' 字）：\n"""\n' +
          clip(page.text, settings.maxChars) + '\n"""'
      );
    } else if (page.selection) {
      parts.push('\n【用户选中的文字】\n"""\n' + page.selection + '\n"""');
    }
  }
  return parts.join('\n');
}

/* ---------------- 发送 ---------------- */

async function send(text) {
  const question = String(text || '').trim();
  if (!question || busy) return;

  const provider = getProvider(settings.providerId);
  if (!settings.apiKey && provider.id !== 'ollama') {
    openOptions();
    return;
  }

  els.input.value = '';
  autoGrow();

  const sel = page.selection ? '\n（我选中的是：' + page.selection.slice(0, 300) + '）' : '';
  messages.push({ role: 'user', text: question + sel });

  const assistant = { role: 'assistant', text: '', streaming: true, providerLabel: provider.label };
  messages.push(assistant);
  const idx = messages.length - 1;
  render();
  touch();

  busy = true;
  setBusyUI(true);
  controller = new AbortController();

  try {
    const sysText = buildSystemText();
    const history = messages.slice(0, idx).map((m) => ({ role: m.role, text: m.text }));
    const req = buildRequest(provider, settings, sysText, history);

    const res = await fetch(req.url, { ...req.init, signal: controller.signal });
    if (!res.ok) throw new Error(await readErr(res));

    let pending = '';
    const flush = () => {
      if (!pending) return;
      assistant.text += pending;
      pending = '';
      updateStreamingBubble(idx);
    };

    await streamCompletion(
      res,
      req.kind,
      (piece) => {
        pending += piece;
        if (!renderTimer) {
          renderTimer = setTimeout(() => {
            renderTimer = null;
            flush();
          }, 90);
        }
      },
      controller.signal
    );

    if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
    flush();

    assistant.streaming = false;
    if (!assistant.text.trim()) assistant.text = '（模型没有返回内容）';
  } catch (e) {
    if (renderTimer) { clearTimeout(renderTimer); renderTimer = null; }
    const aborted = e && e.name === 'AbortError';
    messages.pop();
    messages.push({
      role: 'assistant',
      error: true,
      text: aborted
        ? '已停止生成。'
        : ((e && e.message) || e) +
          '\n\n请到设置页确认 API Key、模型名、Base URL 和「接口协议」是否匹配；如果用的是境外服务，确认该域名走代理规则。',
      providerLabel: provider.label,
    });
  } finally {
    busy = false;
    controller = null;
    setBusyUI(false);
    render();
    touch();
    els.input.focus();
  }
}

async function regenerate(index) {
  let target = index;
  for (let i = index; i >= 0; i--) {
    if (messages[i].role === 'user') { target = i; break; }
  }
  const question = messages[target] ? messages[target].text : '';
  messages = messages.slice(0, target);
  if (sessionId && sessions[sessionId]) sessions[sessionId].messages = messages;
  render();
  await send(question);
}

/* ---------------- UI 辅助 ---------------- */

function setBusyUI(state) {
  els.send.hidden = state;
  els.stop.hidden = !state;
}

function autoGrow() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 160) + 'px';
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  else window.open('options.html');
}

/* ---------------- 标签页 / 会话联动 ---------------- */

async function handleUrlChange() {
  let url = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = (tab && tab.url) || '';
  } catch {}

  const changed = url !== lastUrl;
  lastUrl = url;

  if (changed && settings.autoSession !== false) {
    const id = sessionForUrl(url);
    if (id && id !== sessionId) switchSession(id);
  }
  refreshContext();
}

/* ---------------- 事件 ---------------- */

function bind() {
  els.provider.addEventListener('change', async () => {
    const p = getProvider(els.provider.value);
    const model = p.models[0] || settings.model;
    await saveSettings({ providerId: p.id, model });
    els.modelTag.textContent = model || '未选模型';
    if (!settings.apiKey && p.id !== 'ollama') openOptions();
  });

  els.options.addEventListener('click', openOptions);
  els.refresh.addEventListener('click', refreshContext);

  els.sessionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.sessionMenu.hidden) openMenu();
    else closeMenu();
  });

  els.menuNew.addEventListener('click', () => {
    const id = createSession(null);
    switchSession(id);
    closeMenu();
    els.input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!els.sessionMenu.hidden && !e.target.closest('.session-wrap')) closeMenu();
  });

  els.toggleBody.addEventListener('click', async () => {
    const on = !settings.includeBody;
    els.toggleBody.classList.toggle('is-on', on);
    await saveSettings({ includeBody: on });
  });

  els.send.addEventListener('click', () => send(els.input.value));

  els.stop.addEventListener('click', () => {
    if (controller) controller.abort();
  });

  els.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(els.input.value);
    }
  });

  els.input.addEventListener('input', autoGrow);

  els.quick.addEventListener('click', (e) => {
    const card = e.target.closest('.chip');
    if (!card) return;
    els.input.value = card.dataset.q || '';
    autoGrow();
    els.input.focus();
    send(els.input.value);
  });

  chrome.tabs.onActivated.addListener(() => handleUrlChange());
  chrome.tabs.onUpdated.addListener((_tabId, info) => {
    if (info.status === 'complete') handleUrlChange();
  });
}

/* ---------------- 启动 ---------------- */

async function init() {
  await loadSettings();
  await loadSessions();

  try {
    const win = await chrome.windows.getCurrent();
    windowId = win ? win.id : 0;
  } catch {
    windowId = 0;
  }

  els.provider.innerHTML = PROVIDER_LIST.map(
    (p) => '<option value="' + p.id + '">' + p.label + '</option>'
  ).join('');
  els.provider.value = settings.providerId;

  const p = getProvider(settings.providerId);
  const protocolTag = settings.protocol && settings.protocol !== 'auto' ? settings.protocol : p.kind;
  els.modelTag.textContent = (settings.model || p.models[0] || '未选模型') + ' · ' + protocolTag;
  els.toggleBody.classList.toggle('is-on', settings.includeBody !== false);

  bind();

  // 首次进入：按当前页面定位会话
  let url = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = (tab && tab.url) || '';
  } catch {}
  lastUrl = url;

  let id = currentByWin[windowId];
  if (!id || !sessions[id]) id = sessionForUrl(url);
  if (id) switchSession(id);
  else {
    messages = [];
    render();
  }

  await refreshContext();
  els.input.focus();
}

init();
