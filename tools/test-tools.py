"""
页面工具的真实浏览器功能测试。

做两件事：
  1. 检查 pageToolExec 的纯逻辑（isDangerous / TOOLS）——用 node 跑
  2. 在真 Chrome 里跑 tools/test-tools.html，验证点击 / 填值 / 快照确实生效

用法：python tools/test-tools.py
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
PORT = 8731

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
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def run_browser_tests(chrome):
    profile = os.path.join(ROOT, ".chrome-test-profile")
    url = f"http://127.0.0.1:{PORT}/tools/test-tools.html"
    proc = subprocess.run(
        [
            chrome,
            "--headless",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile}",
            "--virtual-time-budget=6000",
            "--dump-dom",
            url,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    dom = proc.stdout or ""
    m = re.search(r"<title>RESULTS:(.*?)</title>", dom, re.S)
    if not m:
        print("  ✗ 页面没有跑出结果（title 未标记 RESULTS:）")
        print(dom[:800])
        return False
    raw = m.group(1)
    raw = (
        raw.replace("&quot;", '"')
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
    )
    try:
        results = json.loads(raw)
    except Exception as e:
        print("  ✗ 结果解析失败：", e, raw[:400])
        return False

    ok = True
    for r in results:
        flag = "PASS" if r["pass"] else "FAIL"
        if not r["pass"]:
            ok = False
        info = ("  " + r["info"]) if r.get("info") and not r["pass"] else ""
        print(f"  {flag}  {r['name']}{info}")
    shutil.rmtree(profile, ignore_errors=True)
    return ok


def run_node_tests():
    """isDangerous / TOOLS 的逻辑检查（node 直接 import ES module）"""
    script = """
import { TOOLS, TOOL_LABELS, isDangerous } from '../page-tools.js';
const out = [];
const t = (name, cond, info='') => out.push({name, pass: !!cond, info: String(info)});

t('6 个工具', TOOLS.length === 6, TOOLS.length);
t('工具名唯一', new Set(TOOLS.map(x=>x.name)).size === TOOLS.length);
t('每个工具都有中文名', TOOLS.every(x=>TOOL_LABELS[x.name]));
t('每个工具有 JSON Schema', TOOLS.every(x=>x.parameters && x.parameters.type==='object'));
t('click 有 selector/text', TOOLS.find(x=>x.name==='click').parameters.properties.selector);

t('支付→危险', isDangerous('click', {text:'确认支付'}).danger);
t('删除→危险', isDangerous('click', {text:'删除账号'}).danger);
t('注销→危险', isDangerous('click', {selector:'#logout'}).danger);
t('密码→危险', isDangerous('fill', {selector:'input[type=password]'}).danger);
t('验证码→危险', isDangerous('fill', {value:'123456 验证码'}).danger);
t('普通点击→不危险', !isDangerous('click', {text:'展开更多'}).danger);
t('读源码→不危险', !isDangerous('page_snapshot', {}).danger);
t('滚动→不危险', !isDangerous('scroll', {to:'bottom'}).danger);
console.log(JSON.stringify(out));
"""
    path = os.path.join(ROOT, "tools", ".logic-test.mjs")
    with open(path, "w", encoding="utf-8") as f:
        f.write(script)
    try:
        proc = subprocess.run(
            ["node", path],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            cwd=ROOT,
        )
        lines = [l for l in (proc.stdout or "").splitlines() if l.strip().startswith("[")]
        if not lines:
            print("  ✗ node 逻辑测试没有输出：", proc.stderr[:400])
            return False
        results = json.loads(lines[-1])
        ok = True
        for r in results:
            flag = "PASS" if r["pass"] else "FAIL"
            if not r["pass"]:
                ok = False
            info = ("  " + r["info"]) if r.get("info") and not r["pass"] else ""
            print(f"  {flag}  {r['name']}{info}")
        return ok
    finally:
        if os.path.exists(path):
            os.remove(path)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    print("[1] 逻辑检查（node）")
    ok = run_node_tests()

    chrome = find_chrome()
    print("\n[2] 真实浏览器检查（Chrome headless）")
    if not chrome:
        print("  - 跳过：没找到 Chrome")
    else:
        httpd = serve()
        try:
            ok = run_browser_tests(chrome) and ok
        finally:
            httpd.shutdown()

    print("\n" + ("全部通过 ✓" if ok else "有失败项 ✗"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
