// 扩展自检：语法 + 协议构造 + 协议覆盖 + DOM 引用 + 会话逻辑 + Markdown 渲染
//
// 用法：node tools/validate.mjs        （在仓库根目录执行）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '..');       // 仓库根 = 扩展根
let fails = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  PASS  ' + msg);
  else { fails++; console.log('  FAIL  ' + msg); }
};
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

console.log('\n[1] manifest / 文件');
const mf = JSON.parse(read('manifest.json'));
ok(mf.manifest_version === 3, 'manifest_version = 3');
ok(!!mf.side_panel, 'side_panel 已声明');
ok(mf.permissions.includes('sidePanel') && mf.permissions.includes('scripting'), '权限齐全');
ok(mf.host_permissions.includes('<all_urls>'), 'host_permissions 含 <all_urls>');
for (const f of ['background.js', 'sidepanel.html', 'sidepanel.css', 'sidepanel.js', 'options.html', 'options.css', 'options.js', 'providers.js']) {
  ok(fs.existsSync(path.join(DIR, f)), '文件存在 ' + f);
}
for (const s of ['16', '32', '48', '128']) {
  ok(fs.existsSync(path.join(DIR, 'icons', `icon${s}.png`)), `图标 icon${s}.png`);
}

console.log('\n[2] providers.js 协议构造');
const providers = await import(pathToFileURL(path.join(DIR, 'providers.js')).href);
const { PROVIDER_LIST, getProvider, buildRequest } = providers;
ok(PROVIDER_LIST.length >= 10, `供应商数量 ${PROVIDER_LIST.length}`);

const sys = 'SYSTEM';
const hist = [{ role: 'user', text: 'hi' }];
const o = buildRequest(getProvider('openai'), { apiKey: 'k1', model: 'gpt-4o' }, sys, hist);
ok(o.url === 'https://api.openai.com/v1/chat/completions', 'OpenAI URL');
ok(o.kind === 'openai', '返回 kind=openai');
ok(o.init.headers.authorization === 'Bearer k1', 'Authorization 头');
ok(JSON.parse(o.init.body).messages[0].role === 'system', '首条 system');
ok(JSON.parse(o.init.body).stream === true, '开启 stream');

const a = buildRequest(getProvider('anthropic'), { apiKey: 'sk-ant', model: 'claude-sonnet-4-5' }, sys, hist);
ok(a.url === 'https://api.anthropic.com/v1/messages', 'Anthropic URL');
ok(a.init.headers['x-api-key'] === 'sk-ant', 'x-api-key 头');
ok(a.init.headers['anthropic-version'] === '2023-06-01', 'anthropic-version 头');
ok(JSON.parse(a.init.body).system === sys, 'system 单独传');

const g = buildRequest(getProvider('gemini'), { apiKey: 'AIza', model: 'gemini-2.5-pro' }, sys, hist);
ok(g.url.includes('/models/gemini-2.5-pro:streamGenerateContent'), 'Gemini 模型路径');
ok(g.url.includes('key=AIza'), 'Gemini key 进 query');
ok(JSON.parse(g.init.body).system_instruction.parts[0].text === sys, 'system_instruction 结构');

console.log('\n[3] 协议手动覆盖');
const ovAnthropic = buildRequest(
  getProvider('openai'),
  { apiKey: 'k', model: 'm', protocol: 'anthropic', baseUrl: 'https://relay.example.com' },
  sys, hist
);
ok(ovAnthropic.url === 'https://relay.example.com/messages', 'OpenAI 供应商 + Anthropic 协议 → /messages');
ok(ovAnthropic.kind === 'anthropic', 'kind 随协议切换');
ok(ovAnthropic.init.headers['x-api-key'] === 'k', '覆盖后用 x-api-key 而非 Bearer');

