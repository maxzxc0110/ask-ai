/* 端到端测试用的 chrome / fetch 桩（经典脚本，必须先于 sidepanel.js 模块执行） */
(function () {
  const store = {
    settings: {
      providerId: 'openai',
      protocol: 'openai',
      apiKey: 'sk-test-not-a-real-key',
      models: ['gpt-4o'],
      model: 'gpt-4o',
      baseUrl: '',
      temperature: 0.2,
      maxTokens: 1024,
      maxChars: 2000,
      includeBody: true,
      autoSession: true,
      allowPageTools: true,
      confirmDangerous: true,
      systemPrompt: '你是一个测试用的网页助手。',
    },
  };

  window.__store = store;
  window.__requests = [];      // 记录每次请求体
  window.__round = null;       // 当前这轮该返回什么
  window.__clicks = [];        // 被点击的元素 id
  window.__sse = [];

  const sseText = (t) =>
    'data: ' + JSON.stringify({ choices: [{ delta: { content: t } }] }) + '\n\n' +
    'data: [DONE]\n\n';

  const sseTool = (name, args, id) =>
    'data: ' +
    JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: id || 'call_1', function: { name: name, arguments: JSON.stringify(args) } },
            ],
          },
        },
      ],
    }) +
    '\n\n' +
    'data: [DONE]\n\n';

  window.__setRound = (round) => {
    window.__round = round;
  };

  window.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const out = {};
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) if (k in store) out[k] = store[k];
          return out;
        },
        set: async (obj) => {
          Object.assign(store, obj);
        },
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://example.com/demo', title: '示例页面' }],
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
    },
    windows: { getCurrent: async () => ({ id: 1 }) },
    scripting: {
      executeScript: async ({ func, args }) => {
        const res = func.apply(null, args || []);
        return [{ result: res }];
      },
    },
    runtime: { openOptionsPage: () => {} },
  };

  window.fetch = async (url, init) => {
    let body = {};
    try {
      body = JSON.parse((init && init.body) || '{}');
    } catch (e) {}
    window.__requests.push(body);

    const round = window.__round || { text: '（无脚本）' };
    // 只看当前这一轮（最后一条 user 之后）有没有工具结果
    const msgs = body.messages || [];
    let lastUser = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUser = i;
        break;
      }
    }
    const hasToolResult = msgs.slice(lastUser + 1).some((m) => m.role === 'tool');
    let sse;
    if (hasToolResult) {
      sse = sseText(round.text || '好了');
    } else if (round.tool) {
      sse = sseTool(round.tool.name, round.tool.args || {}, round.tool.id);
    } else {
      sse = sseText(round.text || '（无脚本）');
    }
    window.__sse.push(sse);
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode(sse));
          c.close();
        },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } }
    );
  };

  // 测试用的"网页"元素
  const box = document.createElement('div');
  box.id = 'fake-page';
  box.innerHTML =
    '<button id="target" type="button">点我</button>' +
    '<button id="pay" type="button">确认支付</button>' +
    '<input id="email" type="text" />';
  document.body.appendChild(box);
  document.getElementById('target').addEventListener('click', () => {
    window.__clicks.push('target');
  });
  document.getElementById('pay').addEventListener('click', () => {
    window.__clicks.push('pay');
  });
})();
