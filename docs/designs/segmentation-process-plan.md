---
type: "Design"
title: "SAM local: chạy ngoài process Electron (kế hoạch sau sự cố SIGTRAP)"
description: "Bằng chứng root cause crash onnxruntime-node trong mọi process Electron trên macOS, khảo sát cách các app khác xử lý native ML inference, và các phương án kèm khuyến nghị."
tags: [design, segmentation, electron, onnx]
status: implemented
generated: { by: agent, at: 2026-11-10T00:00:00Z }
owner: cuongducle
---

# SAM local: chạy ngoài process Electron

Nguồn kích hoạt: chạy e2e thật SG-1 ngày 10/11/2026 (owner "chạy thật sam full
luồng đi xem có lỗi ko"). Luồng GUI chạy đúng tới lúc submit task `segment-image`
rồi utility process chết. Doc này ghi bằng chứng, khảo sát ngành và các phương án
để owner chốt hướng. Không đổi code theo doc này cho đến khi owner duyệt.

## 1. Triệu chứng và root cause (đã chứng minh bằng thí nghiệm)

Luồng e2e trên macOS (app đóng gói v0.5.0 + dev build, userData tạm):

1. Mở template Serum launch post, chọn layer ảnh, bấm Split layer.
2. Dialog download model hiện đúng tiến trình: 880 MB (5 file) hết ~100 giây.
3. Dialog prompt mở, chọn "bottle", bấm Split layer.
4. Task submit xong thì **utility process chết "exit code 5"**, UI báo
   `UtilityProcessCrashed: services process exited (code 5)`, app tự hồi phục
   ở thao tác kế tiếp (cơ chế crash-smoke làm đúng việc của nó).

"Exit code 5" thực chất là **signal 5 = SIGTRAP**. Crash report
`~/Library/Logs/DiagnosticReports/Electron-2026-11-10-115754.ips` cho thấy chuỗi:

```text
libonnxruntime BFCArena::Extend / AllocateRawInternal
→ libc++abi operator new(unsigned long, std::align_val_t)   [khối aligned cỡ lớn]
→ libsystem_malloc _malloc_zone_memalign
→ Electron Framework (shim malloc-zone của Chromium PartitionAlloc)
→ EXC_BREAKPOINT (SIGTRAP)
```

Nghĩa là: trong MỌI process liên kết Electron trên macOS, malloc đi qua zone
shim của Chromium. ONNX Runtime CPU EP cần khối cấp phát aligned cỡ GB khi
vision-encode 1008px (ma trận attention của ViT ở độ phân giải này cỡ GB mỗi
head), PartitionAlloc từ chối và trap process.

Ma trận thí nghiệm (mô hình int8 thật 880 MB, ảnh serum.webp):

| Môi trường | Vision run 1008px | Ghi chú |
| --- | --- | --- |
| Node 25 thuần | OK, ~6-7 giây | pipeline đủ 31,5 giây end to end, tìm đúng lọ serum score 0,939 |
| Node 22.22.1 thuần (đúng bản Electron nhúng) | OK, ~6 giây | loại trừ nguyên nhân "sai phiên bản Node" |
| Electron MAIN process | SIGTRAP | |
| Electron utility process | SIGTRAP (exit "code 5") | cả dev lẫn đóng gói, tức không phải asar |
| ELECTRON_RUN_AS_NODE=1 | SIGTRAP | sidecar bằng chính binary app KHÔNG được |
| `intraOpNumThreads:1` + `enableCpuMemArena:false` | vẫn SIGTRAP | |
| CoreML EP | vẫn SIGTRAP | chỉ 1351/3455 node sang CoreML, phần CPU fallback vẫn chết |
| Run nhỏ (text encoder 32 token) trong utility | OK | chỉ run có working set lớn mới chết |
| onnxruntime-web WASM (1 thread) | OK nhưng 115,8 giây | heap WASM dùng WebAssembly.Memory, né malloc zone |

Model là static-shape (feed 288px bị lỗi broadcast), luôn ép input 1008, nên
"giảm input" phải re-export model và ma trận attention vẫn cỡ GB: không phải lối ra.

## 2. Người khác xử lý thế nào (khảo sát 10/11/2026)

- **node-llama-cpp** (tài liệu Electron chính thức) và **@electron/llm** (gói
  tham chiếu của chính đội Electron): chạy native inference trong main/utility
  process. llm.cpp dùng bộ cấp phát ggml malloc từng tensor cỡ MB, thân thiện
  với PartitionAlloc. ONNX Runtime thì không (arena + khối GB aligned), nên kinh
  nghiệm này không chuyển sang được cho ORT.
- **Ollama, LM Studio, Liquid AI (docs)**: chạy inference trong **tiến trình
  sidecar riêng** (llama-server). Lý do của họ: cô lập crash, tái dùng giữa các
  lần mở app. Chính sự cố hôm nay chứng minh giá trị cô lập crash: một native
  crash giết cả tầng services của app.
- **transformers.js và các app web**: dùng onnxruntime-web (WASM). WASM chạy
  được trong Electron nhưng chậm (đo ở trên).
- Không tìm thấy bản vá upstream cho cặp ORT + Electron macOS trên macOS
  (issue gần nhất của ORT là worker thread Windows, đã stale).

## 3. Các phương án

### A. Sidecar native runner (KHUYẾN NGHỊ)

Tiến trình nhỏ độc lập trong `extraResources` (Rust với crate `ort` hoặc tương
đương), giao tiếp stdio (JSON + binary frame): vào là PNG + prompt, ra là mask
PNG + boxes + scores. Dùng lại đúng 5 file model đã pin sha256 (không đổi
download). App spawn như child process, giết khi cancel/quit (shutdownSequence
hiện có đã biết xử lý child tree).

- Tốt: tốc độ native 6-8 giây encode, 1-2 giây/prompt; crash SAM không bao giờ
  giết services; không phụ thuộc allocator của Electron; Windows dùng chung thiết kế.
- Chi phí: build matrix mới (mac arm64 + win x64) trong CI, giao thức IPC nhỏ,
  ~15-30 MB mỗi nền tảng (so SG-14 đang muốn giảm installer thì cần cân đối).
- Ước lượng: 2-4 ngày gồm test error path + CI.

### B. onnxruntime-web WASM trong utility (fallback khả thi ngay)

- Tốt: không process mới, không binary mới, đổi import trong engine là chạy được.
- Chi phí đã đo: 115,8 giây encode (1 thread; utility không có COOP/COEP nên
  không bật được multi-thread WASM). Với seller là 2 phút cho mỗi ảnh mới: chấp
  nhận được hay không là quyết định sản phẩm.
- Giữ làm phương án "slow mode" hoặc tạm dừng feature thì hợp lý hơn là ship mặc định.

### C. Re-export model nhỏ hơn / dynamic shape

Không giải quyết: ma trận attention 1008px vẫn cần khối GB trong native run.
Chỉ đáng xem lại sau này vì lý do tốc độ hoặc chất lượng, không phải vì crash.

### D. Chờ upstream

Không có tín hiệu sửa sớm. Shim PartitionAlloc nạp cả khi ELECTRON_RUN_AS_NODE,
nên mọi biến thể "chạy Node bên trong binary Electron" đều chết.

## 4. Việc đề xuất làm ngay (chờ owner duyệt)

1. **Nút Split layer trong bản đóng gói hiện tại là feature chết chìm**: bấm là
   crash services (tự hồi phục nhưng load 880 MB vô ích + seller thấy lỗi).
   Đề xuất: capability-flag tắt nút trong bản packaged cho đến khi sidecar về
   (dev vẫn chạy được qua `segment-real.manual.test.ts`). Windows khả năng cao
   cùng bệnh (PA everywhere), chờ máy vật lý xác nhận theo D3.
2. Chọn hướng A (sidecar) hay B (wasm slow mode) cho ngắn hạn.
3. Ghi debt: `segment-real.manual.test.ts` là gate thật chạy tay Node thuần
   (model + ảnh thật), giữ lại làm chuẩn đối chiếu khi sidecar hoàn thành.

## 5. Vết lại

- Gate Node thuần (sidecar thật): `apps/desktop/test/segment-real.manual.test.ts`
  (`pnpm --filter @oia/desktop exec vitest run test/segment-real.manual.test.ts`,
  cần `node scripts/prepare-segment.mjs` + models dir). Con số then chốt đều
  ghi trong doc này; log thí nghiệm /tmp đã xoá.
- Model tải lần đầu nằm ở `<userData>/models/sam3` của dir test
  `~/Desktop/oia-sam-e2e` (giữ lại cho các lần chạy sau).

## 6. Ghi nhận triển khai (2026-11-10, owner chốt "A đi")

Option A đã SHIP trong ngày, cấu trúc:

- **`apps/desktop/segment-runner/`**: crate Rust mỏng (`ort` crate, `load-dynamic`),
  giao thức JSON-lines (payload base64 LE f32/i64), ops ping/vision/text/decode.
  Vision outputs cache TRONG runner theo content-hash (LRU 2), chỉ pixels (~12 MB)
  và masks (~10 MB) qua pipe. ORT load động từ lib pin 1.31.1 copy từ
  onnxruntime-node (chạy đúng bản đã test). Binary 518 KB sau LTO+strip.
- **`src/utility/segmentation/runner.ts`**: client Electron-free
  (node:child_process), tuần tự, timeout, crash giữa chừng = promise reject +
  spawn lại lần gọi sau (generation bump để engine xóa cache vision), test đủ
  error path với fake runner thật (7 test).
- **`engine.ts`**: giữ nguyên BPE tokenize + preprocess + mask postprocess
  (byte-identical), bỏ hoàn toàn onnxruntime-node trong process Electron.
- **Capability gate**: thiếu sidecar (chưa prepare-segment) = không có
  segmenter = task lane trả `capability_unsupported` thay vì crash.
- **Packaging**: `scripts/prepare-segment.mjs` (cargo build + copy ORT lib,
  temp+rename), extraResources `resources/segment`, CI dist jobs có Rust
  toolchain + rust-cache cho cả mac lẫn windows.

Bằng chứng:
- Gate Node thuần (sidecar thật + model thật): box/score TRÙNG KHỚP tuyệt đối
  với chạy in-process cũ (0.544 0.299 0.730 0.641, score 0.939); lần đầu
  18,6 giây, prompt kế tiếp cùng ảnh 8,4 giây (cache hai phía).
- GUI e2e trên DEV build (đúng luồng từng crash): chọn layer artwork qua panel
  Layers, Split layer, prompt "bottle", toast "1 layer cut out", lọ serum
  thành layer riêng có handle, utility sống, runner sống, KHÔNG crash.
- Gate đóng gói: xem cập nhật SG-1 trong surgepix-parity-todo.md.

Nợ ghi sổ: (1) dylib ORT 45 MB mỗi nền tảng vào installer (SG-14 cân nhắc
bản ORT tối giản hoặc tối ưu sau); (2) prompt thứ hai 8,4 giây còn chậm do
base64 decode + upsampleMask tuần tự, tối ưu sau khi có benchmark SG-6;
(3) Windows chưa chạy thật trên máy vật lý (D3), CI dist-win build binary
  cùng kênh.
