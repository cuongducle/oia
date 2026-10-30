# Editor parity — web ↔ desktop (reorg step 5)

Ngày: 2026-11-06 · Phương pháp: đếm theo **tính năng** (không theo dòng) — mỗi mục lấy
từ hành vi có thật của editor web (`apps/web/app/editor/page.tsx`, 890 dòng, frozen
reference) rồi đối chiếu editor desktop (`apps/desktop/src/renderer/views/Editor.tsx`,
988 dòng). Kết luận mỗi dòng: ✅ port đủ / ➕ desktop có thêm (không bắt buộc).

## Kết luận tổng

**Parity ĐỦ — desktop ⊇ web.** Không có tính năng web nào thiếu trên desktop.
Desktop vượt reference ở: attach ảnh tham chiếu trong AI dock, text color/font-size
trong text toolbar, bảng settings màu nền, nút "Load your library" cho template cộng
đồng (web chỉ fetch). Cấu trúc 2 file gần như trùng khớp (port trực tiếp), khác
biệt nằm ở lane dữ liệu (fetch → bridge IPC) đúng chủ đích D2.

## Checklist từng tính năng

### Canvas & artboard

| Tính năng | Web | Desktop | Ghi chú |
|---|---|---|---|
| Fabric canvas + load scene | ✅ | ✅ | `createEditor(@oia/canvas)` — chung package |
| Pan/zoom (Zoom in/out/fit) | ✅ | ✅ | aria-label khớp từng cái một |
| Định vị theo tọa độ document (zoom-independent) | ✅ | ✅ | `@oia/canvas` test editor-geometry |
| Artboard size + "Apply size to all pages" | ✅ | ✅ | settings panel, BR-ED3' test ở canvas |
| Chọn/kéo/scale/xoá object | ✅ | ✅ | cùng @oia/canvas actions |

### Pages

| Tính năng | Web | Desktop |
|---|---|---|
| Add page / Duplicate page / Switch page | ✅ | ✅ |
| Xoá page (giữ ít nhất 1) | ✅ | ✅ (canvas/pages.test) |
| Multi-page export (ALL → ZIP/PPTX) | ✅ | ✅ (canvas/pages.test) |

### Layers & selection

| Tính năng | Web | Desktop |
|---|---|---|
| Bring to front/forward, Send backward/to back | ✅ | ✅ |
| Duplicate selection | ✅ | ✅ |
| Align left/center/right | ✅ | ✅ |
| Provenance (lớp user sống sót qua AI refinement — TP.10) | ✅ | ✅ (canvas/provenance.test) |

### Text toolbar

| Tính năng | Web | Desktop |
|---|---|---|
| B/I/U/S, align, font size, char spacing, color, font | ✅ | ✅ — desktop có thêm Text color/Font size aria riêng (16 actions, canvas/actions.test) |
| 4 text presets (heading/subheading/…) | ✅ | ✅ (canvas/presets.test) |

### Panels (7/7)

| Panel | Web | Desktop |
|---|---|---|
| Templates | ✅ community fetch + "Refresh templates" | ✅ STUDIO_TEMPLATES built-in + "Load your library" qua IPC `templates.list` (siêu tập) |
| Assets (upload → canvas) | ✅ | ✅ (upload qua `uploadAsset` IPC, không fetch) |
| Text | ✅ | ✅ |
| Shapes (9 shapes) | ✅ | ✅ (canvas/presets.test) |
| Tables | ✅ | ✅ |
| Draw | ✅ | ✅ |
| Settings (12 size presets) | ✅ | ✅ (canvas/presets.test) + ➕ background color |

### AI dock

| Tính năng | Web | Desktop |
|---|---|---|
| Mở/đóng dock, gửi edit request (Enter gửi, Shift+Enter xuống dòng) | ✅ | ✅ |
| Stream ChatEvents, timeline, narrative, lỗi errorClass → EN + 1 action | ✅ | ✅ (`onChatEvent` bridge; `presentErrorEn`) |
| Mention selected layer | ✅ | ✅ |
| Stop/Cancel job | ✅ | ✅ |
| Conversation history panel + New conversation | ✅ | ✅ |
| Ảnh tham chiếu trong dock | — | ➕ desktop thêm (`AI reference image file`) |

### Export

| Tính năng | Web | Desktop |
|---|---|---|
| PNG/JPG/PDF/PPTX/ZIP(jpg), scope current/ALL | ✅ | ✅ (canvas/actions + pages tests; desktop dùng bản lib `makePptx` port, web load vendor bundle — cùng strategy) |
| Export canvas cô lập, không đụng history/autosave | ✅ | ✅ (comment same) |
| Tải xuống | anchor download | ➕ qua `saveExport` (dialog native — thay cho share link đã bỏ theo D2) |

### Persistence & history

| Tính năng | Web | Desktop |
|---|---|---|
| Autosave theo projectId (debounce) | ✅ | ✅ (`saveProject` IPC; store giờ per-project file — bước 5) |
| Undo/redo (Ctrl/Cmd+Z, Shift+Z, Ctrl+Y; bỏ qua input/dialog focus) | ✅ | ✅ (code giống hệt) |
| Escape đóng mọi panel/dialog | ✅ | ✅ |
| Publish community template | ✅ | ✅ ("Publish template" → `createTemplate` IPC) |
| Đổi tên project | ✅ | ✅ (Project name input) |

### Lane dữ liệu (khác biệt có chủ đích — D2)

| Web (fetch HTTP) | Desktop (bridge IPC) |
|---|---|
| `/api/projects*` | `createProject/getProject/saveProject/removeProject` |
| `/api/chat/*` SSE | `chatRun` + `onChatEvent` stream |
| `/api/upload` | `uploadAsset` |
| `/api/files/*` | `oia://files` protocol (`mapAssetUrls`) |
| Share link `p/[id]` | ❌ bỏ theo quyết định D2 — thay bằng export file |

## Gate đã chạy

- Đối chiếu aria-label/dashboard buttons: mọi control web đều có mặt desktop
  (diff chỉ còn tên nút đổi kiểu "Publish community template" → "Publish template").
- `apps/desktop` vitest 80/80 xanh (bao gồm mapAssetUrls round-trip display↔canonical).
- Shot gates (scripted eyes) đã cover các view chính từ bước 4 — không đổi gì UI editor trong bước 5 ngoài nút Import (Workspace).
