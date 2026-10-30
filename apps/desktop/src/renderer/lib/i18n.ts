"use client";

/**
 * D8 FINAL (owner, 2026-10-30): the desktop UI ships ENGLISH — this file is the
 * I18nKey SOURCE ONLY, trimmed from the web's 12-locale dictionary (reorg step 4e).
 * provider-errors.ts maps errorClass → key; renderer/lib/errors.ts owns the EN copy.
 * The web app keeps the full multilingual dictionary until it is deleted (step 6).
 */
const en = {
    "nav.home": "Home",
    "nav.workspace": "Workspace",
    "nav.brandkit": "Brand kit",
    "nav.toolbox": "Toolbox",
    "nav.agents": "For Agents",
    "home.hero": "Realize your ideas",
    "home.sub": "Create & edit visuals with AI — open-source, BYOK, layer-based (Fabric.js).",
    "home.placeholder": "What would you like to create today?",
    "home.generate": "Generate",
    "home.designing": "Designing…",
    "home.community": "Community",
    "home.brandkitHint": "create brand kit →",
    "editor.untitled": "Untitled project",
    "editor.export": "Export",
    "editor.download": "Download",
    "editor.all": "ALL",
    "editor.current": "Current",
    "toolbox.title": "Toolbox",
    "toolbox.aiSkills": "AI Skills",
    "toolbox.quickTools": "Quick Tools",
    "agents.title": "For Agents",
    "agents.newKey": "+ New key",
    // ---- Stage 0 (TP.3/TP.6/TP.4): these strings ship Vietnamese-first by design —
    // the persona is the Vietnamese online seller; plain-Vietnamese messages with ONE action each.
    "mode.toggle": "Chữ sửa được ngay",
    "mode.toggleHint": "Ảnh nền không chữ — nội dung chữ thành lớp sửa được ngay",
    "provider.mockBanner": "Chế độ thử nghiệm — ảnh placeholder, không phải AI thật",
    "editor.stop": "Dừng",
    "error.provider_missing": "Chưa cài công cụ AI (Codex CLI). Hãy cài đặt rồi thử lại.",
    "error.not_logged_in": "Chưa đăng nhập ChatGPT trên Codex. Hãy chạy “codex login” rồi thử lại.",
    "error.quota_exceeded": "Đã dùng hết lượt AI trong hạn mức này. Đợi hạn mức đặt lại rồi thử lại nhé.",
    "error.rate_limited": "Quá nhiều yêu cầu cùng lúc. Đợi một lát rồi thử lại nhé.",
    "error.content_refused": "Nội dung bị từ chối vì chính sách an toàn. Hãy đổi cách mô tả rồi thử lại.",
    "error.timeout": "Tạo ảnh quá lâu, đã vượt thời gian chờ. Thử lại nhé.",
    "error.format_drift": "Định dạng đầu ra của công cụ AI đã thay đổi — cần cập nhật Oia.",
    "error.no_output": "Không nhận được ảnh từ công cụ AI. Thử lại nhé.",
    "error.plan_parse_failed": "Bước đọc yêu cầu trả về kết quả lỗi. Thử lại nhé.",
    "error.capability_unsupported": "Nhà cung cấp hiện tại không hỗ trợ tính năng này.",
    "error.persistence_failed": "Không lưu được dữ liệu. Kiểm tra ổ đĩa rồi thử lại nhé.",
    "error.network": "Lỗi kết nối mạng. Kiểm tra mạng rồi thử lại nhé.",
    "error.cancelled": "Đã dừng tạo ảnh theo yêu cầu.",
    "error.unknown": "Có lỗi không rõ nguyên nhân. Thử lại nhé.",
    "error.action.retry": "Thử lại",
    "error.action.login": "Đăng nhập lại",
    "error.action.guide": "Xem hướng dẫn",
    "error.hintLogin": "Mở terminal, chạy lệnh “codex login”, đăng nhập ChatGPT rồi thử lại.",
    "error.hintGuide": "Xem README mục Codex CLI để cài đặt công cụ AI.",
    "error.resetAt": "hạn mức đặt lại: {time}",
    "error.invalidRequest": "Yêu cầu không hợp lệ — thử lại nhé.",
    "error.configMismatch": "Cấu hình nhà cung cấp chưa đúng (mock lẫn thật). Xem README phần cấu hình.",
    "quota.chip": "AI hôm nay: {image} ảnh · {planner} lượt đọc yêu cầu",
    "quota.limitHits": "{n} lần chạm hạn mức",
} as const;

export type I18nKey = keyof typeof en;
