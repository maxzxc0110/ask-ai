/**
 * 页面工具：给模型用的函数定义 + 页面内执行器 + 危险动作判定
 *
 * 设计原则：
 *  - 只用脚本级能力（chrome.scripting），不申请 chrome.debugger，避免顶部调试横幅
 *  - 事件派发模拟真实交互（pointerdown/mousedown/pointerup/mouseup/click 全序列）
 *  - 填值走 React 原生 setter，兼容受控组件
 *  - 危险动作（支付/删除/注销…）交由用户确认，普通动作自动执行
 */

/** 工具的中文名，用于界面展示 */
export const TOOL_LABELS = {
  page_snapshot: '读取页面源码',
  read_page: '读取页面正文',
  inspect: '查看元素',
  click: '点击元素',
  fill: '填写输入框',
  scroll: '滚动页面',
};

/** 三种协议通用的工具定义（OpenAI / Anthropic / Gemini 各自再转换） */
export const TOOLS = [
  {
    name: 'page_snapshot',
    description:
      '读取当前页面的源代码与网络资源清单。可以取渲染后的 HTML、内联 CSS、外链 CSS/JS 文件地址、' +
      '以及页面已加载的全部网络资源（URL、类型、耗时、大小）。分析网页结构、排查样式或脚本问题时使用。',
    parameters: {
      type: 'object',
      properties: {
        part: {
          type: 'string',
          enum: ['all', 'html', 'css', 'js', 'network'],
          description: '只读取其中一部分以节省上下文，缺省为 all',
        },
        maxChars: { type: 'number', description: '每部分最大字符数，缺省 12000' },
      },
    },
  },
  {
    name: 'read_page',
    description: '读取当前页面已渲染的可见文本。比 HTML 干净得多，适合只想知道"页面上写了什么"。',
    parameters: {
      type: 'object',
      properties: {
        maxChars: { type: 'number', description: '最大字符数，缺省 12000' },
      },
    },
  },
  {
    name: 'inspect',
    description:
      '查看某个元素的信息：标签、可见文本、属性、外框坐标、是否可见、CSS 路径。操作前先看清楚目标时使用。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS 选择器，例如 button.submit' },
        text: { type: 'string', description: '按可见文本定位（没有可靠选择器时用）' },
        index: { type: 'number', description: '匹配到多个时取第几个，从 0 开始' },
      },
    },
  },
  {
    name: 'click',
    description:
      '点击页面上的元素（按钮、链接、菜单项、复选框等）。会派发完整的指针与鼠标事件序列，' +
      '绝大多数前端框架都能正常响应。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS 选择器' },
        text: { type: 'string', description: '按可见文本定位' },
        index: { type: 'number', description: '匹配到多个时取第几个，从 0 开始' },
      },
    },
  },
  {
    name: 'fill',
    description:
      '填写输入框或文本域。会触发 input / change 事件，兼容 React 等受控组件。' +
      '可选择填完后直接提交（submit=true）。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS 选择器，例如 input[name="email"]' },
        text: { type: 'string', description: '按可见文本定位输入框' },
        value: { type: 'string', description: '要填入的内容' },
        submit: { type: 'boolean', description: '填完后是否按回车提交，缺省 false' },
      },
    },
  },
  {
    name: 'scroll',
    description: '滚动页面，或滚动到某个元素。',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: '要滚动到的元素的 CSS 选择器' },
        to: {
          type: 'string',
          enum: ['top', 'bottom', 'element'],
          description: '滚动到哪里，缺省 element',
        },
      },
    },
  },
];

/** 危险动作关键词：命中才需要用户确认 */
const DANGER_RE =
  /(支付|付款|下单|购买|结算|提交订单|确认订单|转账|汇款|充值|付费|扣款|签署|授权|删除|移除|清空|销毁|注销|解绑|退订|终止服务|停用|禁用|解除绑定|\bpay\b|\bpayment\b|\bpurchase\b|\bcheckout\b|\bbuy\b|\border\b|\btransfer\b|\bremit\b|\bdelete\b|\bremove\b|\bdestroy\b|\bdrop\b|\bunsubscribe\b|\bcancel\s+subscription\b|\brevoke\b|\bsign\s?out\b|\blog\s?out\b|\bterminate\b)/i;

const PASSWORD_RE = /(password|passwd|密码|验证码|verification\s*code|otp|短信验证码|银行卡|卡号|cvv|身份证)/i;

/**
 * 判断一个工具调用是否属于危险操作。
 * @param {string} name 工具名
 * @param {object} args 工具参数
 * @returns {{danger:boolean, reason:string}}
 */
