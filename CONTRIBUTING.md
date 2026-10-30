# Contributing

欢迎参与。这个项目很小，门槛低，**任何人都可以直接改完自己用，不必提 PR**。

---

## 本地跑起来

```bash
git clone <repo>
cd ask-ai
```

1. `chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选仓库根目录
2. 改完代码点扩展卡片的「刷新」按钮，侧边栏重开即可生效
3. 跑一遍自检：`node tools/validate.mjs`（应该输出「全部通过 ✓」）

---

## 提交 PR 前请确认

```bash
node tools/validate.mjs     # 必须全绿
python tools/pack.py        # 确认能打出 zip
```

自检会检查：manifest 合法性、三种协议的请求构造、协议手动覆盖、HTML/JS 的 id 引用完整性、会话逻辑、Markdown 渲染与 XSS 转义、以及**是否残留本机绝对路径或占位邮箱**。

---

## 代码约定

- 纯原生 JS（ES Modules），无构建步骤、无框架、无运行时依赖
- 不引入任何远程脚本（CDN）——扩展审核明确禁止远程托管代码
- 不引入统计/广告 SDK
- 用户可见文案保持中文为主，关键注释也写中文
- 新增供应商：在 `providers.js` 的 `PROVIDER_LIST` 里加一项即可，自检会自动覆盖它

---

## 改动到隐私的部分要特别注意

如果你的改动引入了新的数据外发（比如新增默认的中转接口、埋点、崩溃上报），必须**同步**：

1. `PRIVACY.md`
2. `docs/privacy.html`
3. `docs/store-listing.md` 与 `docs/store-submission.md` 的数据披露部分
4. 在 PR 描述里写清楚，方便审核时核对

---

## 提交 Issue 时带上

- Chrome / Edge 版本号
- 扩展版本（`chrome://extensions` 里可见）
- 你选的供应商与接口协议（**不要贴 API Key**）
- 控制台报错截图（`chrome://extensions` → 扩展卡片 → 「检查视图：Service Worker」）

---

## 不要做的事

- 不要提交任何真实 API Key、Cookie 或个人数据
- 不要在示例代码里留绝对路径（自检会拦）
- 不要用 `eval` 或动态插入外部脚本（违反扩展 CSP）
