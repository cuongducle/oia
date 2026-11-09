"""Prepare Mixfont Lens for NON-COMMERCIAL use. Python is build-time only.
Run: OIA_LENS_PYTHON=/path/to/python pnpm --filter @oia/desktop prepare-lens
Requires torch, torchvision, onnx. No upstream Python code is executed.
"""
from pathlib import Path
import hashlib, json, re, urllib.request, tempfile, os

ROOT = Path(__file__).resolve().parents[1] / "resources" / "lens"
COMMIT = "dcbc882de3c91d936a00ee94bff88e8fa754c148"
BASE = f"https://raw.githubusercontent.com/mixfont/lens/{COMMIT}/"
PINS = {
 "model/font_classifier.pt": "67f1e1bbfa2aa79c96a64561a92585042b7998854bb3613886e738288bf350c0",
 "model/font_metadata.json": "7bfc04b3cc0ea4f23a969f7e66306f10357896c7dcb3c2818b0b8820ac4e669d",
}

def fetch(name):
    data = urllib.request.urlopen(BASE + name, timeout=60).read()
    if name in PINS and hashlib.sha256(data).hexdigest() != PINS[name]:
        raise RuntimeError(f"Checksum mismatch: {name}")
    return data

def atomic(path, data):
    path = Path(path)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        f.write(data); temp = f.name
    os.replace(temp, path)

def main():
    import torch
    from torchvision.models import resnet18
    ROOT.mkdir(parents=True, exist_ok=True)
    cached = os.environ.get("OIA_LENS_SOURCE")
    def source(name):
        data = (Path(cached) / name).read_bytes() if cached else fetch(name)
        if name in PINS and hashlib.sha256(data).hexdigest() != PINS[name]: raise RuntimeError(f"Checksum mismatch: {name}")
        return data
    with tempfile.TemporaryDirectory() as temp:
        pt = Path(temp) / "lens.pt"; pt.write_bytes(source("model/font_classifier.pt"))
        checkpoint = torch.load(pt, map_location="cpu", weights_only=True)
    labels = sorted(checkpoint["class_to_idx"], key=checkpoint["class_to_idx"].get)
    model = resnet18(weights=None); model.fc = torch.nn.Linear(model.fc.in_features, len(labels))
    model.load_state_dict(checkpoint["model_state"]); model.eval(); torch.set_num_threads(4)
    h, w = checkpoint["image_height"], checkpoint["image_width"]
    temp_model = ROOT / "lens.tmp.onnx"
    torch.onnx.export(model, torch.zeros(1,3,h,w), str(temp_model), input_names=["image"], output_names=["logits"], opset_version=17, dynamo=False, external_data=False)
    os.replace(temp_model, ROOT / "lens.onnx")
    metadata = json.loads(source("model/font_metadata.json"))["fonts"]
    catalog = []
    for family in labels:
        entry = metadata.get(family, {}); pb = entry.get("metadata_pb", "")
        license_match = re.search(r'^license:\s*"([^"]+)"', pb, re.M)
        variants = []
        for block in re.findall(r'^fonts \{(.*?)^\}', pb, re.M | re.S):
            def field(name, default=""):
                m = re.search(r'^\s*' + name + r':\s*"([^"]+)"', block, re.M)
                return m.group(1) if m else default
            filename = field("filename")
            weight = re.search(r'^\s*weight:\s*(\d+)', block, re.M)
            if not filename: continue
            slug = re.sub(r'[^a-z0-9]', '', family.lower())
            variants.append({"weight": int(weight.group(1)) if weight else 400, "style": field("style", "normal"), "url": f"https://static.mixfont.com/fonts/{slug}/{filename}"})
        catalog.append({"family": family, "license": license_match.group(1) if license_match else "unknown", "vietnamese": 'subsets: "vietnamese"' in pb, "variants": variants})
    atomic(ROOT / "catalog.json", json.dumps(catalog, ensure_ascii=False).encode())
    readme = source("README.md").decode()
    notice = "Mixfont Lens, https://github.com/mixfont/lens\nPinned commit: " + COMMIT + "\n\n" + readme[readme.rfind("## License"):]
    atomic(ROOT / "NOTICE.txt", notice.encode())
    manifest = {"commit": COMMIT, "height": h, "width": w, "classes": len(labels), "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT / "lens.onnx", ROOT / "catalog.json"]}}
    atomic(ROOT / "manifest.json", json.dumps(manifest, indent=2).encode())
    print(json.dumps(manifest, indent=2))

if __name__ == "__main__": main()
