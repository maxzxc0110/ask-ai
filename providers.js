/**
 * 供应商目录 + 请求构造 + 流式解析
 * 三种协议：openai(兼容) / anthropic / gemini
 */

export const PROVIDER_LIST = [
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    base: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    keyHint: 'platform.openai.com → API keys，形如 sk-...',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    kind: 'anthropic',
    base: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
    keyHint: 'console.anthropic.com → API keys，形如 sk-ant-...',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    keyHint: 'aistudio.google.com/apikey，形如 AIza...',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    base: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'platform.deepseek.com → API keys，形如 sk-...',
  },
  {
    id: 'moonshot',
    label: 'Kimi 月之暗面',
    kind: 'openai',
    base: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-128k', 'moonshot-v1-32k'],
    keyHint: 'platform.moonshot.cn → API Key，形如 sk-...',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    kind: 'openai',
    base: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4.6', 'glm-4-plus', 'glm-4-flash'],
    keyHint: 'bigmodel.cn → API Keys',
  },
  {
    id: 'qwen',
    label: '通义千问',
    kind: 'openai',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    keyHint: 'bailian.console.aliyun.com → API-KEY，形如 sk-...',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    base: 'https://openrouter.ai/api/v1',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-pro'],
    keyHint: 'openrouter.ai/keys，形如 sk-or-...（一个 key 打通多家模型）',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    kind: 'openai',
    base: 'https://api.siliconflow.cn/v1',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
    keyHint: 'cloud.siliconflow.cn → API 密钥',
  },
  {
    id: 'ollama',
    label: '本地 Ollama',
    kind: 'openai',
    base: 'http://127.0.0.1:11434/v1',
    models: ['qwen2.5:7b', 'llama3.1:8b', 'gemma3:12b'],
    keyHint: '本地无需 key，随便填 ollama 即可；先确认 ollama serve 在跑',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    kind: 'openai',
    base: '',
    models: [],
    keyHint: '任何 OpenAI 兼容端点，例如自建 new-api / one-api / LM Studio',
  },
];

export function getProvider(id) {
  return PROVIDER_LIST.find((p) => p.id === id) || PROVIDER_LIST[0];
}

export function resolveBase(provider, settings) {
  const custom = (settings.baseUrl || '').trim();
  return (custom || provider.base || '').replace(/\/+$/, '');
}

const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
};

const asText = (v) => (typeof v === 'string' ? v : JSON.stringify(v == null ? '' : v));

/**
 * 构造请求体。
 * @param {object} provider
 * @param {object} settings
 * @param {string} sysText
 * @param {Array} turns 统一结构的历史：
 *   {role:'user', text} | {role:'assistant', text, toolCalls:[{id,name,args}]} | {role:'tool', toolCallId, name, result}
 * @param {Array} [tools] 工具定义（统一格式），为空则不启用工具调用
 */
export function buildRequest(provider, settings, sysText, turns, tools) {
  const base = resolveBase(provider, settings);
  const key = (settings.apiKey || '').trim();
  const model = (settings.model || '').trim() || provider.models[0];
  const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.3;

  // 接口协议：auto = 按供应商默认；也可手动指定 openai / anthropic / gemini
  const kind =
    settings.protocol && settings.protocol !== 'auto' ? settings.protocol : provider.kind;

  if (!base) throw new Error('没有配置 API Base URL，请到设置页填写');

  const history = (turns || []).filter((m) => m && m.role !== 'system');
  const useTools = Array.isArray(tools) && tools.length > 0;

  if (kind === 'anthropic') {
    const messages = [];
    for (const m of history) {
      if (m.role === 'user') {
        messages.push({ role: 'user', content: [{ type: 'text', text: m.text || '' }] });
      } else if (m.role === 'assistant') {
        const content = [];
        if (m.text) content.push({ type: 'text', text: m.text });
        for (const c of m.toolCalls || []) {
          content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
        }
        if (content.length) messages.push({ role: 'assistant', content });
      } else if (m.role === 'tool') {
        const isErr = m.result && m.result.error;
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: m.toolCallId,
              content: asText(m.result),
              is_error: !!isErr,
            },
          ],
        });
      }
    }
    const body = {
      model,
      max_tokens: settings.maxTokens || 4096,
      temperature,
      system: sysText,
      messages,
      stream: true,
    };
    if (useTools) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    return {
      url: `${base}/messages`,
      kind,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      },
    };
  }

  if (kind === 'gemini') {
    const contents = [];
    for (const m of history) {
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.text || '' }] });
      } else if (m.role === 'assistant') {
        const parts = [];
        if (m.text) parts.push({ text: m.text });
        for (const c of m.toolCalls || []) parts.push({ functionCall: { name: c.name, args: c.args || {} } });
        if (parts.length) contents.push({ role: 'model', parts });
      } else if (m.role === 'tool') {
        contents.push({
          role: 'user',
          parts: [{ functionResponse: { name: m.name, response: m.result || {} } }],
        });
      }
    }
    const body = {
      system_instruction: { parts: [{ text: sysText }] },
      contents,
      generationConfig: { temperature, maxOutputTokens: settings.maxTokens || 8192 },
    };
    if (useTools) {
      body.tools = [
        {
          function_declarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    const url =
      `${base}/models/${encodeURIComponent(model)}:streamGenerateContent` +
      `?alt=sse&key=${encodeURIComponent(key)}`;
    return {
      url,
      kind,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    };
  }

  // openai 兼容
  const messages = [{ role: 'system', content: sysText }];
  for (const m of history) {
    if (m.role === 'user') {
      messages.push({ role: 'user', content: m.text || '' });
    } else if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: m.text || null };
      if (m.toolCalls && m.toolCalls.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args || {}) },
        }));
      }
      messages.push(msg);
    } else if (m.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: asText(m.result),
      });
    }
  }
  const body = { model, messages, temperature, stream: true };
  if (useTools) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }
  return {
    url: `${base}/chat/completions`,
    kind,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    },
  };
}

