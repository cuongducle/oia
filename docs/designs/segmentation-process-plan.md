---
type: "Design"
title: "SAM local: chạy ngoài process Electron (kế hoạch sau sự cố SIGTRAP)"
description: "Bằng chứng root cause crash onnxruntime-node trong mọi process Electron trên macOS, khảo sát cách các app khác xử lý native ML inference, và các phương án kèm khuyến nghị."
tags: [design, segmentation, electron, onnx]
status: proposed
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

- Log thí nghiệm: /tmp đã xoá; con số then chốt đều ghi trong doc này.
- Gate Node thuần: `apps/desktop/test/segment-real.manual.test.ts` (chạy:
  `pnpm --filter @oia/desktop exec vitest run test/segment-real.manual.test.ts`).
- Model tải lần đầu nằm ở `<userData>/models/sam3` của dir test
  `~/Desktop/oia-sam-e2e` (giữ lại cho các lần chạy sau).
