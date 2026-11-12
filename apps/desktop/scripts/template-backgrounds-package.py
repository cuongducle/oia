#!/usr/bin/env python3
"""Package an approved real image batch without changing legacy asset URLs.
Usage: python3 scripts/template-backgrounds-package.py <real-run-directory>
"""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageOps

run = Path(sys.argv[1]).resolve()
briefs = json.loads((run / "started.json").read_text())["briefs"]
public = Path(__file__).resolve().parent.parent / "src/renderer/public/studio"
sources = [(brief, run / f"{brief['id']}.png") for brief in briefs]
for brief, source in sources:
    if not source.is_file():
        raise RuntimeError(f"Missing generated source: {source}")
report = []
for brief, source in sources:
    size = tuple(map(int, brief["size"].split("x")))
    image = Image.open(source).convert("RGB")
    if abs((image.width / image.height) / (size[0] / size[1]) - 1) > 0.01:
        raise RuntimeError(f"Unexpected aspect ratio for {brief['id']}: {image.size}")
    target = public / f"{brief['id']}-ai-20261112.webp"
    if target.exists():
        raise RuntimeError(f"Refusing to overwrite versioned artwork: {target}")
    ImageOps.fit(image, size, method=Image.Resampling.LANCZOS).save(target, "WEBP", quality=94, method=6)
    report.append({"id": brief["id"], "sourceSize": list(image.size), "targetSize": list(size),
                   "asset": target.name, "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                   "assetSha256": hashlib.sha256(target.read_bytes()).hexdigest(), "bytes": target.stat().st_size})
(run / "packaging.json").write_text(json.dumps(report, indent=2))
print(f"Packaged {len(report)} versioned images; legacy files unchanged")
