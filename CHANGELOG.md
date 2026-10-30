# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

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

[1.0.0]: https://github.com/YOUR_ACCOUNT/ask-ai/releases/tag/v1.0.0
