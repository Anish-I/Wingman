#!/usr/bin/env python3
"""
Crop Pip emote sprite sheets into individual transparent PNGs.

Usage:
  1. Save sprite sheets to mobile/assets/pip-source/:
     - sheet1.png (12 emotes, 4 cols x 3 rows)
     - sheet2.png (20 emotes, 5 cols x 4 rows)
     - logo.png   (single image, copied as-is)
  2. pip install Pillow
  3. python scripts/crop-pip-emotes.py

Output goes to mobile/assets/pip/
"""

from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Pillow not installed. Run: pip install Pillow")
    exit(1)

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "pip-source"
OUT = ROOT / "assets" / "pip"
OUT.mkdir(parents=True, exist_ok=True)

# Sheet 1: 4 columns x 3 rows = 12 emotes
SHEET1_MAP = {
    (0, 0): "pip-lurk.png",
    (1, 0): "pip-gg.png",
    (2, 0): "pip-thumbsup.png",
    (3, 0): "pip-angry.png",
    (0, 1): "pip-no.png",
    (1, 1): "pip-love.png",
    (2, 1): "pip-coding-angry.png",
    (3, 1): "pip-cool.png",
    (0, 2): "pip-fail.png",
    (1, 2): "pip-coding.png",
    (2, 2): "pip-dab.png",
    (3, 2): "pip-vpn.png",
}

# Sheet 2: 5 columns x 4 rows = 20 emotes
SHEET2_MAP = {
    (0, 0): "pip-wave.png",      # love/wave-hearts
    (1, 0): "pip-thinking.png",
    (2, 0): "pip-headband.png",
    (3, 0): "pip-question.png",
    (4, 0): "pip-404.png",
    (0, 1): "pip-hypnotized.png",
    (1, 1): "pip-sad-coding.png",
    (2, 1): "pip-checkmark.png",
    (3, 1): "pip-excited.png",    # thinking-chin
    (4, 1): "pip-surprised.png",
    (0, 2): "pip-alert.png",
    (1, 2): "pip-calendar.png",
    (2, 2): "pip-ninja.png",
    (3, 2): "pip-bonk.png",
    (4, 2): "pip-business.png",
    (0, 3): "pip-overwhelmed.png",
    (1, 3): "pip-coffee.png",
    (2, 3): "pip-clap.png",
    (3, 3): "pip-crying.png",
    (4, 3): "pip-eating.png",
}


def crop_sheet(path, mapping, cols, rows):
    if not path.exists():
        print(f"  Skipping {path.name} (not found)")
        return 0

    img = Image.open(path).convert("RGBA")
    w, h = img.size
    cell_w = w // cols
    cell_h = h // rows
    count = 0

    for (col, row), filename in mapping.items():
        left = col * cell_w
        top = row * cell_h
        right = left + cell_w
        bottom = top + cell_h

        cell = img.crop((left, top, right, bottom))

        # Trim transparent padding
        bbox = cell.getbbox()
        if bbox:
            cell = cell.crop(bbox)

        out_path = OUT / filename
        cell.save(out_path, "PNG")
        print(f"  Saved {filename} ({cell.size[0]}x{cell.size[1]})")
        count += 1

    return count


def main():
    total = 0

    print("Sheet 1 (4x3):")
    total += crop_sheet(SRC / "sheet1.png", SHEET1_MAP, 4, 3)

    print("Sheet 2 (5x4):")
    total += crop_sheet(SRC / "sheet2.png", SHEET2_MAP, 5, 4)

    # Logo — just copy as-is
    logo_src = SRC / "logo.png"
    if logo_src.exists():
        img = Image.open(logo_src).convert("RGBA")
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
        out_path = OUT / "pip-logo.png"
        img.save(out_path, "PNG")
        print(f"  Saved pip-logo.png ({img.size[0]}x{img.size[1]})")
        total += 1
    else:
        print("  Skipping logo.png (not found)")

    print(f"\nDone! {total} emotes saved to {OUT}")


if __name__ == "__main__":
    main()