function deltaOf(kind, obj) {
  if (kind === 'anthropic') {
    if (obj.type === 'content_block_delta' && obj.delta && obj.delta.type === 'text_delta') {
      return obj.delta.text || '';
    }
    return '';
  }
  if (kind === 'gemini') {
    const parts = (obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts) || [];
    return parts.map((p) => p.text || '').join('');
  }
  const ch = obj.choices && obj.choices[0];
  if (!ch) return '';
  return (ch.delta && ch.delta.content) || '';
}

/**
 * 读 SSE，逐段回调文本；同时收集工具调用。
 * @returns {{text:string, toolCalls:Array<{id:string,name:string,args:object}>}}
 */
export async function streamCompletion(res, kind, onDelta, signal) {
  if (!res.body) throw new Error('这个端点没有返回流式响应');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  const toolAcc = new Map(); // index -> {id, name, argsText}
  let geminiCalls = [];

  const handleBlock = (block) => {
    for (const rawLine of block.split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let obj;
      try {
        obj = JSON.parse(data);
      } catch {
        continue;
      }
      if (obj.error) {
        throw new Error(obj.error.message || '上游返回 error');
      }

      // —— 工具调用收集 ——
      if (kind === 'openai') {
        const ch = obj.choices && obj.choices[0];
        const tcs = (ch && ch.delta && ch.delta.tool_calls) || [];
        for (const tc of tcs) {
          const idx = tc.index == null ? 0 : tc.index;
          const acc = toolAcc.get(idx) || { id: '', name: '', argsText: '' };
          if (tc.id) acc.id = tc.id;
          if (tc.function && tc.function.name) acc.name += tc.function.name;
          if (tc.function && tc.function.arguments) acc.argsText += tc.function.arguments;
          toolAcc.set(idx, acc);
        }
      } else if (kind === 'anthropic') {
        if (obj.type === 'content_block_start' && obj.content_block && obj.content_block.type === 'tool_use') {
          toolAcc.set(obj.index, {
            id: obj.content_block.id || '',
            name: obj.content_block.name || '',
            argsText: '',
          });
        } else if (obj.type === 'content_block_delta' && obj.delta && obj.delta.type === 'input_json_delta') {
          const acc = toolAcc.get(obj.index);
          if (acc) acc.argsText += obj.delta.partial_json || '';
        }
      } else if (kind === 'gemini') {
        const parts =
          (obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts) || [];
        for (const part of parts) {
          if (part.functionCall) geminiCalls.push(part.functionCall);
        }
      }

      const piece = deltaOf(kind, obj);
      if (piece) {
        full += piece;
        onDelta(piece);
      }
    }
  };

  try {
    while (true) {
      if (signal && signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleBlock(block);
      }
    }
    if (buffer.trim()) handleBlock(buffer);
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }

  let toolCalls = [];
  if (kind === 'gemini') {
    toolCalls = geminiCalls.map((c, i) => ({
      id: 'call_' + Date.now().toString(36) + '_' + i,
      name: c.name,
      args: c.args || {},
    }));
  } else {
    toolCalls = Array.from(toolAcc.values())
      .filter((a) => a.name)
      .map((a, i) => ({
        id: a.id || 'call_' + Date.now().toString(36) + '_' + i,
        name: a.name,
        args: safeJson(a.argsText),
      }));
  }

  return { text: full, toolCalls };
}

/** 非流式测试连通性 */
export async function testConnection(provider, settings) {
  const base = resolveBase(provider, settings);
  const key = (settings.apiKey || '').trim();
  const model = (settings.model || '').trim() || provider.models[0];
  const kind =
    settings.protocol && settings.protocol !== 'auto' ? settings.protocol : provider.kind;
  if (!base) throw new Error('Base URL 为空');

  if (kind === 'anthropic') {
    const res = await fetch(`${base}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }] }],
      }),
    });
    if (!res.ok) throw new Error(await readErr(res));
    return true;
  }

  if (kind === 'gemini') {
    const res = await fetch(
      `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
      }
    );
    if (!res.ok) throw new Error(await readErr(res));
    return true;
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8 }),
  });
  if (!res.ok) throw new Error(await readErr(res));
  return true;
}

export async function readErr(res) {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      detail = (j.error && (j.error.message || j.error)) || j.message || text;
    } catch {
      detail = text;
    }
  } catch {}
  const hint =
    res.status === 401 || res.status === 403
      ? '（API Key 无效或没有权限）'
      : res.status === 404
        ? '（模型名或 Base URL 不对）'
        : res.status === 429
          ? '（限流或余额不足）'
          : '';
  return `HTTP ${res.status} ${hint} ${String(detail).slice(0, 400)}`;
}
