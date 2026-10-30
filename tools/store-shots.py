"""生成 Chrome 商店用的 1280x800 展示图：模拟网页 + 真实渲染的侧边栏。

用法（在仓库根目录）：
    python tools/store-shots.py

需要本机装有 Chrome；路径会自动按脚本位置推导，不含任何个人绝对路径。
"""
import http.server
import os
import shutil
import socketserver
import subprocess
import threading

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

for f in ("sidepanel.css", "sidepanel.html", "sidepanel.js", "providers.js", "page-tools.js",
          "options.css", "options.html", "options.js"):
    shutil.copy(os.path.join(ROOT, f), os.path.join(VIEW, f))
shutil.copy(os.path.join(HERE, "store-shot-fill.js"), os.path.join(VIEW, "store-shot-fill.js"))

# 对话态：直接用真实的 sidepanel.html，只把模块脚本换成填充脚本，
# 这样截图里的结构永远和真实界面一致，不会再出现「截图是旧版」的情况。
with open(os.path.join(VIEW, "sidepanel.html"), encoding="utf-8") as f:
    _real = f.read()
_chat = _real.replace(
    '<script type="module" src="sidepanel.js"></script>',
    '<script src="store-shot-fill.js"></script>',
)
with open(os.path.join(VIEW, "chat.html"), "w", encoding="utf-8") as f:
    f.write(_chat)

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


PORT = 8733


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve(directory):
    handler = lambda *a, **kw: Quiet(*a, directory=directory, **kw)  # noqa: E731
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def composer(name, panel_page, fill=False):
    # 填充代码由父页面在 iframe 加载完成后注入并立即执行：
    # 无头截图时 iframe 里的 <script src> 不一定来得及跑，注入更可靠。
    fill_js = ""
    if fill:
        with open(os.path.join(HERE, "store-shot-fill.js"), encoding="utf-8") as f:
            fill_js = f.read()
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{MOCK_CSS}</style></head>
<body>{MOCK}<div class="panel-holder"><iframe id="panel" src="http://127.0.0.1:{PORT}/{panel_page}"></iframe></div>
<script>
(function () {{
  var FILL = {fill_js!r};
  var f = document.getElementById('panel');
  f.addEventListener('load', function () {{
    var doc = f.contentDocument;
    if (!doc) return;
    var s = doc.createElement('script');
    s.textContent = FILL;
    doc.body.appendChild(s);
  }});
}})();
</script>
</body></html>"""
    path = os.path.join(VIEW, "c-" + name + ".html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path


httpd = serve(VIEW)

jobs = [
    ("01-overview.png", composer("overview", "sidepanel.html", fill=False)),
    ("02-chat.png", composer("chat", "chat.html", fill=True)),
]

for name, p in jobs:
    out = os.path.join(SHOTS, name)
    if os.path.exists(out):
        os.remove(out)
    subprocess.run(
        [
            CHROME, "--headless", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files",
            f"--user-data-dir={PROFILE}", "--virtual-time-budget=6000",
            "--window-size=1280,800", "--hide-scrollbars", f"--screenshot={out}",
            "http://127.0.0.1:%d/%s" % (PORT, os.path.basename(p)),
        ],
        capture_output=True, text=True, timeout=180,
    )
    print(name, os.path.exists(out), os.path.getsize(out) if os.path.exists(out) else 0)

# 第 3 张：设置页（说明 BYOK）
opt = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;height:100%;background:#fff}}
iframe{{width:1280px;height:800px;border:0;display:block}}</style></head>
<body><iframe src="http://127.0.0.1:{PORT}/options.html"></iframe></body></html>"""
p = os.path.join(VIEW, "c-options.html")
open(p, "w", encoding="utf-8").write(opt)
out = os.path.join(SHOTS, "03-settings.png")
if os.path.exists(out):
    os.remove(out)
subprocess.run(
    [
        CHROME, "--headless", "--disable-gpu", "--no-first-run", "--allow-file-access-from-files",
        f"--user-data-dir={PROFILE}", "--virtual-time-budget=6000",
        "--window-size=1280,800", "--hide-scrollbars", f"--screenshot={out}",
        "http://127.0.0.1:%d/%s" % (PORT, os.path.basename(p)),
    ],
    capture_output=True, text=True, timeout=180,
)
print("03-settings.png", os.path.exists(out), os.path.getsize(out) if os.path.exists(out) else 0)

httpd.shutdown()
