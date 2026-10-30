"""生成 Chrome 商店用的 1280x800 展示图：模拟网页 + 真实渲染的侧边栏。

用法（在仓库根目录）：
    python tools/store-shots.py

需要本机装有 Chrome；路径会自动按脚本位置推导，不含任何个人绝对路径。
"""
import os
import shutil
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEV = os.path.join(ROOT, ".tmp-store-shots")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    shutil.which("chrome") or "",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
]
CHROME = next((c for c in CHROME_CANDIDATES if c and os.path.exists(c)), "")
if not CHROME:
    raise SystemExit("找不到 Chrome，请先安装 Chrome 或设置 CHROME_PATH 环境变量")
PROFILE = os.path.join(DEV, ".chrome-profile")

VIEW = os.path.join(DEV, "store-view")
SHOTS = os.path.join(ROOT, "docs", "screenshots")
os.makedirs(VIEW, exist_ok=True)
os.makedirs(SHOTS, exist_ok=True)

for f in ("sidepanel.css", "sidepanel.html", "sidepanel.js", "providers.js", "options.css", "options.html", "options.js"):
    shutil.copy(os.path.join(ROOT, f), os.path.join(VIEW, f))

# ---- 对话态 demo（静态消息）----
demo = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="sidepanel.css"></head><body>
<header class="topbar">
  <div class="tb-left"><span class="mark"></span>
    <div class="session-wrap"><button class="session-btn"><span>这篇讲了什么</span>
      <svg class="chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button></div>
  </div>
  <div class="tb-right"><select id="provider"><option>Claude</option></select>
    <button class="icon-btn"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.1"/><path d="M19.1 14.5a1.5 1.5 0 0 0 .3 1.7l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.5 1.5 0 0 0-2.6 1v.2a1.9 1.9 0 1 1-3.8 0v-.1a1.5 1.5 0 0 0-2.6-1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.5 1.5 0 0 0-1-2.6h-.2a1.9 1.9 0 1 1 0-3.8h.1a1.5 1.5 0 0 0 1-2.6l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.2a1.9 1.9 0 1 1 3.8 0v.1a1.5 1.5 0 0 0 2.6 1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.5 1.5 0 0 0 1 2.6h.2a1.9 1.9 0 1 1 0 3.8h-.1a1.5 1.5 0 0 0-1.4.9z"/></svg></button></div>
</header>
<section class="ctxcard">
  <div class="ctx-left"><span class="ctx-dot ok"></span>
    <div class="ctx-text"><div class="ctx-title">用 Rust 写一个高性能 HTTP 代理 - 知乎</div>
    <div class="ctx-sub">4821 字 · 选区 128 字</div></div></div>
  <div class="ctx-right"><button class="pill is-on">附带正文</button>
    <button class="icon-btn sm"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg></button></div>
</section>
<main class="thread">
  <div class="msg user"><div class="bubble">这篇讲的核心思路是什么？和 Nginx 比呢？</div></div>
  <div class="msg assistant">
    <div class="msg-role">Claude</div>
    <div class="bubble">
      <p>这篇的核心是<strong>自研事件循环 + 零拷贝</strong>两条主线：</p>
      <ul><li>用 <code>io_uring</code> 替代 epoll，单线程就能扛 12 万 QPS</li><li>零拷贝转发省掉两次 <code>memcpy</code>，吞吐提升约 40%</li></ul>
      <h3>和 Nginx 的差异</h3>
      <p>Nginx 是多进程 + 共享内存模型，而它是单线程异步，延迟更稳但单机上限更低。</p>
      <pre><code>accept_loop → epoll_wait → read → write</code></pre>
      <p>建议先看第 3 节的 benchmark 表，<a href="https://example.com" target="_blank" rel="noreferrer noopener">原文在这里</a>。</p>
    </div>
    <div class="msg-tools"><button>复制</button><button>重新生成</button></div>
  </div>
</main>
<footer class="composer">
  <div class="composer-box"><textarea id="input" rows="1" placeholder="问问这个页面…"></textarea>
    <button class="send"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg></button></div>
  <div class="composer-foot"><span>正文 4821 字</span><span class="sep">·</span><span>claude-sonnet-4-5</span><span class="sep">·</span><span>Enter 发送</span></div>
