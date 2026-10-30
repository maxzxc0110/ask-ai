import { PROVIDER_LIST, getProvider, buildRequest, streamCompletion, readErr } from './providers.js';
import { TOOLS, TOOL_LABELS, isDangerous, pageToolExec } from './page-tools.js';

const $ = (s) => document.querySelector(s);

const els = {
  provider: $('#provider'),
  model: $('#model'),
  options: $('#open-options'),
  newSession: $('#new-session'),
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
  toggleTools: $('#toggle-tools'),
  refresh: $('#refresh'),
  thread: $('#thread'),
  empty: $('#empty'),
  input: $('#input'),
  send: $('#send'),
  stop: $('#stop'),
};

const DEFAULTS = {
  providerId: 'openai',
  protocol: 'auto', // auto | openai | anthropic | gemini
  apiKey: '',
  model: '',        // 当前选中的模型
  models: [],       // 该订阅可用的模型列表（可多个）
  baseUrl: '',
  maxChars: 14000,
  temperature: 0.3,
  maxTokens: 4096,
  includeBody: true,
  autoSession: true, // 打开新页面自动开新会话
  allowPageTools: true, // 允许 AI 调用页面工具（读源码 / 点击 / 填表）
  confirmDangerous: true, // 危险动作需要人工确认
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
  // 老版本只有一个 model 字段 → 迁移成模型列表
  if (!Array.isArray(settings.models)) {
    settings.models = settings.model ? [settings.model] : [];
  }
  settings.models = settings.models.filter(Boolean);
}

async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
}

/* ---------------- 模型列表 ---------------- */

/** 当前订阅下可用的模型（用户填的优先，否则用供应商默认） */
function availableModels() {
  const list = Array.isArray(settings.models) ? settings.models.filter(Boolean) : [];
  if (list.length) return list;
  const p = getProvider(settings.providerId);
  return p.models.slice();
}

function currentModel() {
  const list = availableModels();
  if (settings.model && list.includes(settings.model)) return settings.model;
  return list[0] || settings.model || '';
}

/** 刷新模型下拉 */
function fillModelSelect(preferred) {
  const list = availableModels();
  const keep = preferred || (sessions[sessionId] && sessions[sessionId].model) || settings.model;
  els.model.innerHTML = '';
  for (const m of list) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    els.model.append(opt);
  }
  if (!list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '未设置模型';
    els.model.append(opt);
  }
  const pick = list.includes(keep) ? keep : list[0] || '';
  els.model.value = pick;
  if (pick) settings.model = pick;
  updateModelTag();
}

function updateModelTag() {
  const p = getProvider(settings.providerId);
  const kind = settings.protocol && settings.protocol !== 'auto' ? settings.protocol : p.kind;
  els.modelTag.textContent = (settings.model || '未选模型') + ' · ' + kind;
  updateToolsChip();
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
  // 每个会话记住自己用的模型，切回来时恢复
  fillModelSelect(sessions[id].model);
  render();
  renderSessionMenu();
  saveSessions();
}

