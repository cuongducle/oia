import { cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Liquid Glass icon (macos-design-2026): macOS 26+ can render a layered
 * `.icon` package (Icon Composer format) instead of the flat icns. Ship BOTH:
 * CFBundleIconFile points at the layered package; icon.icns stays for older
 * macOS via the CFBundleIconFiles array. extendInfo can't do this — the builder
 * computes CFBundleIconFile after merging it — so the plist is patched here.
 * plutil is macOS-only, which is fine: this hook is darwin-gated.
 */
const here = path.dirname(fileURLToPath(import.meta.url));

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const contents = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents");
  const resourcesDir = path.join(contents, "Resources");
  cpSync(
    path.resolve(here, "../resources/icons/AppIcon.icon"),
    path.join(resourcesDir, "AppIcon.icon"),
    { recursive: true },
  );
  const plist = path.join(contents, "Info.plist");
  const set = (key, value) => execFileSync("plutil", ["-replace", key, "-json", JSON.stringify(value), plist]);
  set("CFBundleIconFile", "AppIcon.icon");
  set("CFBundleIconFiles", ["icon.icns", "AppIcon.icon"]);
  console.log(`  • layered icon → ${path.join(resourcesDir, "AppIcon.icon")} (+Info.plist)`);
}
