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
const provMod = await import(pathToFileURL(path.join(DIR, 'providers.js')).href);

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

console.log('\n[2b] 流式工具调用解析');
const sse = (chunks) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    })
  );

// OpenAI：tool_calls 分片累加
const oaSse = sse([
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"click","arguments":"{\\"selector\\":"}}]}}]}\n\n',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"#btn\\"}"}}]}}]}\n\n',
  'data: [DONE]\n\n',
]);
const oaOut = await provMod.streamCompletion(oaSse, 'openai', () => {});
ok(oaOut.toolCalls.length === 1, 'openai 解析出 1 个工具调用');
ok(oaOut.toolCalls[0] && oaOut.toolCalls[0].name === 'click', 'openai 工具名正确');
ok(oaOut.toolCalls[0] && oaOut.toolCalls[0].args.selector === '#btn', 'openai 参数拼接正确');
ok(oaOut.toolCalls[0] && oaOut.toolCalls[0].id === 'call_1', 'openai 工具调用 id 正确');

// Anthropic：content_block_start + input_json_delta
const anSse = sse([
  'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"fill"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"value\\":\\"a"}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"b\\"}"}}\n\n',
]);
const anOut = await provMod.streamCompletion(anSse, 'anthropic', () => {});
ok(anOut.toolCalls.length === 1, 'anthropic 解析出 1 个工具调用');
ok(anOut.toolCalls[0] && anOut.toolCalls[0].name === 'fill', 'anthropic 工具名正确');
ok(anOut.toolCalls[0] && anOut.toolCalls[0].args.value === 'ab', 'anthropic 参数拼接正确');
ok(anOut.toolCalls[0] && anOut.toolCalls[0].id === 'toolu_1', 'anthropic 工具调用 id 正确');

// Gemini：functionCall
const gmSse = sse([
  'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"scroll","args":{"to":"bottom"}}}]}}]}\n\n',
]);
const gmOut = await provMod.streamCompletion(gmSse, 'gemini', () => {});
ok(gmOut.toolCalls.length === 1, 'gemini 解析出 1 个工具调用');
ok(gmOut.toolCalls[0] && gmOut.toolCalls[0].name === 'scroll', 'gemini 工具名正确');
ok(gmOut.toolCalls[0] && gmOut.toolCalls[0].args.to === 'bottom', 'gemini 参数正确');

// 普通文本流不应产生工具调用
const txtSse = sse(['data: {"choices":[{"delta":{"content":"你好"}}]}\n\n']);
const txtOut = await provMod.streamCompletion(txtSse, 'openai', () => {});
ok(txtOut.toolCalls.length === 0 && txtOut.text === '你好', '普通文本流不产生工具调用');

console.log('\n[5c] 页面工具（读源码 / 操作页面）');
ok(fs.existsSync(path.join(DIR, 'page-tools.js')), '文件存在 page-tools.js');
const toolsSrc = read('page-tools.js');
const toolMod = await import(pathToFileURL(path.join(DIR, 'page-tools.js')).href);

ok(Array.isArray(toolMod.TOOLS) && toolMod.TOOLS.length === 6, '定义了 6 个页面工具');
ok(new Set(toolMod.TOOLS.map((t) => t.name)).size === toolMod.TOOLS.length, '工具名唯一');
ok(toolMod.TOOLS.every((t) => t.parameters && t.parameters.type === 'object'), '每个工具都有 JSON Schema');
ok(toolMod.TOOLS.every((t) => toolMod.TOOL_LABELS[t.name]), '每个工具都有中文界面名');
ok(/export function pageToolExec/.test(toolsSrc), 'pageToolExec 可注入页面执行');
ok(/getEntriesByType\('resource'\)/.test(toolsSrc), '能读取网络资源清单');
ok(/outerHTML/.test(toolsSrc), '能读取页面 HTML');
ok(/querySelectorAll\('link\[rel~="stylesheet"\]'\)/.test(toolsSrc), '能收集外链 CSS');
ok(/querySelectorAll\('script\[src\]'\)/.test(toolsSrc), '能收集外链 JS');
ok(/PointerEvent/.test(toolsSrc), '点击派发完整指针事件序列');
ok(/HTMLInputElement\.prototype/.test(toolsSrc), '填值走原生 setter（兼容 React）');

// 危险动作判定
ok(toolMod.isDangerous('click', { text: '确认支付' }).danger, '支付类点击判为危险');
ok(toolMod.isDangerous('click', { text: '删除账号' }).danger, '删除类点击判为危险');
ok(toolMod.isDangerous('fill', { selector: 'input[type=password]' }).danger, '密码字段判为危险');
ok(!toolMod.isDangerous('click', { text: '展开更多' }).danger, '普通点击不判为危险');
ok(!toolMod.isDangerous('page_snapshot', {}).danger, '读源码不判为危险');

// 三种协议的工具格式（真实调用 buildRequest）
const fakeProvider = { id: 'x', label: 'X', kind: 'openai', base: 'https://x.test/v1', models: ['m'] };
const fakeTools = [{ name: 'click', description: 'd', parameters: { type: 'object', properties: { selector: { type: 'string' } } } }];
const mkSettings = (protocol) => ({ apiKey: 'k', model: 'm', protocol, maxTokens: 1024, temperature: 0.2 });
const turns = [
  { role: 'user', text: 'hi' },
  { role: 'assistant', text: '', toolCalls: [{ id: 'call_1', name: 'click', args: { selector: '#x' } }] },
  { role: 'tool', toolCallId: 'call_1', name: 'click', result: { ok: true, label: '按钮' } },
];

