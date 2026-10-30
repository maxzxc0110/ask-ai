# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.0] - 2026-10-30

### 新增

- **一个订阅可配置多个模型**：设置页「模型」支持逗号分隔填写多个，顶栏新增模型下拉随时切换
- 每个会话记住自己使用的模型，切回该会话时自动恢复
- 顶栏新增独立的 **＋ 新建会话** 按钮（此前只能从会话名下拉里新建）
- 顶栏可直接切换 AI 产品（供应商）

### 修复

- 顶栏 z-index 提升，会话下拉不再被上下文卡遮挡
- 长会话标题在顶栏单行省略号显示，不再撑破布局
- 模型下拉在会话切换、供应商切换后保持正确状态

### 变更

- 移除首页的快捷提问卡片（概括这一页 / 我卡在哪 / 提取要点 / 解释术语 / 翻译成英文），空态只保留问候语

## [1.0.0] - 2026-10-30

首个公开版本。

### 新增

- Chrome 侧边栏（`sidePanel` API）网页 AI 助手
- 自动抓取当前网页正文：优先 `article / main / [role=main]`，剔除导航、页脚、广告、评论区
- 选区联动：页面选中文字自动附在问题里
- **按页面自动分会话**：URL 变化自动开新会话，同页追问留在原会话
- 手动新建独立会话 + 会话切换列表
- 流式回答，可随时停止；复制 / 重新生成
- 自定义 Markdown 渲染（标题、列表、代码块、链接、行内代码），输出经 HTML 转义
- 11 家供应商：OpenAI、Claude、Gemini、DeepSeek、Kimi、智谱 GLM、通义千问、OpenRouter、硅基流动、本地 Ollama、自定义端点
- **接口协议可手动指定**：OpenAI / Anthropic / Gemini 格式，兼容只提供单一协议的中转站
- 设置页：供应商、协议、Key、模型、Base URL、正文长度、温度、系统提示词、测试连接
- 深浅色自适应界面
- 本地存储 API Key、设置与会话历史

### 工具

- `tools/validate.mjs` —— 自检：manifest、协议构造、DOM 引用、会话逻辑、Markdown、卫生检查
- `tools/pack.py` —— 打包可分发的 zip
- `tools/make_icons.py` —— 生成图标
- `tools/store-shots.py` —— 生成商店展示图

[1.1.0]: https://github.com/YOUR_ACCOUNT/ask-ai/releases/tag/v1.1.0
[1.0.0]: https://github.com/YOUR_ACCOUNT/ask-ai/releases/tag/v1.0.0
