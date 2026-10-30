# Oia — Creative studio refresh

## Research

- [Figma: Web design trends for 2026](https://www.figma.com/resource-library/web-design-trends/) — expressive typography, purposeful motion, efficient media, and accessibility. This is inspiration, not evidence that every visual effect improves usability.
- [The Figma agent is here](https://www.figma.com/blog/the-figma-agent-is-here/) (20 May 2026) — prompting and direct manipulation share a canvas; contextual controls preserve designer control.
- [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) (28 March 2024; explicitly an older craft reference) — reduce navigation noise, align chrome, and preserve information architecture.
- [Cosmos](https://www.cosmos.so/) — live inspection in real Chrome: quiet framing and image-led discovery. No reference-site artwork was copied.

## Direction

Editorial creative studio. Near-white `#fafaf9`, white surfaces, ink `#242529`, violet `#7050e5`, restrained neutral borders. Artwork supplies expressive color; controls do not compete with it. No purple-pink gradient text, fabricated ratings, credit upsells, or gratuitous glass.

The interface is English by default. Vietnamese UI copy and the Vietnamese locale have been removed. Existing Vietnamese language preferences fall back to English. Existing user-authored projects, conversations, and prompts are not rewritten or deleted. Multilingual generation remains supported.

Instrument Serif supplies expressive Home headlines; Be Vietnam Pro remains the readable UI and template font family (its name does not select the interface language). Display headings scale from 42 to 62px; body 14px; chrome 12–13px. Spacing follows 4/8/12/16/24/32/48. Main controls are 36–42px; dense editing tools are 28–32px. Motion is limited to state feedback and short transitions, respecting reduced-motion preferences.

## Concepts and artwork

- `verification/concept-home.png` and `verification/concept-editor.png`: complete English-language concepts generated with Codex image generation before the final implementation pass.
- `apps/web/public/studio/*.webp`: four original generated photographic backgrounds, optimized to 900×1200 WebP. They contain no baked-in UI.
- `apps/web/libs/studio-templates.ts`: actual Fabric scenes. Titles, captions, and other typography remain editable layers, not flattened screenshot facsimiles.

## Surfaces

- **Home:** Studio heading, “From a spark to something great.”, multiline composer, attachment, ratio, resolution, and primary action. Advanced controls preserve page count, skills, brand kit, and outline. Four format cards and real scene previews. No automatic blocking onboarding.
- **Workspace:** Search, new/import actions, actual recent projects and conversations, full-scene previews, and useful empty states. Never trim real records to match a reference screenshot.
- **Toolbox:** Two grouped AI sections, five cards including XHS and PPT, informative visual previews, and honest availability. Quick tools remain grouped.
- **Brand kit:** List/detail layout, name, guidance, logos, colors, fonts, notes extraction, save/delete/default controls. Updating a kit retains its selected ID.
- **For Agents:** API management, one-time secret display, visible copy/revoke controls, responsive forms, and a separate empty state rather than a clipped empty table.
- **Editor:** Independent fullscreen shell, 58px topbar, 68px rail, optional 232px inspector, real remaining canvas space, and a 304px AI dock. The dock starts closed on phones. Fit uses actual scene dimensions and available space. Native page buttons, zoom/pan/fit, undo/redo, autosave, sharing, and export remain available.
- **Shared projects:** Every page renders its complete scene, including text and shapes. Offscreen previews initialize lazily.

## Functional corrections found during visual QA

1. First autosave posted `pages`, but the create endpoint discarded them and silently created a blank default page. The API/store now validate and retain all pages, layers, and sizes. Regression tests reproduce the original failure.
2. Persistent Fabric listeners captured stale React state. Persistence now reads the latest project/page state from refs and sharing awaits persistence.
3. Inserted text, shapes, images, and tables used zoomed viewport dimensions as document coordinates. Geometry is now zoom-independent.
4. Text property changes and artboard resizing now participate in history/autosave; artboard identity survives serialization.
5. Page switching restores dimensions and resets per-page history. Autosave preserves each page’s own size.
6. Export previously loaded every page into the live editor, risking corrupted autosaves and history. An isolated StaticCanvas now renders exports; PDF supports mixed page sizes, and PPTX fits artwork without stretching.
7. Server-generated PPTX used a non-base64 image URL as image data. A stronger integration test checked embedded media instead of only the ZIP signature; the processor now embeds actual image bytes.
8. Modal dialogs trap focus, close with Escape, restore prior focus, and lock background scrolling.

## Verification standard

Typecheck, production build, regression tests, real Chrome interactions, explicit readiness checks, actual downloads, and desktop/phone screenshots. Vision feedback identifies discrepancies; numeric similarity scores are not acceptance evidence. See [`verification/editor-export-checks.md`](../verification/editor-export-checks.md) for the completed checks and remaining limits.

## Product principles

BYOK instead of credits or upsells. The visual design is original and independent. No invented users, ratings, paid upgrades, or earnings claims.

## Source of truth (nơi lấy giá trị — đọc trước khi viết UI mới)

| Quan tâm | Nơi canonical | Ghi chú |
| --- | --- | --- |
| Token màu / biến CSS | `apps/desktop/src/renderer/app.css` | Desktop là sản phẩm; `apps/web/app/globals.css` chỉ còn là tham chiếu đóng băng (chết theo bước 6) |
| Font | `apps/desktop/src/renderer/fonts/` (Be Vietnam Pro, Instrument Serif) | Tự host — không CDN |
| Component mẫu | `apps/desktop/src/renderer/components/` (Dialog, ScenePreview) | View mới bắt chước sibling gần nhất trước khi tự nghĩ |
| Icon / hình template | `apps/desktop/src/renderer/public/studio/` | Trùng bộ với web — đã copy ở bước 2 |
| Registry tool / template | `renderer/lib/tools-registry.ts`, `studio-templates.ts` | Đã là bản sở hữu của desktop |

Không hardcode hex/px trong view khi một biến đã tồn tại. Cần token mới → thêm vào `app.css` rồi dùng — không rải giá trị riêng lẻ.

## UX rules (áp dụng cho mọi view, đặc biệt khi port 4c/4d)

**Feedback theo thời lượng hành động** — câu hỏi đúng không phải "có nên hiện spinner không" mà là "hành động này chạy bao lâu":

| Thời lượng | Feedback |
| --- | --- |
| < 100 ms | Không gì cả — hiện gì cũng đọc là glitch |
| 100 ms – 1 s | Chỉ disable control |
| 1 – 3 s | Disable + spinner / đổi nhãn |
| 3 s+ nhiều bước | Nhãn theo giai đoạn ("Planning…" → "Painting…" → "Composing…") |
| 1 – 6 phút (generation) | Stream tiến trình (đã có qua chat events) + nút Cancel LUÔN hiển thị + không chặn UI |

Hệ quả: **reserve sẵn chỗ** cho trạng thái sắp xuất hiện (nhãn dài hơn, icon thêm vào — fix width trước, đừng để nút nhảy nhót); generation là chuyện bình thường của app này — người dùng phải làm được việc khác trong lúc chờ.

**UI copy không được overclaim.** Không nói "saved / verified / generated" khi code không có state chứng minh — họ hàng trực tiếp của nguyên tắc B7 "records must not lie". Khi đang chờ: ngôn ngữ trung tính ("Saving…"), động từ kết quả chỉ hiện khi có kết quả thật.

**Cancel không phải destructive.** Nút thoát luồng (back, close, dismiss) giữ yên tĩnh — màu và trọng lượng thị giác dành cho hành động khẳng định. Xem chi tiết bảng variant trong STYLEGUIDE của Orca nếu cần chuẩn đối chiếu.

**Port từ web = mirror, không taste lại.** Route web là tham chiếu semantic (xem AGENTS.md "Reuse before reimplementing"); hướng thị giác lấy từ doc này. Đổi gì phải ghi lý do vào commit.

## Khi doc này im lặng

1. Nhìn view sibling gần nhất trong `renderer/views/` — làm theo sibling.
2. Nhìn `renderer/components/` — có component sẵn không thì dùng.
3. Là câu hỏi token → `app.css` là canonical: dùng cái có, hoặc thêm mới ở đó.
4. Vẫn chưa giải quyết → hỏi owner, đừng tự phát minh.
