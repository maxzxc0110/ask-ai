# Chrome 商店上架文案 —— Ask AI · 网页问答助手

## 一、基本信息

| 字段 | 内容 |
|---|---|
| 名称 | Ask AI · 网页问答助手 |
| 简短说明（≤132 字符） | 用你自己的 AI（OpenAI / Claude / Gemini / DeepSeek / Kimi / GLM / 通义 / OpenRouter / 本地 Ollama）在侧边栏读取并问答当前网页，还能读源码、点按钮。 |
| 类别 | Productivity（工作流程） |
| 语言 | 中文（简体）/ English（可提交两个语言版本） |
| 图标 | `screenshots/../icon128.png` → 取自扩展 `icons/icon128.png`（128×128 PNG） |
| 首页 | 你的 GitHub 仓库或产品页（填 URL，不要留空） |
| 支持网址 | 不需要 —— 扩展作用于「当前浏览器窗口内的所有页面」，属于 `<all_urls>` 权限 |

---

## 二、详细说明（中文）

```
Ask AI · 网页问答助手 —— 让你正在看的这个网页，直接开口问。

它会读懂当前页面，然后回答你的问题：这一页讲了什么、我卡在哪一步、哪些是重点、专业术语是什么意思、帮我翻译成英文。

■ 核心能力

· 自动读取当前网页正文：优先抓取文章/正文区域，自动剔除导航栏、页脚、广告和评论区
· 选中即问：在页面上选中一段文字提问，问题会自动带上选区
· 按页面自动分会话：打开新页面自动开新会话，同一页面的追问留在同一会话里
· 随时手动新建会话：顶栏一键新建独立会话，也可以随时切换回之前的会话
· 一个订阅多个模型：设置页填多个模型，顶栏下拉随时切换，每个会话记住自己用的那个
· 页面工具（可选开启）：让 AI 读当前页面的 HTML / CSS / JS 源码与网络请求清单，
  也可以帮你点击按钮、填写输入框、滚动页面；支付、删除、注销、密码这类危险动作会先问你一句
· 流式回答：边写边出，可随时点停；支持 Markdown（标题、列表、代码块、链接）
· 复制 / 重新生成：答案一键复制，或换个说法再来一次

■ 支持的 AI（自带密钥 BYOK，无需注册本扩展账号）

OpenAI、Claude、Gemini、DeepSeek、Kimi（Moonshot）、智谱 GLM、通义千问、OpenRouter、硅基流动、本地 Ollama，以及任何 OpenAI 兼容的自建端点（new-api / one-api / LM Studio 等）。
接口协议可手动指定为 OpenAI 格式、Anthropic 格式或 Gemini 格式，方便对接只提供单一协议的中转站。

■ 隐私

API Key 和对话记录只保存在你本机的浏览器存储里。扩展本身不收集、不上传、不出售任何数据，也没有广告或统计 SDK。你填的服务商收不收、怎么收，取决于你选的那一家。
只有当你主动点击发送时，页面正文和问题才会发往你配置的 AI 服务商。
开启「页面工具」后，AI 还可能在你授权下读取当前页面的 HTML/CSS/JS 源码和网络请求清单，并点击页面上的元素；这些内容同样只发往你配置的 AI 服务商，不会发往别处。危险操作会先弹窗确认。

■ 说明

本扩展使用各家官方 API，API 额度单独计费；ChatGPT Plus / Claude Pro 等网页订阅不包含 API 访问权限，因此无法直接使用。
```

---

## 三、Detailed description (English)

```
Ask AI · Web Q&A Sidebar — ask your current page anything.

It reads the page you are on, then answers your questions: what this article says, what step I'm stuck on, what the key points are, what the jargon means, or translate it into English.

FEATURES

• Reads the current page automatically: prefers the article/main content region and strips navigation, footers, ads and comment sections
• Ask about a selection: select any text on the page and it is attached to your question
• One session per page: opening a new page starts a new conversation; follow-ups on the same page stay together
• Start conversations yourself: one click for a fresh standalone session, and a dropdown to switch back to any earlier one
• Several models per subscription: list them in settings and switch from the dropdown; each chat remembers its own model
• Optional page tools: let the AI read the page's HTML / CSS / JS source and network request list, and click buttons, fill forms or scroll for you. Sensitive actions (payment, delete, logout, passwords) always ask first
• Streaming answers with a stop button, rendered Markdown (headings, lists, code blocks, links)
• Copy or regenerate any answer

SUPPORTED AI (bring your own key, no account needed)

OpenAI, Claude, Gemini, DeepSeek, Kimi (Moonshot), Zhipu GLM, Qwen, OpenRouter, SiliconFlow, local Ollama, plus any OpenAI-compatible endpoint you run yourself (new-api, one-api, LM Studio…).
The request format can be set manually to OpenAI, Anthropic or Gemini style, so it also works with relay services that expose only one protocol.

PRIVACY

Your API key and conversation history stay in your browser's local storage. The extension collects, uploads and sells nothing, and contains no ads or analytics. Whatever your chosen provider does with your data is between you and that provider.
Page content and your questions are sent to the AI service you configured only when you press send.
If you enable Page Tools, the AI may additionally read the page's HTML/CSS/JS source and its network request list, and interact with elements — only after your request, only to the provider you configured, and always with a confirmation prompt for sensitive actions.

NOTE

This extension talks to the official APIs, which are billed separately. ChatGPT Plus and Claude Pro web subscriptions do not include API access, so they cannot be used directly.
```

---

## 四、关键词 / 标签（填在「标签」里，没有就留空）

```
AI 助手, 网页总结, 侧边栏, 划词提问, ChatGPT, Claude, Gemini, DeepSeek, OpenRouter, Ollama, page summary, ask AI, side panel, BYOK
```

---

## 五、截图（1280×800，最多 5 张）

| 文件 | 内容 |
|---|---|
| `screenshots/01-overview.png` | 网页 + 侧边栏空态 |
| `screenshots/02-chat.png` | 网页 + 侧边栏问答中（主力图） |
| `screenshots/03-settings.png` | 设置页（说明自带密钥模式） |

还剩 2 个名额，建议补：④ 多供应商切换 ⑤ 本地 Ollama 接入。
