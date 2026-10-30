"""
Agent 循环端到端测试：在真 Chrome 里加载真实的 sidepanel.js，
用 chrome / fetch 桩模拟「模型请求工具 → 扩展执行 → 结果回传 → 模型继续」。

用法：python tools/test-agent.py
"""

import http.server
import json
import os
import re
import shutil
import socketserver
import subprocess
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS_DIR = os.path.join(ROOT, "tools")
PORT = 8732

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    shutil.which("chrome") or "",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
]


def find_chrome():
    for c in CHROME_CANDIDATES:
        if c and os.path.exists(c):
            return c
    return None


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = lambda *a, **kw: Quiet(*a, directory=ROOT, **kw)  # noqa: E731
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def build_page():
    """把 sidepanel.html 复制一份，注入桩脚本与测试脚本"""
    with open(os.path.join(ROOT, "sidepanel.html"), encoding="utf-8") as f:
        html = f.read()

    inject = (
        '  <script src="tools/test-agent-stub.js"></script>\n'
        '  <script type="module" src="tools/test-agent-run.js"></script>\n'
        '  <script type="module" src="sidepanel.js"></script>\n'
    )
    old = '  <script type="module" src="sidepanel.js"></script>\n'
    if old not in html:
        raise SystemExit("sidepanel.html 里找不到模块脚本标签")
    html = html.replace(old, inject)
    # 把测试脚本放在 sidepanel 模块之前执行顺序无所谓，但 stub 必须最先
    out = os.path.join(ROOT, ".test-agent.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return out


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    chrome = find_chrome()
    if not chrome:
        print("跳过：没找到 Chrome")
        return 0

    page = build_page()
    httpd = serve()
    profile = os.path.join(ROOT, ".chrome-agent-profile")
    url = f"http://127.0.0.1:{PORT}/.test-agent.html"
    try:
        proc = subprocess.run(
            [
                chrome,
                "--headless",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                f"--user-data-dir={profile}",
                "--virtual-time-budget=25000",
                "--dump-dom",
                url,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=240,
        )
    finally:
        httpd.shutdown()

    dom = proc.stdout or ""
    m = re.search(r"<title>RESULTS:(.*?)</title>", dom, re.S)
    if not m:
        print("✗ 测试页面没有产出结果")
        print(dom[:1500])
        shutil.rmtree(profile, ignore_errors=True)
        return 1

    raw = (
        m.group(1)
        .replace("&quot;", '"')
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
    )
    try:
        results = json.loads(raw)
    except Exception as e:
        print("✗ 结果解析失败：", e)
        print(raw[:600])
        shutil.rmtree(profile, ignore_errors=True)
        return 1

    ok = True
    for r in results:
        flag = "PASS" if r["pass"] else "FAIL"
        if not r["pass"]:
            ok = False
        info = ("  " + r["info"]) if r.get("info") and not r["pass"] else ""
        print(f"  {flag}  {r['name']}{info}")

    shutil.rmtree(profile, ignore_errors=True)
    try:
        os.remove(page)
    except OSError:
        pass

    print("\n" + ("Agent 循环端到端测试通过 ✓" if ok else "端到端测试有失败项 ✗"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