/** 新建一个独立会话（不绑定页面） */
function startNewSession() {
  const id = createSession(null);
  switchSession(id);
  closeMenu();
  els.input.focus();
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

/** 工具活动在界面上的节点表：activity id -> DOM */
let activityEls = new Map();

function render() {
  els.empty.hidden = messages.length > 0;
  els.thread.querySelectorAll('.msg').forEach((n) => n.remove());
  activityEls = new Map();

  messages.forEach((m, mi) => {
    if (m.role === 'tool') return; // 工具结果只回传给模型，不显示
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + m.role;
    wrap.dataset.idx = String(mi);

    const isAssistant = m.role === 'assistant';
    const hasText = !!(m.text && m.text.trim());

    if (isAssistant) {
      const role = document.createElement('div');
      role.className = 'msg-role';
      role.textContent = m.providerLabel || 'AI';
      wrap.append(role);
    }

    // 工具活动块
    if (isAssistant && m.activity && m.activity.length) {
      const box = document.createElement('div');
      box.className = 'activity';
      for (const a of m.activity) {
        const row = document.createElement('div');
        row.className = 'act-row s-' + a.status;
        row.dataset.act = a.id;
        const icon = document.createElement('span');
        icon.className = 'act-icon';
        icon.textContent = a.status === 'running' ? '◌' : a.status === 'done' ? '✓' : a.status === 'denied' ? '⊘' : '✕';
        const name = document.createElement('span');
        name.className = 'act-name';
        name.textContent = a.label || a.name;
        const detail = document.createElement('span');
        detail.className = 'act-detail';
        detail.textContent = a.detail || '';
        row.append(icon, name, detail);
        box.append(row);
        activityEls.set(a.id, row);
      }
      wrap.append(box);
    }

    // 流式中的助手消息即使还没文字也要有气泡，否则流式内容无处显示
    if (hasText || m.streaming) {
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
      wrap.append(bubble);
    }

    if (isAssistant && hasText && !m.streaming && !m.error) {
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

function updateStreamingBubble(m) {
  if (!m) return;
  const idx = messages.indexOf(m);
  if (idx < 0) return;
  const node = els.thread.querySelector('.msg[data-idx="' + idx + '"]');
  if (!node) return;
  const bubble = node.querySelector('.bubble');
  if (!bubble) return;
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
  if (settings.allowPageTools !== false) {
    parts.push(
      '\n【页面工具】你可以通过工具直接查看和操作当前网页：' +
        'page_snapshot 读源码与网络资源、read_page 读正文、inspect 看元素、click 点击、fill 填表、scroll 滚动。' +
        '需要看代码结构或排查样式/脚本问题时先调 page_snapshot；' +
        '用户明确要求"帮我点/填/操作"时才动手。' +
        '工具返回失败就换一种定位方式（先用 inspect 看清楚），不要反复重试同一个失败调用。'
    );
  }
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

/* ---------------- 页面工具执行 ---------------- */

const MAX_TOOL_ROUNDS = 8;

/** 在页面上下文执行一个动作 */
async function execInPage(payload) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('没有找到活动标签页');
  const res = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: pageToolExec,
    args: [payload],
  });
  return (res && res[0] && res[0].result) || { ok: false, error: '页面没有返回结果' };
}

/** 抓取外链 CSS / JS 原文（扩展上下文 fetch，host_permissions 绕过跨域限制） */
async function fetchExternalSources(urls, maxChars = 12000, maxFiles = 4) {
  const out = [];
  let used = 0;
  for (const url of urls.slice(0, maxFiles)) {
    if (!/^https?:/i.test(url)) continue;
    if (used >= maxChars) break;
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) {
        out.push({ url, error: 'HTTP ' + r.status });
        continue;
      }
      const text = await r.text();
      const room = Math.min(4000, maxChars - used);
      const content = text.slice(0, room);
      used += content.length;
      out.push({ url, size: text.length, content });
    } catch (e) {
      out.push({ url, error: String((e && e.message) || e) });
    }
  }
  return out;
}

/** 危险动作确认卡片 */
function requestConfirm(title, reason) {
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'confirm-card';
    const h = document.createElement('div');
    h.className = 'cc-title';
    h.textContent = '⚠️ 需要你确认';
    const act = document.createElement('div');
    act.className = 'cc-action';
    act.textContent = title;
    const rs = document.createElement('div');
    rs.className = 'cc-reason';
    rs.textContent = reason || '';
    const btns = document.createElement('div');
    btns.className = 'cc-btns';
    const deny = document.createElement('button');
    deny.className = 'cc-deny';
    deny.textContent = '拒绝';
    const allow = document.createElement('button');
    allow.className = 'cc-allow';
    allow.textContent = '允许一次';
    const done = (v) => {
      card.remove();
      resolve(v);
    };
    deny.onclick = () => done(false);
    allow.onclick = () => done(true);
    btns.append(deny, allow);
    card.append(h, act, rs, btns);
    els.thread.append(card);
    els.thread.scrollTop = els.thread.scrollHeight;
  });
}

