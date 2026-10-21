#!/usr/bin/env python3
"""生成看板娘起始页的占位素材（之后可直接用同名文件替换成正式图）。

输出：
  web/assets/hero-bg.jpg          2560 x 1440 (16:9)   桌面背景
  web/assets/hero-bg-mobile.jpg   1080 x 1920 (9:16)   手机竖屏背景
  web/assets/mascot.png           1200 x 1600 (3:4)    看板娘立绘（透明 PNG）

依赖：Pillow（numpy 可选，仅用于加速渐变）。
用法：python tools/make_placeholder_assets.py
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "web" / "assets"

NIGHT_TOP = (7, 11, 24)
NIGHT_MID = (16, 26, 54)
NIGHT_HORIZON = (42, 68, 118)
MOON_COLOR = (226, 236, 255)
STAR_COLOR = (232, 240, 255)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


def vertical_gradient(size, stops):
    """stops: [(position 0..1, color), ...]"""
    width, height = size
    image = Image.new("RGB", size)
    pixels = image.load()
    for y in range(height):
        t = y / max(height - 1, 1)
        left, right = stops[0], stops[-1]
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                local = (t - p0) / max(p1 - p0, 1e-6)
                left, right = c0, c1
                break
        color = mix(left, right, local)
        for x in range(width):
            pixels[x, y] = color
    return image


def add_stars(image, count, seed, region=None, max_radius=2.4, opacity=230):
    rng = random.Random(seed)
    draw = ImageDraw.Draw(image, "RGBA")
    width, height = image.size
    x0, y0, x1, y1 = region or (0, 0, width, height)
    for _ in range(count):
        x = rng.uniform(x0, x1)
        y = rng.uniform(y0, y1)
        r = rng.uniform(0.6, max_radius)
        alpha = int(rng.uniform(60, opacity))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*STAR_COLOR, alpha))


def add_glow(image, center, radius, color, strength=120):
    width, height = image.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    steps = 26
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * t
        alpha = int(strength * (1 - t) ** 2)
        draw.ellipse(
            [center[0] - r, center[1] - r, center[0] + r, center[1] + r],
            fill=(*color, alpha),
        )
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.18))
    image.alpha_composite(layer) if image.mode == "RGBA" else image.paste(
        Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"), (0, 0)
    )


def add_moon(image, center, radius, glow_radius):
    width, height = image.size
    base = image.convert("RGBA")
    halo = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(halo)
    for i in range(24, 0, -1):
        t = i / 24
        r = glow_radius * t
        alpha = int(70 * (1 - t) ** 2)
        draw.ellipse([center[0] - r, center[1] - r, center[0] + r, center[1] + r], fill=(*MOON_COLOR, alpha))
    halo = halo.filter(ImageFilter.GaussianBlur(glow_radius * 0.2))
    base = Image.alpha_composite(base, halo)

    moon = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    mdraw = ImageDraw.Draw(moon)
    mdraw.ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=(*MOON_COLOR, 240),
    )
    # 月面阴影，别太像一张纯白圆片
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.ellipse(
        [
            center[0] - radius * 0.5,
            center[1] - radius * 1.15,
            center[0] + radius * 0.85,
            center[1] + radius * 0.4,
        ],
        fill=(190, 205, 240, 40),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius * 0.35))
    moon = Image.alpha_composite(moon, shadow)
    base = Image.alpha_composite(base, moon)
    image.paste(base.convert("RGB"), (0, 0))


def add_clouds(image, seed, layers=6):
    rng = random.Random(seed)
    width, height = image.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(layers):
        cx = rng.uniform(-width * 0.1, width * 1.1)
        cy = rng.uniform(height * 0.45, height * 0.95)
        w = rng.uniform(width * 0.25, width * 0.65)
        h = rng.uniform(height * 0.02, height * 0.06)
        color = (120, 150, 210, rng.randint(14, 26))
        draw.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(max(width, height) * 0.012))
    base = Image.alpha_composite(image.convert("RGBA"), layer)
    image.paste(base.convert("RGB"), (0, 0))


def add_hills(image, seed):
    rng = random.Random(seed)
    width, height = image.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    bands = [
        (0.78, (10, 17, 36, 255)),
        (0.86, (7, 12, 26, 255)),
        (0.93, (4, 8, 18, 255)),
    ]
    for index, (base_y, color) in enumerate(bands):
        points = [(0, height)]
        step = width / 24
        phase = rng.uniform(0, math.tau)
        amplitude = height * (0.035 - index * 0.005)
        for i in range(25):
            x = i * step
            y = height * base_y + math.sin(i * 0.9 + phase) * amplitude + rng.uniform(-amplitude * 0.4, amplitude * 0.4)
            points.append((x, y))
        points.append((width, height))
        draw.polygon(points, fill=color)
    image.paste(Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"), (0, 0))


def add_bokeh(image, seed, count=14):
    rng = random.Random(seed)
    width, height = image.size
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(count):
        x = rng.uniform(0, width)
        y = rng.uniform(0, height)
        r = rng.uniform(width * 0.004, width * 0.018)
        color = rng.choice([(122, 162, 255), (180, 139, 255), (255, 210, 122)])
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, rng.randint(10, 26)))
    layer = layer.filter(ImageFilter.GaussianBlur(width * 0.004))
    image.paste(Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"), (0, 0))


def make_background(size, seed, moon_at, moon_radius_scale, star_count):
    width, height = size
    image = vertical_gradient(
        size,
        [
            (0.0, NIGHT_TOP),
            (0.42, NIGHT_MID),
            (0.72, mix(NIGHT_MID, NIGHT_HORIZON, 0.55)),
            (0.86, NIGHT_HORIZON),
            (1.0, (8, 13, 28)),
        ],
    )
    add_stars(image, star_count, seed)
    add_clouds(image, seed + 1)
    add_moon(
        image,
        (int(width * moon_at[0]), int(height * moon_at[1])),
        int(min(width, height) * moon_radius_scale),
        int(min(width, height) * moon_radius_scale * 5.2),
    )
    add_bokeh(image, seed + 2)
    add_hills(image, seed + 3)
    # 左下方加一团冷光，给页面文字一点层次
    add_glow(image, (int(width * 0.18), int(height * 0.88)), int(min(width, height) * 0.55), (90, 130, 220), 40)
    return image


# ---------------------------------------------------------------------------
# 看板娘占位立绘：平涂风格的 Q 版小人（正式立绘请直接用同名 PNG 替换）
# ---------------------------------------------------------------------------
S = 2  # 超采样倍数

HAIR_DARK = (31, 42, 86, 255)
HAIR = (44, 62, 122, 255)
HAIR_LIGHT = (92, 124, 212, 255)
SKIN = (255, 230, 214, 255)
SKIN_SHADOW = (248, 205, 185, 255)
EYE_WHITE = (255, 255, 255, 255)
EYE_OUTER = (61, 84, 160, 255)
EYE_INNER = (35, 46, 90, 255)
EYE_HIGHLIGHT = (255, 255, 255, 255)
UNIFORM = (244, 248, 255, 255)
UNIFORM_SHADOW = (210, 221, 242, 255)
NAVY = (38, 53, 95, 255)
NAVY_DARK = (26, 36, 68, 255)
RIBBON = (224, 96, 122, 255)
RIBBON_DARK = (188, 70, 96, 255)
GOLD = (255, 214, 122, 255)
BLUSH = (255, 168, 178, 110)
RIM = (150, 205, 255, 150)


def sc(value):
    return int(round(value * S))


def scaled(points):
    return [(sc(x), sc(y)) for x, y in points]


def draw_mascot():
    w, h = 1200, 1600
    image = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # ---- 背后的双马尾（先画，压在身体后面） ----
    draw.polygon(
        scaled([(400, 520), (250, 700), (170, 1000), (200, 1250), (330, 1290), (390, 1000), (440, 760)]),
        fill=HAIR,
    )
    draw.polygon(
        scaled([(800, 520), (950, 700), (1030, 1000), (1000, 1250), (870, 1290), (810, 1000), (760, 760)]),
        fill=HAIR,
    )
    draw.polygon(
        scaled([(300, 860), (240, 1080), (270, 1230), (330, 1240), (350, 1060), (360, 900)]),
        fill=HAIR_LIGHT,
    )
    draw.polygon(
        scaled([(900, 860), (960, 1080), (930, 1230), (870, 1240), (850, 1060), (840, 900)]),
        fill=HAIR_LIGHT,
    )

    # ---- 身体：水手服上衣 ----
    draw.polygon(scaled([(390, 900), (810, 900), (880, 1300), (320, 1300)]), fill=UNIFORM)
    draw.polygon(scaled([(700, 900), (810, 900), (880, 1300), (740, 1300)]), fill=UNIFORM_SHADOW)

    # 脖子
    draw.rounded_rectangle([sc(548), sc(760), sc(652), sc(910)], radius=sc(30), fill=SKIN_SHADOW)

    # 手臂
    draw.polygon(scaled([(390, 920), (300, 1180), (370, 1220), (455, 990)]), fill=UNIFORM)
    draw.polygon(scaled([(810, 920), (900, 1180), (830, 1220), (745, 990)]), fill=UNIFORM)
    draw.ellipse([sc(295), sc(1170), sc(385), sc(1260)], fill=SKIN)
    draw.ellipse([sc(815), sc(1170), sc(905), sc(1260)], fill=SKIN)

    # 水手领
    draw.polygon(scaled([(430, 890), (600, 1010), (770, 890), (815, 955), (600, 1090), (385, 955)]), fill=NAVY)
    draw.polygon(scaled([(450, 930), (600, 1040), (750, 930), (765, 975), (600, 1085), (435, 975)]), fill=NAVY_DARK)

    # 红领结
    draw.polygon(scaled([(600, 1030), (535, 1000), (525, 1080), (600, 1060)]), fill=RIBBON)
    draw.polygon(scaled([(600, 1030), (665, 1000), (675, 1080), (600, 1060)]), fill=RIBBON)
    draw.polygon(scaled([(600, 1030), (560, 1120), (600, 1100), (640, 1120)]), fill=RIBBON_DARK)
    draw.ellipse([sc(585), sc(1015), sc(615), sc(1045)], fill=RIBBON_DARK)

    # 裙子
    draw.polygon(scaled([(330, 1290), (870, 1290), (960, 1450), (240, 1450)]), fill=NAVY)
    for x in (360, 440, 520, 600, 680, 760, 840):
        draw.line(scaled([(x, 1300), (x - 25, 1440)]), fill=NAVY_DARK, width=sc(5))
    draw.line(scaled([(240, 1450), (960, 1450)]), fill=NAVY_DARK, width=sc(6))

    # 腿 + 袜子 + 鞋
    for x0 in (470, 630):
        draw.rounded_rectangle([sc(x0), sc(1440), sc(x0 + 100), sc(1530)], radius=sc(24), fill=SKIN)
        draw.rounded_rectangle([sc(x0 - 6), sc(1510), sc(x0 + 106), sc(1565)], radius=sc(18), fill=(255, 255, 255, 255))
        draw.rounded_rectangle([sc(x0 - 12), sc(1545), sc(x0 + 118), sc(1585)], radius=sc(20), fill=NAVY_DARK)

    # ---- 头 ----
    # 后发：先画，脸会盖在它上面，只露出额顶与脸颊两侧
    draw.ellipse([sc(330), sc(280), sc(870), sc(780)], fill=HAIR)
    # 脸
    draw.ellipse([sc(355), sc(315), sc(845), sc(815)], fill=SKIN)
    # 耳朵
    draw.ellipse([sc(330), sc(545), sc(380), sc(645)], fill=SKIN_SHADOW)
    draw.ellipse([sc(820), sc(545), sc(870), sc(645)], fill=SKIN_SHADOW)
    # 刘海（几束）
    draw.polygon(
        scaled([(340, 520), (400, 330), (520, 300), (500, 420), (470, 520), (420, 560), (375, 540)]),
        fill=HAIR,
    )
    draw.polygon(
        scaled([(500, 430), (560, 300), (700, 300), (680, 430), (650, 520), (600, 550), (540, 520)]),
        fill=HAIR,
    )
    draw.polygon(
        scaled([(660, 420), (700, 300), (830, 380), (860, 520), (800, 570), (740, 540), (700, 520)]),
        fill=HAIR,
    )
    # 发丝高光
    draw.polygon(scaled([(390, 400), (470, 330), (520, 355), (430, 450)]), fill=HAIR_LIGHT)
    draw.polygon(scaled([(600, 340), (660, 330), (680, 380), (620, 400)]), fill=HAIR_LIGHT)
    draw.polygon(scaled([(760, 400), (820, 450), (810, 500), (750, 450)]), fill=HAIR_LIGHT)

    # 侧发（贴脸）
    draw.polygon(scaled([(355, 560), (330, 760), (360, 900), (420, 860), (430, 680)]), fill=HAIR)
    draw.polygon(scaled([(845, 560), (870, 760), (840, 900), (780, 860), (770, 680)]), fill=HAIR)

    # 呆毛
    draw.polygon(scaled([(590, 305), (610, 220), (640, 300)]), fill=HAIR)
    draw.line(scaled([(580, 300), (612, 215)]), fill=HAIR_LIGHT, width=sc(8))

    # 星星发卡
    star_cx, star_cy, star_r = 780, 430, 42
    star_points = []
    for i in range(10):
        angle = -math.pi / 2 + i * math.pi / 5
        radius = star_r if i % 2 == 0 else star_r * 0.45
        star_points.append((star_cx + math.cos(angle) * radius, star_cy + math.sin(angle) * radius))
    draw.polygon(scaled(star_points), fill=GOLD)
    draw.polygon(scaled(star_points), outline=(255, 240, 190, 255))

    # ---- 脸 ----
    # 眼睛
    for eye_x in (505, 695):
        draw.ellipse([sc(eye_x - 62), sc(550), sc(eye_x + 62), sc(705)], fill=EYE_WHITE)
        draw.ellipse([sc(eye_x - 50), sc(568), sc(eye_x + 50), sc(705)], fill=EYE_OUTER)
        draw.ellipse([sc(eye_x - 34), sc(590), sc(eye_x + 34), sc(705)], fill=EYE_INNER)
        draw.ellipse([sc(eye_x - 30), sc(600), sc(eye_x + 2), sc(645)], fill=EYE_HIGHLIGHT)
        draw.ellipse([sc(eye_x + 14), sc(665), sc(eye_x + 30), sc(683)], fill=EYE_HIGHLIGHT)
        # 上睫毛
        draw.arc([sc(eye_x - 66), sc(535), sc(eye_x + 66), sc(695)], 190, 350, fill=HAIR_DARK, width=sc(10))
    # 腮红
    draw.ellipse([sc(415), sc(705), sc(505), sc(752)], fill=BLUSH)
    draw.ellipse([sc(695), sc(705), sc(785), sc(752)], fill=BLUSH)
    # 鼻子 + 嘴
    draw.line(scaled([(600, 685), (610, 700)]), fill=SKIN_SHADOW, width=sc(5))
    draw.arc([sc(570), sc(708), sc(630), sc(762)], 20, 160, fill=(178, 82, 96, 255), width=sc(8))
    # 小虎牙
    draw.polygon(scaled([(612, 730), (626, 730), (619, 746)]), fill=(255, 255, 255, 255))

    # 右侧轮廓光
    rim_layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    rim_draw = ImageDraw.Draw(rim_layer)
    rim_draw.arc([sc(330), sc(280), sc(870), sc(760)], 300, 20, fill=RIM, width=sc(10))
    rim_draw.arc([sc(390), sc(900), sc(880), sc(1300)], 300, 20, fill=(140, 190, 255, 90), width=sc(8))
    rim_layer = rim_layer.filter(ImageFilter.GaussianBlur(sc(3)))
    image = Image.alpha_composite(image, rim_layer)

    # 周围的小星光
    sparkle = Image.new("RGBA", image.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(sparkle)
    for (sx, sy, size, alpha) in [
        (250, 380, 20, 210),
        (980, 700, 14, 180),
        (170, 1120, 12, 160),
        (1040, 1120, 18, 200),
        (300, 950, 9, 140),
        (930, 380, 10, 170),
    ]:
        sdraw.polygon(scaled([(sx, sy - size * 2), (sx + size * 0.55, sy), (sx, sy + size * 2), (sx - size * 0.55, sy)]), fill=(230, 242, 255, alpha))
        sdraw.polygon(scaled([(sx - size * 2, sy), (sx, sy - size * 0.55), (sx + size * 2, sy), (sx, sy + size * 0.55)]), fill=(230, 242, 255, alpha))
    sparkle = sparkle.filter(ImageFilter.GaussianBlur(sc(0.6)))
    image = Image.alpha_composite(image, sparkle)

    # 等比缩小一点，底部留出空间，避免鞋子被画布裁掉
    figure = image.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    scaled_figure = figure.resize((int(w * 0.94), int(h * 0.94)), Image.LANCZOS)
    canvas.alpha_composite(scaled_figure, ((w - scaled_figure.width) // 2, h - scaled_figure.height))
    return canvas


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    random.seed(7)

    desktop = make_background(
        (2560, 1440),
        seed=11,
        moon_at=(0.74, 0.26),
        moon_radius_scale=0.055,
        star_count=650,
    )
    desktop.save(ASSETS / "hero-bg.jpg", quality=86, optimize=True)
    print("已生成 web/assets/hero-bg.jpg  (2560x1440, 16:9)")

    mobile = make_background(
        (1080, 1920),
        seed=23,
        moon_at=(0.56, 0.20),
        moon_radius_scale=0.085,
        star_count=420,
    )
    mobile.save(ASSETS / "hero-bg-mobile.jpg", quality=86, optimize=True)
    print("已生成 web/assets/hero-bg-mobile.jpg  (1080x1920, 9:16)")

    mascot = draw_mascot()
    mascot.save(ASSETS / "mascot.png", optimize=True)
    print("已生成 web/assets/mascot.png  (1200x1600, 透明 PNG)")


if __name__ == "__main__":
    main()
