# Thiết kế app cho Mac 2026 — nghiên cứu cho bước 7 (đóng gói macOS)

* **Ngày:** 2026-10-30 (research web, nguồn dẫn cuối file)
* **Phạm vi:** đầu vào thiết kế/gate cho bước 7 của [reorg plan](../designs/desktop-only-reorg.md) — icons, window chrome, quyết định có theo Liquid Glass hay không.
* **Tình trạng:** research hoàn tất, chưa có quyết định owner. Ghi vào đây để khỏi tìm lại.

---

## 1. Bối cảnh: Liquid Glass là ngôn ngữ thiết kế hiện hành của macOS

macOS 26 "Tahoe" (WWDC 06/2025, ship 09/2025) mang **Liquid Glass** — vật liệu trong suốt
phản chiếu/khúc xạ nội dung phía sau, tự thích ứng sáng/tối, phủ mọi nền tảng Apple
(iOS/iPadOS/macOS/watchOS/tvOS). Đến 2026 đây là mặt mũi chuẩn của Mac.

Những gì thay đổi trên Mac (nguồn: Apple Newsroom + tổng quan hệ sinh thái 02/2026):

- **Control/toolbar/sidebar làm lại hoàn toàn** — làm từ Liquid Glass, là một lớp chức năng
  NẰM TRÊN nội dung (content-first: control "nhường chỗ" cho nội dung, morph khi cần).
- **Sidebar khúc xạ nội dung phía sau** — người dùng luôn cảm nhận ngữ cảnh (Finder, Apple TV).
- **Menu bar trong suốt hoàn toàn** — màn hình "thấy" lớn hơn.
- **Dock/app icon/widget nhiều lớp glass** — tùy biến light/dark/**tint**/**clear**.
- SF typeface co giãn weight/width theo ngữ cảnh (Lock Screen).
- Bo góc control đồng tâm với góc bo màn hình/cửa sổ.
- Accessibility: Liquid Glass tôn trọng Reduce Transparency / Increase Contrast / Reduce Motion
  (hai biến thể glass: regular + clear).

**Định nghĩa "adopt cho đúng"** (tổng quan 02/2026 — openmarkapp): dùng material THẬT thích ứng
(không phải đổi màu accent), tint thích ứng theo nội dung phía sau, phân lớp nhất quán
(toolbar trên content, sidebar cạnh content — vật liệu thể hiện cái gì trước cái gì),
xây sẵn cho nó chứ không gắn vô sau.

## 2. ⚠️ Bẫy bắt buộc biết: Electron từng lag toàn hệ thống trên Tahoe

Sự kiện 09–11/2025, quan trọng nhất với app Electron như Oia:

- **Triệu chứng:** app Electron mở (không minimize) → di chuyển cửa sổ/scroll toàn hệ thống
  giật lag, kể cả khi đang ở app khác. CPU/GPU thấp — thủ phạm là **WindowServer**.
- **Root cause** (avarayr, xác nhận bởi fix chính thức): Electron override private AppKit API
  `_cornerMask` để vẽ corner mask cho vibrant view. WindowServer gọi đúng method này để tính
  shadow cửa sổ; override (ngay cả override rỗng chỉ gọi `super`) phá memoization → WindowServer
  tính lại + vẽ lại shadow liên tục.
- **Fix Electron:** PR electron#48376 bỏ override — có mặt từ **36.9.2 / 37.6.0 / 38.2.0 / 39.0.0 trở lên**.
- **Apple vá OS-wide từ macOS 26.2** (11/2025) — nhưng chờ app tự nâng vẫn là việc của từng dev
  (Dropbox, 1Password, Cursor… lâu mới kịp).

**Áp cho Oia:** đang Electron **39.8.10 → đã chứa fix, an toàn**. Luật rút ra (đề xuất đưa vào
nợ/CI khi bước 7): không bao giờ ghim Electron < 39 trên nhánh ship macOS; cân nhắc test nhẹ
"mở app + kéo cửa sổ không giật" vào shot gate trên máy Tahoe thật của owner.

## 3. Electron vs native trên Tahoe — vị thế trung thực

- Native (SwiftUI `.ultraThin/.thin/.regularMaterial`, AppKit `NSGlassEffectView`) adopt Liquid
  Glass được trực tiếp; hệ sinh thái 2026 đang **chia rẽ thị giác**: native đẹp lên rõ, Electron
  (VS Code, Slack, Discord, Notion, Figma…) vẫn phẳng và "không thuộc về Tahoe" (nhận định của
  bài openmarkapp — quan điểm một phía của native dev, nhưng triệu chứng "visual uncanny valley"
  là có thật với người dùng Mac lâu năm).
- **Electron core chưa expose NSGlassEffectView** (tính đến lúc research). Có sẵn:
  - `vibrancy: 'sidebar' | 'under-window' | ...` — NSVisualEffectView, material hệ thống tự
    thích ứng sáng/tối (mức "mặc hệ vẽ giúp", không phải glass thế hệ mới nhưng không giả);
  - `titleBarStyle: 'hiddenInset'` + `trafficLightPosition` — titlebar trong suốt ăn khớp,
    traffic lights chồng lên nội dung như app native.
- **Add-on cộng đồng** lấy glass THẬT: `electron-liquid-glass` (Meridius-Labs, OSS) và
  `super-browser-window-kit` (thương mại, bài Medium 09/2025 thực chất là quảng cáo cho nó).
  Cả hai gọi `NSGlassEffectView` qua native addon. **Rủi ro:** chính là kiểu phụ thuộc private API
  của bên thứ ba từng gây thảm họa `_cornerMask` (mục 2) — không có cam kết ổn định từ Apple
  lẫn maintainer; đổi lại là glass thật với chi phí thấp.

