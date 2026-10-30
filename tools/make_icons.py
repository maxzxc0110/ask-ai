"""生成 Ask AI 扩展图标：Gemini 风格蓝紫渐变四角星（透明底）。"""
import math
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT, exist_ok=True)

A = (66, 133, 244)    # #4285f4
B = (155, 114, 203)   # #9b72cb


def star_points(cx, cy, r, inner=0.34):
    pts = []
    for i in range(8):
        ang = math.radians(i * 45 - 90)
        rad = r if i % 2 == 0 else r * inner
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return pts


def make(size):
    s = size * 8
    # 渐变底
    grad = Image.new("RGBA", (s, s))
    gd = ImageDraw.Draw(grad)
    for i in range(s):
        t = i / max(1, s - 1)
        c = tuple(int(A[k] + (B[k] - A[k]) * t) for k in range(3))
        gd.line([(i, 0), (i, s)], fill=c + (255,))
    # 星形遮罩
    mask = Image.new("L", (s, s), 0)
    md = ImageDraw.Draw(mask)
    md.polygon(star_points(s / 2, s / 2, s * 0.48), fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)


for size in (16, 32, 48, 128):
    path = os.path.join(OUT, f"icon{size}.png")
    make(size).save(path)
    print("wrote", path)