export function isDangerous(name, args) {
  const a = args || {};
  const haystack = [
    a.selector || '',
    a.text || '',
    a.value || '',
    typeof a.to === 'string' ? a.to : '',
  ].join(' ');

  if (name === 'fill' && PASSWORD_RE.test(haystack)) {
    return { danger: true, reason: '涉及密码 / 验证码等敏感字段' };
  }
  if (name === 'click' || name === 'fill') {
    if (DANGER_RE.test(haystack)) {
      return { danger: true, reason: '目标看起来是不可撤销的敏感操作' };
    }
  }
  return { danger: false, reason: '' };
}

/**
 * 在页面上下文执行的动作（会被序列化后注入，不能引用外部作用域）
 * @param {{action:string, selector?:string, text?:string, index?:number, value?:string, to?:string, part?:string, maxChars?:number}} payload
 */
export function pageToolExec(payload) {
  const p = payload || {};
  const doc = document;
  const win = window;

  const isVisible = (el) => {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    const st = win.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const depthOf = (el) => {
    let d = 0;
    let n = el;
    while (n && n.parentElement) {
      d++;
      n = n.parentElement;
    }
    return d;
  };

  const textOf = (el) =>
    String(
      (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') ||
        el.getAttribute('placeholder') || '') || ''
    ).trim();

  const cssPath = (el) => {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      let s = n.tagName.toLowerCase();
      if (n.id) {
        parts.unshift('#' + CSS.escape(n.id));
        break;
      }
      const cls =
        n.className && typeof n.className === 'string'
          ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 2)
          : [];
      if (cls.length) s += '.' + cls.map((c) => CSS.escape(c)).join('.');
      const par = n.parentElement;
      if (par) {
        const same = Array.prototype.filter.call(par.children, (c) => c.tagName === n.tagName);
        if (same.length > 1) s += ':nth-of-type(' + (same.indexOf(n) + 1) + ')';
      }
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };

  const resolve = (selector, text, index) => {
    if (selector) {
      let els;
      try {
        els = Array.prototype.slice.call(doc.querySelectorAll(selector));
      } catch (e) {
        return { error: '选择器无效：' + selector };
      }
      if (!els.length) return { error: '没找到匹配「' + selector + '」的元素' };
      const vis = els.filter(isVisible);
      const pool = vis.length ? vis : els;
      return { el: pool[Math.min(index || 0, pool.length - 1)], count: pool.length };
    }
    if (text) {
      const cand = Array.prototype.slice.call(
        doc.querySelectorAll(
          'a,button,input,textarea,select,summary,label,li,h1,h2,h3,p,div,span,[role="button"],[role="link"],[role="tab"],[onclick]'
        )
      );
      const hits = cand
        .filter((el) => {
          const t = textOf(el);
          if (!t) return false;
          if (t === text) return true;
          return t.length <= 60 && t.indexOf(text) >= 0;
        })
        .filter(isVisible);
      if (!hits.length) return { error: '没找到文本为「' + text + '」的元素' };
      hits.sort((a, b) => depthOf(b) - depthOf(a));
      const pool = hits.slice(0, 8);
      return { el: pool[Math.min(index || 0, pool.length - 1)], count: hits.length };
    }
    return { error: '需要 selector 或 text 其中之一来定位元素' };
  };

  try {
    /* ---------------- 读取页面源码 ---------------- */
    if (p.action === 'snapshot') {
      const part = p.part || 'all';
      const max = Math.min(Number(p.maxChars) || 12000, 60000);
      const res = { ok: true, action: 'snapshot', part, title: doc.title, url: location.href };

      if (part === 'all' || part === 'html') {
        const html = doc.documentElement ? doc.documentElement.outerHTML : '';
        res.html = html.slice(0, max);
        res.htmlTotal = html.length;
      }
      if (part === 'all' || part === 'css') {
        res.cssInline = Array.prototype.slice
          .call(doc.querySelectorAll('style'))
          .map((s, i) => ({ index: i, content: (s.textContent || '').slice(0, max) }))
          .filter((x) => x.content.trim());
        res.cssLinks = Array.prototype.slice
          .call(doc.querySelectorAll('link[rel~="stylesheet"]'))
          .map((l) => l.href)
          .filter(Boolean);
      }
      if (part === 'all' || part === 'js') {
        res.jsInline = Array.prototype.slice
          .call(doc.querySelectorAll('script:not([src])'))
          .map((s, i) => ({ index: i, content: (s.textContent || '').slice(0, max) }))
          .filter((x) => x.content.trim());
        res.jsLinks = Array.prototype.slice
          .call(doc.querySelectorAll('script[src]'))
          .map((s) => s.src)
          .filter(Boolean);
      }
      if (part === 'all' || part === 'network') {
        res.resources = (win.performance.getEntriesByType('resource') || []).map((e) => ({
          name: e.name,
          type: e.initiatorType,
          dur: Math.round(e.duration),
          size: e.transferSize || 0,
          decoded: e.decodedBodySize || 0,
        }));
      }
      return res;
    }

    /* ---------------- 读取可见文本 ---------------- */
    if (p.action === 'read_page') {
      const max = Math.min(Number(p.maxChars) || 12000, 60000);
      const raw = doc.body ? String(doc.body.innerText || '') : '';
      const text = raw.replace(/\n{3,}/g, '\n\n');
      return {
        ok: true,
        action: 'read_page',
        text: text.slice(0, max),
        total: text.length,
        truncated: text.length > max,
      };
    }

    /* ---------------- 查看元素 ---------------- */
    if (p.action === 'inspect') {
      const r = resolve(p.selector, p.text, p.index);
      if (r.error) return { ok: false, action: 'inspect', error: r.error };
      const el = r.el;
      const rect = el.getBoundingClientRect();
      const attrs = {};
      Array.prototype.slice.call(el.attributes || []).slice(0, 24).forEach((a) => {
        attrs[a.name] = String(a.value).slice(0, 240);
      });
      const st = win.getComputedStyle(el);
      return {
        ok: true,
        action: 'inspect',
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        text: textOf(el).slice(0, 400),
        field: el.name || el.id || el.getAttribute('aria-label') || '',
        attrs,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        visible: isVisible(el),
        display: st.display,
        role: el.getAttribute('role') || '',
        href: el.href || '',
        disabled: !!el.disabled,
        matches: r.count,
      };
    }

    /* ---------------- 滚动 ---------------- */
    if (p.action === 'scroll') {
      const to = p.to || 'element';
      if (to === 'top') {
        win.scrollTo({ top: 0, behavior: 'smooth' });
        return { ok: true, action: 'scroll', detail: '已滚动到页面顶部' };
      }
      if (to === 'bottom') {
        win.scrollTo({ top: doc.body ? doc.body.scrollHeight : 0, behavior: 'smooth' });
        return { ok: true, action: 'scroll', detail: '已滚动到页面底部' };
      }
      const r = resolve(p.selector, p.text, p.index);
      if (r.error) return { ok: false, action: 'scroll', error: r.error };
      r.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return { ok: true, action: 'scroll', detail: '已滚动到 ' + cssPath(r.el), selector: cssPath(r.el) };
    }

    /* ---------------- 填写 ---------------- */
    if (p.action === 'fill') {
      const r = resolve(p.selector, p.text, p.index);
      if (r.error) return { ok: false, action: 'fill', error: r.error };
      const el = r.el;
      const tag = el.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && !el.isContentEditable) {
        return { ok: false, action: 'fill', error: '目标不是输入框或文本域（' + tag + '）' };
      }
      const value = String(p.value == null ? '' : p.value);
      try {
        const proto =
          tag === 'textarea' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      } catch (e) {
        return { ok: false, action: 'fill', error: '填值失败：' + e.message };
      }
      let submitted = false;
      if (p.submit) {
        const k = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, composed: true };
        el.dispatchEvent(new KeyboardEvent('keydown', k));
        el.dispatchEvent(new KeyboardEvent('keyup', k));
        if (tag === 'input' && el.form) {
          if (el.form.requestSubmit) el.form.requestSubmit();
          else el.form.submit();
          submitted = true;
        }
      }
      return {
        ok: true,
        action: 'fill',
        selector: cssPath(el),
        field: el.name || el.id || el.getAttribute('aria-label') || tag,
        value: value.length > 200 ? value.slice(0, 200) + '…' : value,
        submitted,
      };
    }

    /* ---------------- 点击 ---------------- */
    if (p.action === 'click') {
      const r = resolve(p.selector, p.text, p.index);
      if (r.error) return { ok: false, action: 'click', error: r.error };
      const el = r.el;
      try {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
      } catch {}
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const base = {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
        view: win,
        detail: 1,
      };
      const pe = (type, extra) =>
        new PointerEvent(
          type,
          Object.assign({}, base, {
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
          }, extra || {})
        );
      const me = (type, extra) => new MouseEvent(type, Object.assign({}, base, extra || {}));
      el.dispatchEvent(pe('pointerover'));
      el.dispatchEvent(pe('pointerenter'));
      el.dispatchEvent(pe('pointerdown', { buttons: 1 }));
      el.dispatchEvent(me('mousedown', { buttons: 1 }));
      el.dispatchEvent(pe('pointerup', { buttons: 0 }));
      el.dispatchEvent(me('mouseup', { buttons: 0 }));
      el.dispatchEvent(me('click', { buttons: 0 }));
      return {
        ok: true,
        action: 'click',
        selector: cssPath(el),
        label: textOf(el).slice(0, 120),
        tag: el.tagName.toLowerCase(),
        matches: r.count,
      };
    }

    return { ok: false, error: '未知动作：' + p.action };
  } catch (e) {
    return { ok: false, error: '执行失败：' + (e && e.message ? e.message : String(e)) };
  }
}