/** 更新工具活动行 */
function updateActivity(activity) {
  const row = activityEls.get(activity.id);
  if (!row) return;
  row.className = 'act-row s-' + activity.status;
  row.querySelector('.act-icon').textContent =
    activity.status === 'running' ? '◌' : activity.status === 'done' ? '✓' : activity.status === 'denied' ? '⊘' : '✕';
  row.querySelector('.act-detail').textContent = activity.detail || '';
}

function activityDetail(result) {
  if (!result) return '';
  if (result.error) return result.error;
  if (result.action === 'snapshot') {
    const bits = [];
    if (result.htmlTotal) bits.push('HTML ' + Math.round(result.htmlTotal / 1024) + 'KB');
    if (result.cssInline && result.cssInline.length) bits.push(result.cssInline.length + ' 段内联 CSS');
    if (result.cssLinks && result.cssLinks.length) bits.push(result.cssLinks.length + ' 个外链 CSS');
    if (result.jsInline && result.jsInline.length) bits.push(result.jsInline.length + ' 段内联 JS');
    if (result.jsLinks && result.jsLinks.length) bits.push(result.jsLinks.length + ' 个外链 JS');
    if (result.resources && result.resources.length) bits.push(result.resources.length + ' 个网络请求');
    return bits.join(' · ');
  }
  if (result.action === 'read_page') return result.total ? result.total + ' 字' : '';
  if (result.action === 'inspect') return result.selector || result.tag || '';
  if (result.action === 'click') return result.label ? '「' + result.label + '」' : result.selector || '';
  if (result.action === 'fill') return result.field ? '「' + result.field + '」' : '';
  if (result.action === 'scroll') return result.detail || '';
  return result.detail || '';
}

/** 执行一个工具调用 */
async function runTool(call, activity) {
  const name = call.name;
  const args = call.args || {};

  if (name !== 'page_snapshot' && name !== 'read_page' && name !== 'inspect' &&
      name !== 'click' && name !== 'fill' && name !== 'scroll') {
    return { ok: false, error: '不认识的工具：' + name };
  }

  // 危险判定：先用参数判，再用元素实际文本判（探针总是跑，好让确认卡显示真实内容）
  let risk = isDangerous(name, args);
  let targetLabel = args.text || args.selector || '';
  if (name === 'click' || name === 'fill') {
    let probe = null;
    try {
      probe = await execInPage({
        action: 'inspect',
        selector: args.selector,
        text: args.text,
        index: args.index,
      });
    } catch {}
    if (probe && probe.ok) {
      targetLabel =
        name === 'fill'
          ? probe.field || probe.text || probe.selector || targetLabel
          : probe.text || probe.selector || targetLabel;
      risk = isDangerous(name, Object.assign({}, args, { text: targetLabel }));
    }
  }
  if (risk.danger && settings.confirmDangerous !== false) {
    const what = name === 'click' ? '点击' : name === 'fill' ? '填写' : '执行';
    const allowed = await requestConfirm(
      'AI 想' + what + '「' + String(targetLabel).slice(0, 80) + '」',
      risk.reason
    );
    if (!allowed) {
      return { ok: false, denied: true, error: '用户拒绝了该操作，请不要重试同样的动作' };
    }
  }

  const result = await execInPage(Object.assign({ action: name }, args));

  // 页面快照：再把外链 CSS / JS 原文抓回来
  if (result && result.ok && name === 'page_snapshot') {
    const urls = [].concat(result.cssLinks || [], result.jsLinks || []);
    if (urls.length) {
      const files = await fetchExternalSources(urls, 12000, 4);
      result.externalFiles = files;
    }
  }

  return result;
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

  // 本次使用的模型（下拉里当前选中的）
  const useModel = els.model.value || currentModel();
  if (useModel) settings.model = useModel;

  const sel = page.selection ? '\n（我选中的是：' + page.selection.slice(0, 300) + '）' : '';
  messages.push({ role: 'user', text: question + sel });

  let assistant = {
    role: 'assistant',
    text: '',
    streaming: true,
    activity: [],
    providerLabel: provider.label + (useModel ? ' · ' + useModel : ''),
  };
  messages.push(assistant);
  if (sessionId && sessions[sessionId]) sessions[sessionId].model = useModel;
  render();
  touch();

  busy = true;
  setBusyUI(true);
  controller = new AbortController();

  try {
    const sysText = buildSystemText();
    let toolsOn = settings.allowPageTools !== false;
    let round = 0;
    let toolRoundDone = false;

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      const cur = assistant;
      const history = messages
        .slice(0, messages.indexOf(cur))
        .map((m) => ({
          role: m.role,
          text: m.text,
          toolCalls: m.toolCalls,
          toolCallId: m.toolCallId,
          name: m.name,
          result: m.result,
        }));

      const req = buildRequest(provider, settings, sysText, history, toolsOn ? TOOLS : []);

      const res = await fetch(req.url, { ...req.init, signal: controller.signal });
      if (!res.ok) {
        const errText = await readErr(res);
        // 有些中转站/老模型不认 tools 参数，收到 400 就退回纯对话模式重试一次
        if (toolsOn && !toolRoundDone && res.status === 400 && /tool|function|schema/i.test(errText)) {
          toolsOn = false;
          cur.streaming = false;
          render();
          continue;
        }
        throw new Error(errText);
      }

      let pending = '';
      const flush = () => {
        if (!pending) return;
        cur.text += pending;
        pending = '';
        updateStreamingBubble(cur);
      };

      const out = await streamCompletion(
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

      cur.streaming = false;
      const toolCalls = out.toolCalls || [];

      if (!toolCalls.length) {
        if (!cur.text.trim()) cur.text = '（模型没有返回内容）';
        break;
      }

      toolRoundDone = true;
      cur.toolCalls = toolCalls;
      cur.activity = cur.activity || [];

      for (const call of toolCalls) {
        const activity = {
          id: call.id,
          name: call.name,
          label: TOOL_LABELS[call.name] || call.name,
          status: 'running',
          detail: '',
        };
        cur.activity.push(activity);
        render();
        updateActivity(activity);

        let result;
        try {
          result = await runTool(call, activity);
        } catch (e) {
          result = { ok: false, error: String((e && e.message) || e) };
        }

        activity.status = result.ok ? 'done' : result.denied ? 'denied' : 'error';
        activity.detail = activityDetail(result);
        updateActivity(activity);

        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, result });
      }

      // 下一轮：模型看到工具结果后继续
      assistant = {
        role: 'assistant',
        text: '',
        streaming: true,
        activity: [],
        providerLabel: provider.label + (useModel ? ' · ' + useModel : ''),
      };
      messages.push(assistant);
      render();
    }
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