const oaBody = JSON.parse(provMod.buildRequest(fakeProvider, mkSettings('openai'), 'sys', turns, fakeTools).init.body);
ok(!!oaBody.tools && oaBody.tools[0].type === 'function', 'openai 请求带 function 工具声明');
ok(oaBody.tools[0].function.name === 'click', 'openai 工具名正确');
ok(oaBody.messages.some((m) => m.role === 'tool' && m.tool_call_id === 'call_1'), 'openai 回传工具结果');
ok(oaBody.messages.some((m) => m.tool_calls && m.tool_calls[0].function.name === 'click'), 'openai 回传工具调用');

const anBody = JSON.parse(provMod.buildRequest(fakeProvider, mkSettings('anthropic'), 'sys', turns, fakeTools).init.body);
ok(!!anBody.tools && anBody.tools[0].input_schema, 'anthropic 请求带 input_schema');
ok(anBody.messages.some((m) => JSON.stringify(m.content).includes('tool_use')), 'anthropic 回传工具调用');
ok(anBody.messages.some((m) => JSON.stringify(m.content).includes('tool_result')), 'anthropic 回传工具结果');

const gmBody = JSON.parse(provMod.buildRequest(fakeProvider, mkSettings('gemini'), 'sys', turns, fakeTools).init.body);
ok(!!gmBody.tools && !!gmBody.tools[0].function_declarations, 'gemini 请求带 functionDeclarations');
ok(JSON.stringify(gmBody.contents).includes('functionCall'), 'gemini 回传工具调用');
ok(JSON.stringify(gmBody.contents).includes('functionResponse'), 'gemini 回传工具结果');

// 不带工具时不该出现 tools 字段
const noTools = JSON.parse(provMod.buildRequest(fakeProvider, mkSettings('openai'), 'sys', turns, []).init.body);
ok(!noTools.tools, '关闭工具时不发 tools 字段');

// 侧边栏的 Agent 循环
ok(/MAX_TOOL_ROUNDS/.test(sideJs), '有工具轮次上限');
ok(/async function runTool/.test(sideJs), '有工具执行器');
ok(/async function execInPage/.test(sideJs), '有页面注入执行');
ok(/function requestConfirm/.test(sideJs), '有危险动作确认');
ok(/isDangerous\(/.test(sideJs), '危险判定已接入');
ok(/role: 'tool'/.test(sideJs), '工具结果回传给模型');
ok(/toolsOn \? TOOLS : \[\]/.test(sideJs), '按开关决定是否下发工具');
ok(/allowPageTools/.test(sideJs) && /confirmDangerous/.test(sideJs), '两个开关都接上了');
ok(sideIds.has('toggle-tools'), '侧边栏有页面工具开关');
ok(/^\.activity\s*\{/m.test(css) && /^\.act-row\s*\{/m.test(css), '工具活动行有样式');
ok(/^\.confirm-card\s*\{/m.test(css), '确认卡片有样式');
ok(optIds.has('allowPageTools') && optIds.has('confirmDangerous'), '设置页有页面工具开关');
// 承诺过不申请 debugger 权限
ok(!mf.permissions.includes('debugger'), '未申请 debugger 权限（不出现调试横幅）');
ok(!/chrome\.debugger\./.test(sideJs) && !/chrome\.debugger\./.test(toolsSrc), '代码未调用 chrome.debugger API');

// 端到端测试脚手架必须在
for (const f of ['tools/test-tools.py', 'tools/test-tools.html', 'tools/test-agent.py', 'tools/test-agent-stub.js', 'tools/test-agent-run.js']) {
  ok(fs.existsSync(path.join(DIR, f)), '存在 ' + f);
}
ok(/test-agent\.py/.test(read('.github/workflows/ci.yml')), 'CI 里跑了端到端测试');
ok(fs.existsSync(path.join(DIR, 'tools/sync-extension.py')), '存在 tools/sync-extension.py');
ok(/from pack import RUNTIME/.test(read('tools/sync-extension.py')), '同步脚本与打包脚本共用同一份文件清单');

// 打包清单必须覆盖所有本地 import，否则装成 zip 会白屏
const packPy = read('tools/pack.py');
const packList = packPy.slice(packPy.indexOf('RUNTIME = ['), packPy.indexOf(']', packPy.indexOf('RUNTIME = [')));
for (const f of ['page-tools.js', 'providers.js']) {
  ok(packList.includes('"' + f + '"'), '打包清单包含 ' + f);
}
const localImports = new Set();
for (const src of [sideJs, optJs, read('providers.js'), toolsSrc]) {
  for (const m of src.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)) localImports.add(m[1]);
}
ok(localImports.size > 0, '扫描到本地模块引用');
for (const f of localImports) {
  ok(packList.includes('"' + f + '"'), '本地模块 ' + f + ' 在打包清单里');
}

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
