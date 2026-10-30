# 上架表单填写稿 —— Ask AI · 网页问答助手

照着填即可。每一项都对应 Chrome 商店后台的真实字段。

---

## 1. 商店信息

| 后台字段 | 填什么 |
|---|---|
| Item name | `Ask AI · 网页问答助手` |
| Short description（132 字符内） | `用你自己的 AI（OpenAI / Claude / Gemini / DeepSeek / Kimi / GLM / 通义 / OpenRouter / 本地 Ollama）在侧边栏读取并问答当前网页。` |
| Description | 见 `listing.md` 第二节（中英两版，分别提交两个语言版本） |
| Category | Productivity |
| Language | 中文（简体）/ English |
| Homepage URL | 你的 GitHub 仓库或产品页（**必填一个真实可访问的 URL**） |
| Support URL | 同上，或单独的 issue 页面 |
| Support email | 你的邮箱 |
| Icon | 128×128 PNG，用扩展里的 `icons/icon128.png` |
| Screenshots | `screenshots/01-overview.png`、`02-chat.png`、`03-settings.png` |

---

## 2. 单一用途声明（Single purpose）

```
本扩展的唯一用途：在 Chrome 侧边栏中读取用户当前正在浏览的网页内容，
并使用用户自行配置并提供密钥的第三方 AI 服务商，回答用户就该网页提出的问题。
```

---

## 3. 权限理由（Permissions justification）

| 权限 | 理由（可直接抄进后台） |
|---|---|
| `sidePanel` | 在浏览器侧边栏中渲染扩展的主界面（问答对话、页面上下文、设置入口）。 |
| `storage` | 将用户填写的 API Key、模型配置保存在 `chrome.storage.local`，以及保存各会话的对话历史。全部为本地存储，不上传。 |
| `scripting` | 向当前活动标签页注入一个只读脚本，提取页面正文文本（按 article/main/[role=main] 优先级，剔除导航、页脚、广告、评论区）。不修改页面、不采集输入框内容。 |
| `tabs` | 监听活动标签页的变化，以便在用户切换页面时刷新正文抽取、并为新页面自动开启对应的会话。 |
| `activeTab` | 用户点击扩展图标时，临时获得访问当前页面的权限。 |
| `<all_urls>` (host permissions) | 核心功能需要读取**任意**网页的正文文本（扩展是通用的网页问答工具，不能预先枚举站点）。脚本仅提取可见文本，不采集 Cookie、凭据、表单数据、书签或浏览历史。 |

---

## 4. 数据使用披露（Privacy practices / 数据使用情况）

Chrome 现在的后台叫 **Privacy practices**，必填项如下：

| 问题 | 答案 | 说明 |
|---|---|---|
| 是否收集或使用用户数据？ | **是** | 存在"传输给第三方"的行为 |
| 数据类型 | **Website content（网页正文）**、**User prompts（用户提问）**、**Web browsing（当前页面 URL）** | 仅这三类 |
| 收集目的 | **App functionality（实现功能）** | 唯一目的 |
| 是否出售给第三方？ | **否** | — |
| 是否与第三方共享？ | **是** | 但仅限用户自己配置的 AI 服务商，属于实现功能所必需的传输 |
| 是否用于广告或广告相关？ | **否** | — |
| 是否用于与广告无关的用途？ | **否** | — |
| 是否与单一用途声明相关？ | **是** | 必需 |
| 传输时是否加密？ | **是** | 一律走 HTTPS 到用户配置的端点 |
| 是否提供删除数据的途径？ | **是** | 清空会话 / 卸载扩展即全部删除；也可在设置页重置 |

> ⚠️ **如实填，别少填。** 少填被查实属于违规，会被下架并影响开发者账号信誉。这里如实声明反而是加分项——「不收集、不中转、用户自带密钥」的扩展在隐私审核里是最干净的一类。

---

## 5. 审核员备注（Review notes，可选但强烈建议填）

```
This is a BYOK (bring your own key) extension: it does not require an account and
does not run any backend of ours. All code ships inside the package; no remote code
is downloaded or executed.

To test: install the extension, click the toolbar icon to open the side panel,
open the gear menu and paste any OpenAI-compatible API key (or point it to a local
Ollama instance at http://localhost:11434/v1), then click "测试连接 / Test
connection". After that, open any article page and ask a question.

Permissions justification:
- sidePanel: renders the assistant UI.
- storage: saves the user's API key and session history locally.
- scripting + <all_urls>: reads the visible text of the page the user is asking
  about (article/main content preferred, nav/footer/ads/comments stripped).
- tabs/activeTab: refreshes the extracted text and keeps one conversation per page.

Privacy: nothing is collected by us. Page text and questions are sent only to the
AI provider the user configured, only after the user presses send. No analytics,
no ads, no telemetry SDKs, no server of our own.
```

---

## 6. 被拒原因预判与对策

| 常见拒因 | 对策 |
|---|---|
| 「功能不完整/无法使用」（因为没有 Key 就是空壳） | 描述开头写清 BYOK；用截图 3 展示设置页；必要时在扩展内加一个**本地演示模式**（不联网、返回示例答案）——但这可能被视为虚假功能，权衡后再决定 |
| 「权限申请过宽」 | 在权限理由里逐条说明 `<all_urls>` 的必要性；商店文案里也写明「只读取可见文本，不采集 Cookie / 凭据 / 浏览历史」 |
| 「名称与已有扩展易混淆」 | 已用「网页问答助手」区分；若仍被拒，换成更独特的名字后重新提交 |
| 「缺少隐私政策」 | 把 `privacy.html` 传到 GitHub Pages / Netlify / Cloudflare Pages，把 URL 填进后台 |
| 「隐私披露与实际行为不符」 | 严格按第 4 节填，不要自行扩大或缩小范围 |
| 「远程代码」 | 本扩展无任何远程 JS；注意未来不要引入 CDN 版第三方库 |

---

## 7. 发布后

- 商店链接格式：`https://chromewebstore.google.com/detail/<扩展ID>`
- 首次审核：通常 3 天 ~ 2 周；被拒后整改再提一般 1-3 天
- 更新版本：在商店后台「上传新版本」，版本号必须比 manifest 里的 `version` 大
- 任何改动（尤其新增权限）都要同步更新隐私披露与商店文案