const ovOpenai = buildRequest(
  getProvider('anthropic'),
  { apiKey: 'k', model: 'm', protocol: 'openai', baseUrl: 'https://relay.example.com' },
  sys, hist
);
ok(ovOpenai.url === 'https://relay.example.com/chat/completions', 'Anthropic 供应商 + OpenAI 协议 → /chat/completions');
ok(ovOpenai.init.headers.authorization === 'Bearer k', '覆盖后用 Bearer');
ok(JSON.parse(ovOpenai.init.body).messages[0].role === 'system', '覆盖后 system 走 messages 数组');

const ovGemini = buildRequest(
  getProvider('openai'), { apiKey: 'k', model: 'm', protocol: 'gemini', baseUrl: 'https://g.example.com' }, sys, hist
);
ok(ovGemini.url.includes('streamGenerateContent') && ovGemini.url.includes('key=k'), '覆盖 Gemini 协议');

console.log('\n[4] DOM 引用完整性');
const sideHtml = read('sidepanel.html');
const sideJs = read('sidepanel.js');
const optHtml = read('options.html');
const optJs = read('options.js');
const idsOf = (html) => new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const refsOf = (js) => [...js.matchAll(/\$\('#([^']+)'\)/g)].map((m) => m[1]);
const sideIds = idsOf(sideHtml);
const optIds = idsOf(optHtml);
for (const id of refsOf(sideJs)) ok(sideIds.has(id), 'sidepanel.html 有 #' + id);
for (const id of refsOf(optJs)) ok(optIds.has(id), 'options.html 有 #' + id);
for (const id of ['session-btn', 'session-menu', 'menu-new', 'menu-list', 'session-title']) {
  ok(sideIds.has(id), '会话相关元素 #' + id);
}
for (const id of ['protocol', 'autoSession']) {
  ok(optIds.has(id), '设置项 #' + id);
}

console.log('\n[5] 会话逻辑');
ok(/function sessionForUrl/.test(sideJs), '存在 sessionForUrl（按页面找会话）');
ok(/function createSession/.test(sideJs), '存在 createSession');
ok(/function switchSession/.test(sideJs), '存在 switchSession');
ok(/function startNewSession/.test(sideJs), '存在 startNewSession（新建会话入口）');
ok(/urlIndex\[normUrl\(url\)\] = id/.test(sideJs), '新会话写入 urlIndex');
ok(/autoSession/.test(sideJs), '支持 autoSession 开关');
ok(/const changed = url !== lastUrl/.test(sideJs), '仅在 URL 变化时自动切会话');
ok(/createSession\(null\)/.test(sideJs), '手动新建为独立会话');
ok(sideIds.has('new-session'), '顶栏有独立的 #new-session 按钮');
ok(/els\.newSession\.addEventListener\('click', startNewSession\)/.test(sideJs), '新建按钮已绑定事件');

// 会话下拉必须盖在上下文卡之上，否则点不到（.topbar 是 flex item，z-index 对其生效）
const css = read('sidepanel.css');
const zOf = (sel) => {
  const m = new RegExp('\\' + sel + '\\s*\\{[^}]*z-index:\\s*(\\d+)', 's').exec(css);
  return m ? Number(m[1]) : 0;
};
ok(zOf('.topbar') > zOf('.ctxcard'),
  `.topbar z-index(${zOf('.topbar')}) > .ctxcard z-index(${zOf('.ctxcard')})，会话下拉不会被遮挡`);
ok(/\.session-menu\s*\{[^}]*position:\s*absolute/s.test(css), '会话下拉是绝对定位，可浮在内容之上');

console.log('\n[5b] 多模型支持');
ok(sideIds.has('model'), '侧边栏有 #model 下拉');
ok(/function availableModels/.test(sideJs), '存在 availableModels');
ok(/function fillModelSelect/.test(sideJs), '存在 fillModelSelect');
ok(/sessions\[sessionId\]\.model = m/.test(sideJs), '切换模型会记住到当前会话');
ok(/settings\.models/.test(sideJs), 'settings.models 参与模型列表');
ok(optIds.has('models'), '设置页有 #models 字段');
ok(!optIds.has('model'), '设置页不再有单模型字段 #model');
ok(!sideIds.has('quick'), '首页快捷提问卡片已移除');
ok(!/\.suggestions|\.chip \{/.test(css), '快捷卡片样式已清理');

// 解析模型列表：逗号 / 中文逗号 / 分号 / 换行都能分隔
const pm = optJs.slice(optJs.indexOf('function parseModels'), optJs.indexOf('}', optJs.indexOf('function parseModels')) + 1);
const parseModels = new Function(pm + '\nreturn parseModels;')();
ok(JSON.stringify(parseModels('gpt-4o, gpt-4o-mini')) === JSON.stringify(['gpt-4o', 'gpt-4o-mini']), '英文逗号分隔');
ok(JSON.stringify(parseModels('a，b；c\nd')) === JSON.stringify(['a', 'b', 'c', 'd']), '中文逗号/分号/换行分隔');
ok(parseModels('  ').length === 0, '空输入返回空数组');
ok(parseModels('a,,b').length === 2, '忽略空项');

// 会话归一化与绑定逻辑（纯函数抽取验证）
const normIdx = sideJs.indexOf('const normUrl');
const normSrc = sideJs.slice(normIdx, sideJs.indexOf('};', normIdx) + 2);
const normFn = new Function(normSrc + '\nreturn normUrl;')();
ok(normFn('https://a.com/x#frag') === 'https://a.com/x', 'URL 去掉 hash');
ok(normFn('https://a.com/x') === normFn('https://a.com/x#y'), '同页不同 hash 归一到同一会话');
ok(normFn('https://a.com/x?q=1') !== normFn('https://a.com/x?q=2'), '不同 query 视为不同页面');

console.log('\n[6] Markdown 渲染');
const spSrc = sideJs;
const start = spSrc.indexOf('function mdToHtml');
const end = spSrc.indexOf('\n}\n', start) + 3;
const escStart = spSrc.indexOf('const escapeHtml');
const escEnd = spSrc.indexOf('\n\n', escStart);
const mdFn = new Function(spSrc.slice(escStart, escEnd) + '\n' + spSrc.slice(start, end) + '\nreturn mdToHtml;')();
const html = mdFn('# 标题\n\n这是**粗体**和 `code`。\n\n- 一\n- 二\n\n```js\nconst a = 1;\n```\n\n[链接](https://example.com)');
ok(html.includes('<h3>标题</h3>'), '标题');
ok(html.includes('<strong>粗体</strong>'), '粗体');
ok(html.includes('<code>code</code>'), '行内代码');
ok(html.includes('<li>一</li>') && html.includes('<ul>'), '列表');
ok(html.includes('<pre><code>const a = 1;</code></pre>'), '代码块');
ok(html.includes('<a href="https://example.com"'), '链接');
ok(!html.includes('%%BLOCK'), '占位符回收');
ok(!mdFn('<img src=x onerror=alert(1)>').includes('<img'), 'HTML 转义');

console.log('\n[7] 文件卫生');
for (const f of ['sidepanel.js', 'options.js', 'providers.js', 'background.js']) {
  const buf = fs.readFileSync(path.join(DIR, f));
  ok(!buf.includes(0), f + ' 无 NUL 字节');
  ok(!/\beval\(/.test(buf.toString('utf8')), f + ' 无 eval');
}
for (const f of ['sidepanel.html', 'options.html']) {
  ok(!/<script(?![^>]*src=)/i.test(read(f)), f + ' 无内联脚本（符合 CSP）');
}
// 开源前必须过的一关：不能残留本机路径或占位邮箱
const leaked = ['Admin' + 'istrator', 'deepseek' + '-harness', 'YOUR_EMAIL' + '@example.com'];
for (const f of ['sidepanel.js', 'options.js', 'providers.js', 'background.js', 'manifest.json']) {
  const t = read(f);
  for (const k of leaked) ok(!t.includes(k), f + ' 无本机路径/占位符 "' + k + '"');
}

console.log('\n' + (fails === 0 ? '全部通过 ✓' : fails + ' 项失败 ✗'));
process.exit(fails === 0 ? 0 : 1);