</footer>
</body></html>"""
open(os.path.join(VIEW, "demo.html"), "w", encoding="utf-8").write(demo)

# ---- 模拟网页 ----
MOCK = """
<div class="mock">
  <div class="mock-bar">
    <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <div class="mock-url">https://zhuanlan.zhihu.com/p/123456789</div>
  </div>
  <div class="mock-body">
    <article class="article">
      <h1>用 Rust 写一个高性能 HTTP 代理</h1>
      <div class="meta">原创 · 2026-03-18 · 阅读 12,480</div>
      <p class="lead">过去一年我把公司的 Nginx 网关换成了自己写的 Rust 实现，单机吞吐提升了 3.4 倍，内存占用反而降到了原来的三分之一。这篇文章记录完整的设计过程与踩坑。</p>
      <h2>一、为什么不用现成的方案</h2>
      <p>现成的方案都很好，但都有各自的边界。多进程模型在连接数上万之后，共享内存锁的争用开始显现；异步模型则受限于运行时的调度开销。我们的场景是长连接为主、短连接为辅，需要更精细的控制。</p>
      <h2>二、核心设计</h2>
      <p>整体分为三层：接入层负责连接与协议解析，路由层决定转发目标，传输层负责实际的读写。每一层都可以独立替换。</p>
      <ul><li>接入层：复用 epoll 的边缘触发模式，避免重复就绪</li>
      <li>路由层：规则用 DFA 匹配，一趟扫描完成所有前缀匹配</li>
      <li>传输层：零拷贝转发，减少两次内存拷贝</li></ul>
      <h2>三、Benchmark</h2>
      <p>在 16 核机器上，用 wrk 压测 4 字节固定响应的场景，结果如下表。单线程即可达到 Nginx 多进程的 85%。</p>
      <table><tr><th>场景</th><th>本实现</th><th>Nginx</th></tr>
      <tr><td>短连接 10 万 QPS</td><td>12.1 万</td><td>3.6 万</td></tr>
      <tr><td>长连接 5000 并发</td><td>吞吐 8.2 GB/s</td><td>吞吐 2.4 GB/s</td></tr></table>
      <h2>四、踩过的坑</h2>
      <p>最难的部分是零拷贝在小包场景反而更慢，因为跨页拷贝的代价超过了省下的那次 memcpy。最终按包大小做了自适应阈值。</p>
    </article>
  </div>
</div>
"""

MOCK_CSS = """
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { display: flex; background: #eef1f5; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
.mock { width: 900px; height: 800px; background: #fff; display: flex; flex-direction: column; border-right: 1px solid #dde3ea; }
.mock-bar { flex: none; height: 38px; background: #f1f3f6; border-bottom: 1px solid #dde3ea; display: flex; align-items: center; gap: 7px; padding: 0 14px; }
.dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
.dot.r { background: #f0665a; } .dot.y { background: #f5bd4f; } .dot.g { background: #61c554; }
.mock-url { flex: 1; margin-left: 10px; height: 24px; border-radius: 12px; background: #fff; border: 1px solid #e2e7ee; display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #6b7280; }
.mock-body { flex: 1; overflow: hidden; }
.article { padding: 30px 56px; color: #1f2328; }
.article h1 { font-size: 26px; margin: 0 0 8px; line-height: 1.35; }
.meta { font-size: 12px; color: #8b949e; margin-bottom: 20px; }
.lead { font-size: 15px; color: #41474f; background: #f7f9fc; border-left: 3px solid #4285f4; padding: 12px 16px; margin: 0 0 24px; line-height: 1.75; }
.article h2 { font-size: 17px; margin: 26px 0 10px; }
.article p { font-size: 14px; line-height: 1.85; color: #2c3138; margin: 0 0 14px; }
.article ul { font-size: 14px; line-height: 1.9; color: #2c3138; padding-left: 22px; }
.article table { border-collapse: collapse; font-size: 13px; margin: 12px 0 18px; }
.article th, .article td { border: 1px solid #e2e7ee; padding: 7px 14px; text-align: left; }
.article th { background: #f6f8fb; }
.panel-holder { width: 380px; height: 800px; overflow: hidden; }
.panel-holder iframe { width: 380px; height: 800px; border: 0; display: block; }
"""


def composer(name, panel_page):
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{MOCK_CSS}</style></head>
<body>{MOCK}<div class="panel-holder"><iframe src="file:///{VIEW.replace(chr(92), '/')}/{panel_page}"></iframe></div>
</body></html>"""


jobs = [
    ("01-overview.png", composer("overview", "sidepanel.html")),
    ("02-chat.png", composer("chat", "demo.html")),
]

for name, html in jobs:
    p = os.path.join(DEV, "c-" + name + ".html")
    open(p, "w", encoding="utf-8").write(html)
    out = os.path.join(SHOTS, name)
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(
        [
            CHROME, "--headless", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files",
            f"--user-data-dir={PROFILE}", "--virtual-time-budget=6000",
            "--window-size=1280,800", "--hide-scrollbars", f"--screenshot={out}",
            "file:///" + p.replace(chr(92), "/"),
        ],
        capture_output=True, text=True, timeout=180,
    )
    print(name, os.path.exists(out), os.path.getsize(out) if os.path.exists(out) else 0)

# 第 3 张：设置页（说明 BYOK）
opt = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;height:100%;background:#fff}}
iframe{{width:1280px;height:800px;border:0;display:block}}</style></head>
<body><iframe src="file:///{VIEW.replace(chr(92), '/')}/options.html"></iframe></body></html>"""
p = os.path.join(DEV, "c-options.html")
open(p, "w", encoding="utf-8").write(opt)
out = os.path.join(SHOTS, "03-settings.png")
if os.path.exists(out):
    os.remove(out)
subprocess.run(
    [
        CHROME, "--headless", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files",
        f"--user-data-dir={PROFILE}", "--virtual-time-budget=6000",
        "--window-size=1280,800", "--hide-scrollbars", f"--screenshot={out}",
        "file:///" + p.replace(chr(92), "/"),
    ],
    capture_output=True, text=True, timeout=180,
)
print("03-settings.png", os.path.exists(out), os.path.getsize(out) if os.path.exists(out) else 0)
