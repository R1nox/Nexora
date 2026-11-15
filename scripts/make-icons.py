"""Builds build/icon.png and build/icon.ico from build/icon-source.png (white corners -> transparent)."""
import os
from PIL import Image, ImageDraw, ImageFilter
root = os.path.join(os.path.dirname(__file__), '..', 'build')
im = Image.open(os.path.join(root, 'icon-source.png')).convert('RGBA')
# flood-fill white background from all corners
w, h = im.size
bg = Image.new('L', (w, h), 0)
rgb = im.convert('RGB')
work = rgb.copy()
for pt in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    ImageDraw.floodfill(work, pt, (255, 0, 255), thresh=40)
mask = Image.new('L', (w, h), 255)
mp = mask.load(); wp = work.load()
for y in range(h):
    for x in range(w):
        if wp[x, y] == (255, 0, 255):
            mp[x, y] = 0
mask = mask.filter(ImageFilter.GaussianBlur(1.2))
im.putalpha(mask)
bbox = mask.point(lambda v: 255 if v > 128 else 0).getbbox()
im = im.crop(bbox)
side = max(im.size)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
sq = sq.resize((1024, 1024), Image.LANCZOS)
sq.save(os.path.join(root, 'icon-1024.png'))
sq.resize((512, 512), Image.LANCZOS).save(os.path.join(root, 'icon.png'))
sq.save(os.path.join(root, 'icon.ico'), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)])
print('icons ok')
