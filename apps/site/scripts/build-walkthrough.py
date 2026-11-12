#!/usr/bin/env python3
"""Build a disclosed scene walkthrough and livestream layout, without AI calls.

First run: pnpm --filter @oia/desktop template-qa
Requires Pillow and ffmpeg. Uses real scene renders, not a simulated app UI.
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[3]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--font', type=Path)
args = parser.parse_args()
font_path = args.font or next((p for p in [Path('/System/Library/Fonts/Supplemental/Arial.ttf'), Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')] if p.exists()), None)
if font_path is None:
    raise SystemExit('Pass --font pointing to a local TrueType font')
font = lambda size: ImageFont.truetype(str(font_path), size)
assets = ROOT / 'apps/site/public/assets'
qa = ROOT / 'apps/desktop/out/template-qa'
sources = [qa / 'studio-ed-menu.png', qa / 'menu-price-edited.png', qa / 'live-flash-sale.png', assets / 'still-product.webp']
if not all(p.is_file() for p in sources):
    raise SystemExit('Missing sources: run the real Electron template-qa first')

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

with tempfile.TemporaryDirectory(prefix='oia-walkthrough-') as directory:
    temporary = Path(directory)
    stages = [
        ('01 / OPEN A TEMPLATE', ['Start with a real', 'editable menu.'], '42.000 VND', sources[0]),
        ('02 / CHANGE THE PRICE', ['Edit the text.', 'Keep the photograph.'], '42.000 > 46.000 VND', sources[1]),
        ('03 / KEEP THE DESIGN', ['Same background.', 'New offer.'], 'No AI generation', sources[1]),
        ('04 / EXPORT', ['Ready for your', 'next post.'], 'PNG / JPG / PDF', sources[1]),
    ]
    for index, (label, lines, detail, source) in enumerate(stages):
        image = Image.new('RGB', (1280, 800), '#0e0d1f')
        draw = ImageDraw.Draw(image)
        draw.text((64, 55), 'OIA / TEMPLATE WALKTHROUGH', font=font(22), fill='#b3afcc')
        draw.text((64, 160), label, font=font(22), fill='#a58cff')
        for line_index, line in enumerate(lines):
            draw.text((64, 225 + line_index * 66), line, font=font(48), fill='#f4f1e8')
        draw.rounded_rectangle((64, 415, 555, 478), radius=10, fill='#211b41')
        draw.text((82, 431), detail, font=font(27), fill='#f4f1e8')
        draw.text((64, 590), 'Real desktop scene renders.', font=font(21), fill='#b3afcc')
        draw.text((64, 625), 'Not a live screen recording.', font=font(21), fill='#b3afcc')
        for dot in range(4):
            draw.rounded_rectangle((64 + dot * 76, 715, 124 + dot * 76, 721), radius=3, fill='#a58cff' if dot == index else '#302b4d')
        preview = Image.open(source).convert('RGB')
        preview.thumbnail((520, 650), Image.Resampling.LANCZOS)
        image.paste(preview, (696, 85))
        image.save(temporary / f'{index}.png')
        if index == 0:
            image.save(assets / 'template-walkthrough-poster.webp', quality=88)
    concat = temporary / 'frames.txt'
    concat.write_text(''.join(f"file '{temporary / f'{i}.png'}'\nduration 4\n" for i in range(4)) + f"file '{temporary / '3.png'}'\n")
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(concat), '-t', '16', '-vf', 'fps=24,format=yuv420p', '-c:v', 'libx264', '-crf', '23', '-movflags', '+faststart', '-an', str(assets / 'template-walkthrough.mp4')], check=True)

for language, captions in {
    'en': ['Open an included, editable menu template.', 'Change the price from 42.000 to 46.000 dong.', 'The background stays unchanged. No AI generation.', 'Export the design for your next post.'],
    'vi': ['Mở mẫu thực đơn có sẵn, sửa được chữ.', 'Đổi giá từ 42.000 thành 46.000 đồng.', 'Ảnh nền giữ nguyên. Không tạo ảnh AI.', 'Xuất thiết kế cho bài đăng tiếp theo.'],
}.items():
    cues = ['WEBVTT\n']
    for i, caption in enumerate(captions):
        cues.append(f'00:00:{i * 4:02d}.000 --> 00:00:{(i + 1) * 4:02d}.000\n{caption}\n')
    (assets / f'template-walkthrough-{language}.vtt').write_text('\n'.join(cues), encoding='utf-8')

image = Image.new('RGB', (900, 1120), '#151332')
draw = ImageDraw.Draw(image)
draw.text((52, 38), 'OIA / LIVESTREAM LAYOUT', font=font(26), fill='#f4f1e8')
draw.text((52, 80), 'Illustration, not a real broadcast', font=font(20), fill='#b3afcc')
draw.rounded_rectangle((208, 136, 692, 1012), radius=44, fill='#080712', outline='#39344f', width=3)
canvas = Image.new('RGBA', (1080, 1920), '#e9e1ce')
product = Image.open(sources[3]).convert('RGBA')
product = ImageOps.fit(product, (1080, 1920), method=Image.Resampling.LANCZOS)
canvas.alpha_composite(product)
overlay = Image.open(sources[2]).convert('RGBA')
if overlay.getextrema()[3] != (0, 255):
    raise SystemExit('Overlay must retain transparent and opaque pixels')
canvas.alpha_composite(overlay)
frame = canvas.resize((450, 800), Image.Resampling.LANCZOS)
image.paste(frame.convert('RGB'), (225, 172))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((247, 195, 343, 233), radius=9, fill='#c72b2b')
draw.text((264, 200), 'LIVE', font=font(24), fill='white')
for y, icon in [(400, '+'), (480, '...'), (560, '+')]:
    draw.ellipse((642, y, 674, y + 32), fill='#252135')
    draw.text((649, y + 1), icon, font=font(20), fill='white')
draw.rounded_rectangle((248, 876, 596, 934), radius=24, fill='#252135')
draw.text((267, 891), 'Comment area', font=font(21), fill='#b3afcc')
draw.text((52, 1052), 'Actual transparent preset + AI product image', font=font(22), fill='#b3afcc')
image.save(assets / 'livestream-example.webp', quality=90)

outputs = [assets / name for name in ['template-walkthrough.mp4', 'template-walkthrough-poster.webp', 'template-walkthrough-en.vtt', 'template-walkthrough-vi.vtt', 'livestream-example.webp']]
manifest = {
    'method': 'Real Electron template-qa renders; Pillow layout; ffmpeg 16-second scene walkthrough. No provider calls.',
    'layoutFontSha256': digest(font_path),
    'limits': 'Not a live app recording, generation-speed measurement, real livestream, or platform-certified safe-zone proof. Live controls are illustrative.',
    'sources': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)} for p in sources],
    'outputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': digest(p)} for p in outputs],
}
(ROOT / 'docs/verification/landing-walkthrough-assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
print('Built walkthrough, bilingual captions and livestream illustration; no AI calls.')