/** 页面工具开关状态 */
function updateToolsChip() {
  if (!els.toggleTools) return;
  const on = settings.allowPageTools !== false;
  els.toggleTools.classList.toggle('is-on', on);
  els.toggleTools.textContent = on ? '⚙ 页面工具 开' : '⚙ 页面工具 关';
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
    await saveSettings({ providerId: p.id, model, models: p.models.slice() });
    fillModelSelect(model);
    if (!settings.apiKey && p.id !== 'ollama') openOptions();
  });

  els.model.addEventListener('change', async () => {
    const m = els.model.value;
    if (!m) return;
    settings.model = m;
    if (sessionId && sessions[sessionId]) sessions[sessionId].model = m;
    await saveSettings({ model: m });
    saveSessions();
    updateModelTag();
  });

  els.options.addEventListener('click', openOptions);
  els.refresh.addEventListener('click', refreshContext);
  els.newSession.addEventListener('click', startNewSession);

  els.sessionBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (els.sessionMenu.hidden) openMenu();
    else closeMenu();
  });

  els.menuNew.addEventListener('click', startNewSession);

  document.addEventListener('click', (e) => {
    if (!els.sessionMenu.hidden && !e.target.closest('.session-wrap')) closeMenu();
  });

  els.toggleBody.addEventListener('click', async () => {
    const on = !settings.includeBody;
    els.toggleBody.classList.toggle('is-on', on);
    await saveSettings({ includeBody: on });
  });

  els.toggleTools.addEventListener('click', async () => {
    const on = !(settings.allowPageTools !== false);
    await saveSettings({ allowPageTools: on });
    updateToolsChip();
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

  fillModelSelect();
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
