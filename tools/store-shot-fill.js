/**
 * 商店展示图用的「填充脚本」：把真实 sidepanel.html 填成一段示例对话。
 *
 * 只在生成截图时使用（tools/store-shots.py 会把它注入 sidepanel.html）。
 * 好处：截图里的界面结构永远来自真实的 sidepanel.html + sidepanel.css，
 *       改了真实界面再跑一次截图就不会对不上。
 */
(function () {
  const $ = (s) => document.querySelector(s);

  /* ---- 顶栏 / 模型栏 ---- */
  const title = $('#session-title');
  if (title) title.textContent = '这篇讲了什么';

  const provider = $('#provider');
  if (provider) {
    provider.innerHTML = '<option value="anthropic">Anthropic Claude</option>';
    provider.value = 'anthropic';
  }
  const model = $('#model');
  if (model) {
    model.innerHTML =
      '<option value="claude-sonnet-4-5">claude-sonnet-4-5</option>' +
      '<option value="claude-opus-4-1">claude-opus-4-1</option>' +
      '<option value="claude-haiku-4-5">claude-haiku-4-5</option>';
    model.value = 'claude-sonnet-4-5';
  }

  /* ---- 页面上下文 ---- */
  const ctxTitle = $('#ctx-title');
  if (ctxTitle) ctxTitle.textContent = '用 Rust 写一个高性能 HTTP 代理 - 知乎';
  const ctxMeta = $('#ctx-meta');
  if (ctxMeta) ctxMeta.textContent = '4821 字 · 选区 128 字';
  const ctxSize = $('#ctx-size');
  if (ctxSize) ctxSize.textContent = '正文 4821 字';
  const modelTag = $('#model-tag');
  if (modelTag) modelTag.textContent = 'claude-sonnet-4-5 · anthropic';

  const dot = $('#ctx-dot');
  if (dot) dot.className = 'ctx-dot ok';

  const body = $('#toggle-body');
  if (body) body.classList.add('is-on');

  const toolsChip = $('#toggle-tools');
  if (toolsChip) {
    toolsChip.classList.add('is-on');
    toolsChip.textContent = '⚙ 页面工具 开';
  }

  /* ---- 对话内容 ---- */
  const empty = $('#empty');
  if (empty) empty.hidden = true;

  const thread = $('#thread');
  if (!thread) return;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const userMsg = el('div', 'msg user');
  userMsg.append(el('div', 'bubble', '这篇讲的核心思路是什么？和 Nginx 比呢？'));
  thread.append(userMsg);

  const asst = el('div', 'msg assistant');
  asst.append(el('div', 'msg-role', 'Claude · claude-sonnet-4-5'));

  const activity = el('div', 'activity');
  const rows = [
    ['s-done', '✓', '读取页面源码', 'HTML 82KB · 3 段内联 CSS · 12 个网络请求'],
    ['s-done', '✓', '查看元素', '#benchmark-table > tbody > tr'],
  ];
  for (const [cls, icon, name, detail] of rows) {
    const row = el('div', 'act-row ' + cls);
    row.append(el('span', 'act-icon', icon), el('span', 'act-name', name), el('span', 'act-detail', detail));
    activity.append(row);
  }
  asst.append(activity);

  const bubble = el('div', 'bubble');
  bubble.innerHTML =
    '<p>这篇的核心是<strong>自研事件循环 + 零拷贝</strong>两条主线：</p>' +
    '<ul><li>用 <code>io_uring</code> 替代 epoll，单线程就能扛 12 万 QPS</li>' +
    '<li>零拷贝转发省掉两次 <code>memcpy</code>，吞吐提升约 40%</li></ul>' +
    '<h3>和 Nginx 的差异</h3>' +
    '<p>Nginx 是多进程 + 共享内存模型，而它是单线程异步，延迟更稳但单机上限更低。</p>' +
    '<pre><code>accept_loop → epoll_wait → read → write</code></pre>' +
    '<p>建议先看第 3 节的 benchmark 表，<a href="https://example.com" target="_blank" rel="noreferrer noopener">原文在这里</a>。</p>';
  asst.append(bubble);

  const msgTools = el('div', 'msg-tools');
  msgTools.append(el('button', null, '复制'), el('button', null, '重新生成'));
  asst.append(msgTools);
  thread.append(asst);

  const input = $('#input');
  if (input) input.value = '';
})();
