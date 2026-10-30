/* 端到端测试：驱动真实的 sidepanel.js，走完「模型请求动作 → 执行 → 回传 → 继续」 */
const results = [];
const check = (name, cond, info) => results.push({ name, pass: !!cond, info: String(info == null ? '' : info) });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (fn()) return true;
    await sleep(60);
  }
  return false;
}

const threadText = () => document.getElementById('thread').innerText;

async function sendQuestion(q) {
  const input = document.getElementById('input');
  input.value = q;
  document.getElementById('send').click();
}

async function run() {
  // 等面板初始化完（模型下拉有选项 = init 跑完了）
  await waitFor(() => document.getElementById('model').options.length > 0);

  /* ---------- 场景 A：普通点击，自动执行 ---------- */
  window.__setRound({ tool: { name: 'click', args: { selector: '#target' } }, text: '已经帮你点掉了那个按钮。' });
  await sendQuestion('帮我点一下那个按钮');

  const gotAnswer = await waitFor(() => threadText().indexOf('已经帮你点掉了那个按钮') >= 0);
  check('场景A 模型拿到工具结果后给出最终回答', gotAnswer, threadText().slice(-120));
  check('场景A 目标按钮真的被点击', window.__clicks.indexOf('target') >= 0, JSON.stringify(window.__clicks));

  const reqA = window.__requests[window.__requests.length - 1] || {};
  check('场景A 第二轮请求带上了工具结果', (reqA.messages || []).some((m) => m.role === 'tool'), JSON.stringify((reqA.messages || []).map((m) => m.role)));
  check('场景A 工具结果里有点击反馈', JSON.stringify(reqA).indexOf('target') >= 0, '');
  check('场景A 请求里带了工具声明', Array.isArray(reqA.tools) && reqA.tools.length > 0, JSON.stringify((reqA.tools || []).length));

  check('场景A 界面上有工具活动行', document.querySelectorAll('.act-row').length > 0, String(document.querySelectorAll('.act-row').length));

  /* ---------- 场景 B：危险动作必须先确认 ---------- */
  window.__clicks.length = 0;
  window.__setRound({ tool: { name: 'click', args: { selector: '#pay' } }, text: '好的，已经支付。' });
  await sendQuestion('帮我点确认支付');

  const gotCard = await waitFor(() => document.querySelector('.confirm-card') != null);
  const diag = 'innerText=' + JSON.stringify(document.getElementById('pay').innerText) +
    ' textContent=' + JSON.stringify(document.getElementById('pay').textContent) +
    ' rows=' + JSON.stringify(Array.from(document.querySelectorAll('.act-row')).map((r) => r.innerText)) +
    ' thread=' + JSON.stringify(threadText().slice(-160));
  check('场景B 危险动作弹出确认卡', gotCard, diag);
  check('场景B 确认前没有执行点击', window.__clicks.indexOf('pay') < 0, JSON.stringify(window.__clicks));

  const card = document.querySelector('.confirm-card');
  if (card) {
    check('场景B 确认卡说明了要点的内容', card.innerText.indexOf('确认支付') >= 0, card.innerText.slice(0, 80));
    const allow = card.querySelector('.cc-allow');
    check('场景B 确认卡有允许按钮', !!allow, '');
    if (allow) allow.click();
  }
  const paid = await waitFor(() => window.__clicks.indexOf('pay') >= 0);
  check('场景B 点允许后执行了点击', paid, JSON.stringify(window.__clicks));
  await waitFor(() => threadText().indexOf('好的，已经支付') >= 0, 8000);

  /* ---------- 场景 C：关掉页面工具后不再下发 tools ---------- */
  const before = window.__requests.length;
  window.__setRound({ text: '这次我不调工具。' });
  const chip = document.getElementById('toggle-tools');
  check('场景C 底部有页面工具开关', !!chip, '');
  if (chip && chip.classList.contains('is-on')) chip.click(); // 关掉
  await sendQuestion('随便聊聊');
  await waitFor(() => window.__requests.length > before, 8000);
  const reqC = window.__requests[window.__requests.length - 1] || {};
  check('场景C 关闭后请求不带 tools', !reqC.tools, JSON.stringify(reqC.tools || null));

  document.title = 'RESULTS:' + JSON.stringify(results);
  document.getElementById('results-out') && (document.getElementById('results-out').textContent = JSON.stringify(results));
}

run().catch((e) => {
  results.push({ name: '测试脚本异常：' + (e && e.message), pass: false, info: String(e && e.stack) });
  document.title = 'RESULTS:' + JSON.stringify(results);
});