## 4. Khuyến nghị cho Oia (3 tầng, theo chi phí/lợi ích)

Persona là seller Việt dùng công cụ sản xuất — app không cần glass để bán hàng. Mục tiêu thực
sự: **không trông như "web page kẹt trong khung nhôm"** trên máy Mac của họ, đúng chuẩn ở nơi
người dùng nhìn thấy đầu tiên.

| Tầng | Việc | Chi phí | Khi nào |
| --- | --- | --- | --- |
| **T0 — hiện trạng** | UI phẳng như đa số Electron lớn (Figma, Slack trên Tahoe vẫn thế) | 0 | chấp nhận được vô thời hạn |
| **T1 — nền tảng macOS đúng chuẩn (khuyến nghị làm ở bước 7)** | (a) icon app: `.icns` chuẩn, cân nhắc làm **icon nhiều lớp qua Icon Composer** (tuyệt đẹp trong Dock tùy tint/clear; Electron nạp `.icns` bình thường, icon nhiều lớp Tahoe cần Assets.car — xem "không cần Xcode app" của Hendrik Erz); (b) `titleBarStyle: 'hiddenInset'` + `trafficLightPosition` + khoảng đệm sidebar để traffic lights không đè chữ; (c) tùy chọn `vibrancy: 'sidebar'` cho nav trái (material hệ, tự theo dark mode); (d) tôn trọng Reduce Transparency/Increase Contrast (CSS `prefers-reduced-transparency`/`prefers-contrast` nếu dùng nền mờ CSS) | thấp, 1–2 buổi | cùng bước 7 (đóng gói cần icon bắt buộc) |
| **T2 — glass thật** | add-on `electron-liquid-glass`/`super-browser-window-kit` cho toolbar/sidebar | trung + rủi ro private API | để sau v1; chỉ cân nhắc nếu owner muốn "thử cảm giác Tahoe" — nhớ bài học mục 2 |

**Không làm:** tự viết native addon override private API; fake glass bằng backdrop-filter CSS
trên nền trong suốt (trông "gần đúng" = uncanny valley, lại tốn GPU canvas lớn của editor).

Ghi chú giao với design doc hiện hành: `design-direction.md` có bảng **UX rules** (feedback
thời lượng, Cancel luôn hiện, không overclaim) — T1 không chạm nội dung đó, chỉ là chrome.
IconComposer cần Xcode 26 (có sẵn trên máy dev); icon nhiều lớp cũng render fallback đúng cho
macOS cũ — không mất gì khi chỉ xuất icon.

## 5. Checklist áp vào bước 7 (rút từ research) — cập nhật 2026-10-30 (bước 7c)

- [x] Icon: **placeholder .icns đã ship (7a)** — squircle tím accent + O serif. Quyết định icon THẬT (nhiều lớp Icon Composer vs icns thường) vẫn chờ owner — không chặn v1.
- [x] Window chrome: `hiddenInset` + traffic light padding — SHIP (7c); dark mode ✅ ĐÓNG bằng gate tự động (2026-10-30 tối): bắt bug trắng-trên-trắng, pin `color-scheme: light` + shot gate dùng `nativeTheme.themeSource` — xem reorg doc.
- [ ] Vibrancy sidebar: thử 1 nhánh, shot gate so sáng tối; bỏ nếu làm canvas editor lệch màu — **CHƯA thử, không chặn v1**.
- [x] Gate kéo-cửa-sổ trên máy Tahoe thật — 7c: cliclick kéo header, window dịch đúng +240px trên bản packaged; độ mượt thị giác = quick-check owner khi tiện.
- [x] Electron >= 39 trong cây ship mọi lúc — 39.8.10 pin; desktop-audit CI giữ.
- [x] Không thêm phụ thuộc native glass nào vào v1 — giữ nguyên.

## 6. Nguồn (truy cập 2026-10-30)

- Apple Newsroom — thiết kế mới Liquid Glass (09/06/2025):
  https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- Apple HIG — Foundations / Adopting Liquid Glass:
  https://developer.apple.com/design/human-interface-guidelines/foundations
- M.J. Tsai — Electron apps causing system-wide lag on Tahoe (chuỗi update tới 11/2025, gồm
  root cause, danh sách version fix, Apple fix 26.2): https://mjtsai.com/blog/2025/09/30/electron-apps-causing-system-wide-lag-on-tahoe/
- Script dò app Electron chưa fix (Tomas Kafka, có bản applet của Hockenberry) — dẫn trong bài Tsai.
- The Register — Electron patch fix Tahoe slowdown (02/10/2025):
  https://www.theregister.com/software/2025/10/02/electron-patch-fixes-macos-26-tahoe-slowdown-bug/
- openmarkapp — macOS Tahoe apps with Liquid Glass (19/02/2026; quan điểm native-dev một phần):
  https://openmarkapp.com/blog/macos-tahoe-apps-liquid-glass
- Meridius-Labs/electron-liquid-glass (OSS, NSGlassEffectView bindings):
  https://github.com/Meridius-Labs/electron-liquid-glass
- Apple — Icon Composer: https://developer.apple.com/icon-composer/
- createwithswift — Crafting Liquid Glass app icons with Icon Composer (12/06/2025):
  https://www.createwithswift.com/crafting-liquid-glass-app-icons-with-icon-composer/
- Hendrik Erz — Supporting Liquid Glass icons without Xcode app:
  https://www.hendrik-erz.de/blog/supporting-liquid-glass-icons-2025
- Medium (Deng Gao) — Why your Electron app doesn't feel native (09/2025; **lưu ý: bài marketing
  cho super-browser-window-kit** — dùng chọn lọc): https://medium.com/@gaodengming/why-your-electron-app-doesnt-feel-native-on-macos-and-how-to-fix-it-8180626dd6db
