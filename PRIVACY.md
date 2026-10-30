# 隐私政策 / Privacy Policy

**Ask AI · 网页问答助手** — 最近更新：2026 年 10 月 30 日

> 一句话：**本扩展不收集、不上传、不出售任何数据。** 你的 API Key 和对话记录只存在你自己浏览器的本地存储里。

完整可托管版本见 [`docs/privacy.html`](docs/privacy.html)（可直接发布到 GitHub Pages）。

---

## 1. 收集什么

**什么都不收集。** 扩展不包含任何分析、广告或遥测 SDK，不会向开发者发送你的浏览记录、页面内容、对话内容或任何标识信息，也不存在任何自有服务器或中转接口。全部代码在扩展包内本地运行。

## 2. 本地存储了什么

仅保存在你本机的 `chrome.storage.local`，只在你自己的浏览器里，卸载扩展即被删除：

- 设置页填写的 API Key、模型名、Base URL 与其他偏好
- 各会话的对话历史（提问与回答）

这些数据不会被上传，也不会同步到任何服务器。

## 3. 什么时候会向外部发送数据

只有当你**主动点击发送**时，扩展才会把下列内容发往**你在设置页配置的 AI 服务商**：

- 你输入的问题
- 当前网页的正文（默认截断到设定字数，可通过「附带正文」开关完全关闭）
- 你在页面上选中的文字
- 当前会话的上下文历史
- **（仅在开启「页面工具」时）** 当前页面的 HTML / CSS / JS 源码片段，以及该页面已发出的网络请求清单（URL、类型、耗时、大小；不含请求体与响应体）

该服务商如何处理这些数据，取决于它自己的隐私政策与条款，不受本扩展控制。请只选择你信任的服务商。

## 4. 页面工具会做什么

「页面工具」可以随时关闭（侧边栏底部开关或设置页），关闭后扩展只读正文、不做任何交互。开启后，在你的请求下 AI 可以：

- 读取当前页面渲染后的 HTML、内联 CSS、外链 CSS/JS 文本，以及页面已加载的网络资源清单
- 点击页面上的元素、填写输入框或文本域、滚动页面

扩展**不会**代替你提交支付、删除数据或输入密码验证码：涉及支付、删除、注销、退订、密码与验证码等操作时，会先弹出确认卡，只有你点了「允许一次」才会执行。它不读取已保存的密码，也不会绕过验证码。

扩展**不申请** `debugger` 权限，因此不会在浏览器顶部出现「正在调试此浏览器」的提示条，也不具备控制浏览器窗口、拦截任意网络响应体或操作文件选择器的能力。

## 5. 权限说明

| 权限 | 用途 |
|---|---|
| `<all_urls>` | 读取任意页面的正文文本（启用页面工具时还包括页面源码），这是核心功能所必需 |
| `scripting` | 在页面注入脚本：提取正文，执行页面工具的点击 / 填表等操作 |
| `tabs` / `activeTab` | 获知当前活动标签页，用于刷新正文并按页面切换会话 |
| `storage` | 保存本地设置与会话历史 |
| `sidePanel` | 在侧边栏显示扩展界面 |

扩展**不读取**浏览历史记录、Cookie、书签、已保存密码或下载记录。

## 6. 儿童隐私

本扩展不面向 13 岁以下儿童，也不会有意收集儿童的个人信息。

## 7. 政策变更

若未来更新扩展并改变数据处理方式（例如新增统计功能），我们会先更新本页面并在扩展内明示，同时更新 Chrome 商店的隐私标签。

## 8. 联系我们

隐私相关请求请提交 GitHub Issue：<https://github.com/maxzxc0110/ask-ai/issues>

---

## English

**Ask AI · Web Q&A Sidebar collects nothing.** No analytics, no ads, no telemetry, no server of our own. Your API key and chat history stay in your browser's local storage.

Only when you press send, the page text, your selection and your question are transmitted to **the AI provider you configured**. That provider's handling of the data is governed by its own policy.

The `<all_urls>` permission is required to read the text of the page you are asking about. The extension does not read your browsing history, cookies, bookmarks, saved passwords or downloads.

The optional **Page Tools** feature (switchable from the panel footer or the settings page) lets the AI read the page's HTML/CSS/JS source and its network resource list, and click or fill elements on your request. Sensitive actions (payment, delete, logout, passwords) always require your confirmation first. The extension does not request the `debugger` permission, so no "being debugged" banner ever appears.
