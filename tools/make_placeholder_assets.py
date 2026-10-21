#!/usr/bin/env python3
"""生成博客首页的占位背景图（之后可直接用正式图替换同名文件）。

输出：
  web/assets/hero-bg.jpg          2560 x 1440 (16:9)   桌面背景
  web/assets/hero-bg-mobile.jpg   1080 x 1920 (9:16)   手机竖屏背景

说明：首页不使用看板娘立绘；如需立绘，请参考 docs/background-spec.md 里的可选规格。

依赖：Pillow
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
        local = 0.0
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
    image.paste(
        Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB"),
        (0, 0),
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
            y = (
                height * base_y
                + math.sin(i * 0.9 + phase) * amplitude
                + rng.uniform(-amplitude * 0.4, amplitude * 0.4)
            )
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
    add_glow(
        image,
        (int(width * 0.18), int(height * 0.88)),
        int(min(width, height) * 0.55),
        (90, 130, 220),
        40,
    )
    return image


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)

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


if __name__ == "__main__":
    main()
