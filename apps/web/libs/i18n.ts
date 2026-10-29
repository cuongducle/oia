"use client";

/**
 * BR-I18N — English first; add locales by appending a dictionary.
 * Rule: every dictionary MUST expose the same key set (enforced by tests); missing keys fall back to en.
 */
export const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "it", "ru", "hi", "id", "tr", "pl"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English", zh: "简体中文", ja: "日本語", ko: "한국어",
  es: "Español", fr: "Français", it: "Italiano", ru: "Русский", hi: "हिन्दी",
  id: "Bahasa Indonesia", tr: "Türkçe", pl: "Polski",
};

const dict = {
  en: {
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
    "quota.chip": "AI hôm nay: {image} ảnh · {planner} lượt đọc yêu cầu",
    "quota.limitHits": "{n} lần chạm hạn mức",
  },
  zh: {
    "nav.home": "首页",
    "nav.workspace": "工作区",
    "nav.brandkit": "品牌套件",
    "nav.toolbox": "工具箱",
    "nav.agents": "给 Agent",
    "home.hero": "实现你的创意",
    "home.sub": "用 AI 创建与编辑视觉作品 — 开源、自带密钥、图层编辑 (Fabric.js)。",
    "home.placeholder": "奶茶八折海报，粉彩风格…",
    "home.generate": "生成",
    "home.designing": "设计中…",
    "home.community": "社区",
    "home.brandkitHint": "创建品牌套件 →",
    "editor.untitled": "未命名项目",
    "editor.export": "导出",
    "editor.download": "下载",
    "editor.all": "全部",
    "editor.current": "当前页",
    "toolbox.title": "工具箱",
    "toolbox.aiSkills": "AI 技能",
    "toolbox.quickTools": "快捷工具",
    "agents.title": "给 Agent",
    "agents.newKey": "+ 新建密钥",
    "mode.toggle": "文字可即时修改",
    "mode.toggleHint": "背景图不带文字 — 文字内容生成后可直接编辑",
    "provider.mockBanner": "试用模式 — 占位图，非真实 AI 生成",
    "editor.stop": "停止",
    "error.provider_missing": "尚未安装 AI 工具（Codex CLI）。请安装后重试。",
    "error.not_logged_in": "Codex 尚未登录 ChatGPT。请先运行 “codex login” 再重试。",
    "error.quota_exceeded": "当前额度已用完。请等待额度重置后再试。",
    "error.rate_limited": "请求过于频繁。请稍后重试。",
    "error.content_refused": "内容因安全策略被拒绝。请修改描述后重试。",
    "error.timeout": "生成图片超时。请重试。",
    "error.format_drift": "AI 工具输出格式已变化 — 需要更新 Oia。",
    "error.no_output": "未收到 AI 图片。请重试。",
    "error.plan_parse_failed": "读取需求这一步返回了错误结果。请重试。",
    "error.capability_unsupported": "当前提供商不支持此功能。",
    "error.persistence_failed": "数据保存失败。请检查磁盘后重试。",
    "error.network": "网络连接出错。请检查网络后重试。",
    "error.cancelled": "已按请求停止生成。",
    "error.unknown": "发生未知错误。请重试。",
    "error.action.retry": "重试",
    "error.action.login": "重新登录",
    "error.action.guide": "查看指南",
    "error.hintLogin": "打开终端运行 “codex login”，登录 ChatGPT 后重试。",
    "error.hintGuide": "查看 README 的 Codex CLI 安装说明。",
    "error.resetAt": "额度重置：{time}",
    "quota.chip": "今日 AI：{image} 张图 · {planner} 次需求读取",
    "quota.limitHits": "{n} 次触及额度上限",
  },
} as const satisfies Record<"en" | "zh", Record<string, string>>;

export type I18nKey = keyof typeof dict.en;

/** Additional locales: core keys translated; the rest fall back to en. */
const partial: Record<string, Partial<Record<I18nKey, string>>> = {
  ja: {
    "nav.home": "ホーム", "nav.workspace": "ワークスペース", "nav.brandkit": "ブランドキット", "nav.toolbox": "ツールボックス", "nav.agents": "エージェント向け",
    "home.hero": "アイデアを形に", "home.sub": "AIでビジュアルを作成・編集 — オープンソース、BYOK、レイヤー編集。", "home.placeholder": "タピオカミルクティー2割引ポスター、パステル調…",
    "home.generate": "生成", "home.designing": "設計中…", "home.community": "コミュニティ", "home.brandkitHint": "ブランドキット作成 →",
    "editor.untitled": "無題のプロジェクト", "editor.export": "エクスポート", "editor.download": "ダウンロード", "editor.all": "すべて", "editor.current": "現在のページ",
    "toolbox.title": "ツールボックス", "toolbox.aiSkills": "AIスキル", "toolbox.quickTools": "クイックツール", "agents.title": "エージェント向け", "agents.newKey": "+ 新規キー",
  },
  ko: {
    "nav.home": "홈", "nav.workspace": "워크스페이스", "nav.brandkit": "브랜드 키트", "nav.toolbox": "툴박스", "nav.agents": "에이전트용",
    "home.hero": "아이디어를 실현", "home.sub": "AI로 시각 작품 생성·편집 — 오픈소스, BYOK, 레이어 편집.", "home.placeholder": "버블티 20% 할인 포스터, 파스텔 톤…",
    "home.generate": "생성", "home.designing": "디자인 중…", "home.community": "커뮤니티", "home.brandkitHint": "브랜드 키트 만들기 →",
    "editor.untitled": "제목 없는 프로젝트", "editor.export": "내보내기", "editor.download": "다운로드", "editor.all": "전체", "editor.current": "현재 페이지",
    "toolbox.title": "툴박스", "toolbox.aiSkills": "AI 스킬", "toolbox.quickTools": "빠른 도구", "agents.title": "에이전트용", "agents.newKey": "+ 새 키",
  },
  es: {
    "nav.home": "Inicio", "nav.workspace": "Espacio de trabajo", "nav.brandkit": "Kit de marca", "nav.toolbox": "Caja de herramientas", "nav.agents": "Para agentes",
    "home.hero": "Realiza tus ideas", "home.sub": "Crea y edita visuales con IA — código abierto, BYOK, edición por capas.", "home.placeholder": "Póster de bubble tea con 20% de descuento, estilo pastel…",
    "home.generate": "Generar", "home.designing": "Diseñando…", "home.community": "Comunidad", "home.brandkitHint": "crear kit de marca →",
    "editor.untitled": "Proyecto sin título", "editor.export": "Exportar", "editor.download": "Descargar", "editor.all": "TODO", "editor.current": "Página actual",
    "toolbox.title": "Caja de herramientas", "toolbox.aiSkills": "Habilidades IA", "toolbox.quickTools": "Herramientas rápidas", "agents.title": "Para agentes", "agents.newKey": "+ Nueva clave",
  },
  fr: {
    "nav.home": "Accueil", "nav.workspace": "Espace de travail", "nav.brandkit": "Kit de marque", "nav.toolbox": "Boîte à outils", "nav.agents": "Pour agents",
    "home.hero": "Réalisez vos idées", "home.sub": "Créez et éditez des visuels avec l'IA — open source, BYOK, édition par calques.", "home.placeholder": "Affiche bubble tea -20%, style pastel…",
    "home.generate": "Générer", "home.designing": "Création…", "home.community": "Communauté", "home.brandkitHint": "créer un kit de marque →",
    "editor.untitled": "Projet sans titre", "editor.export": "Exporter", "editor.download": "Télécharger", "editor.all": "TOUT", "editor.current": "Page actuelle",
    "toolbox.title": "Boîte à outils", "toolbox.aiSkills": "Compétences IA", "toolbox.quickTools": "Outils rapides", "agents.title": "Pour agents", "agents.newKey": "+ Nouvelle clé",
  },
  it: {
    "nav.home": "Home", "nav.workspace": "Area di lavoro", "nav.brandkit": "Kit brand", "nav.toolbox": "Cassetta strumenti", "nav.agents": "Per agenti",
    "home.hero": "Realizza le tue idee", "home.sub": "Crea e modifica visual con l'IA — open source, BYOK, editing a livelli.", "home.placeholder": "Locandina bubble tea -20%, stile pastello…",
    "home.generate": "Genera", "home.designing": "Progettazione…", "home.community": "Community", "home.brandkitHint": "crea kit brand →",
    "editor.untitled": "Progetto senza titolo", "editor.export": "Esporta", "editor.download": "Scarica", "editor.all": "TUTTE", "editor.current": "Pagina corrente",
    "toolbox.title": "Cassetta strumenti", "toolbox.aiSkills": "Skill IA", "toolbox.quickTools": "Strumenti rapidi", "agents.title": "Per agenti", "agents.newKey": "+ Nuova chiave",
  },
  ru: {
    "nav.home": "Главная", "nav.workspace": "Рабочая область", "nav.brandkit": "Бренд-кит", "nav.toolbox": "Инструменты", "nav.agents": "Для агентов",
    "home.hero": "Воплотите идеи", "home.sub": "Создавайте и редактируйте визуал с ИИ — open source, BYOK, послойное редактирование.", "home.placeholder": "Постер: бабл-ти со скидкой 20%, пастельные тона…",
    "home.generate": "Создать", "home.designing": "Дизайн…", "home.community": "Сообщество", "home.brandkitHint": "создать бренд-кит →",
    "editor.untitled": "Без названия", "editor.export": "Экспорт", "editor.download": "Скачать", "editor.all": "ВСЕ", "editor.current": "Текущая страница",
    "toolbox.title": "Инструменты", "toolbox.aiSkills": "AI-навыки", "toolbox.quickTools": "Быстрые инструменты", "agents.title": "Для агентов", "agents.newKey": "+ Новый ключ",
  },
  hi: {
    "nav.home": "होम", "nav.workspace": "वर्कस्पेस", "nav.brandkit": "ब्रांड किट", "nav.toolbox": "टूलबॉक्स", "nav.agents": "एजेंट के लिए",
    "home.hero": "अपने विचार साकार करें", "home.sub": "AI से विज़ुअल बनाएं और संपादित करें — ओपन सोर्स, BYOK, लेयर संपादन।", "home.placeholder": "बबल टी 20% छूट पोस्टर, पैस्टल स्टाइल…",
    "home.generate": "बनाएं", "home.designing": "डिज़ाइन हो रहा है…", "home.community": "समुदाय", "home.brandkitHint": "ब्रांड किट बनाएं →",
    "editor.untitled": "अनाम प्रोजेक्ट", "editor.export": "निर्यात", "editor.download": "डाउनलोड", "editor.all": "सभी", "editor.current": "वर्तमान पृष्ठ",
    "toolbox.title": "टूलबॉक्स", "toolbox.aiSkills": "AI स्किल", "toolbox.quickTools": "त्वरित टूल्स", "agents.title": "एजेंट के लिए", "agents.newKey": "+ नई कुंजी",
  },
  id: {
    "nav.home": "Beranda", "nav.workspace": "Ruang kerja", "nav.brandkit": "Kit merek", "nav.toolbox": "Kotak alat", "nav.agents": "Untuk agen",
    "home.hero": "Wujudkan ide Anda", "home.sub": "Buat & edit visual dengan AI — open source, BYOK, edit per layer.", "home.placeholder": "Poster bubble tea diskon 20%, gaya pastel…",
    "home.generate": "Buat", "home.designing": "Mendesain…", "home.community": "Komunitas", "home.brandkitHint": "buat kit merek →",
    "editor.untitled": "Proyek tanpa judul", "editor.export": "Ekspor", "editor.download": "Unduh", "editor.all": "SEMUA", "editor.current": "Halaman ini",
    "toolbox.title": "Kotak alat", "toolbox.aiSkills": "Skill AI", "toolbox.quickTools": "Alat cepat", "agents.title": "Untuk agen", "agents.newKey": "+ Kunci baru",
  },
  tr: {
    "nav.home": "Ana sayfa", "nav.workspace": "Çalışma alanı", "nav.brandkit": "Marka kiti", "nav.toolbox": "Araç kutusu", "nav.agents": "Ajanlar için",
    "home.hero": "Fikirlerini gerçeğe dönüştür", "home.sub": "AI ile görsel oluştur ve düzenle — açık kaynak, BYOK, katman düzenleme.", "home.placeholder": "Bubble tea %20 indirim afişi, pastel tarz…",
    "home.generate": "Oluştur", "home.designing": "Tasarlanıyor…", "home.community": "Topluluk", "home.brandkitHint": "marka kiti oluştur →",
    "editor.untitled": "Adsız proje", "editor.export": "Dışa aktar", "editor.download": "İndir", "editor.all": "TÜMÜ", "editor.current": "Geçerli sayfa",
    "toolbox.title": "Araç kutusu", "toolbox.aiSkills": "AI becerileri", "toolbox.quickTools": "Hızlı araçlar", "agents.title": "Ajanlar için", "agents.newKey": "+ Yeni anahtar",
  },
  pl: {
    "nav.home": "Strona główna", "nav.workspace": "Obszar roboczy", "nav.brandkit": "Zestaw marki", "nav.toolbox": "Przybornik", "nav.agents": "Dla agentów",
    "home.hero": "Zrealizuj swoje pomysły", "home.sub": "Twórz i edytuj grafikę z AI — open source, BYOK, edycja warstwowa.", "home.placeholder": "Plakat: bubble tea -20%, w stylu pastelowym…",
    "home.generate": "Generuj", "home.designing": "Projektowanie…", "home.community": "Społeczność", "home.brandkitHint": "utwórz zestaw marki →",
    "editor.untitled": "Projekt bez nazwy", "editor.export": "Eksportuj", "editor.download": "Pobierz", "editor.all": "WSZYSTKIE", "editor.current": "Bieżąca strona",
    "toolbox.title": "Przybornik", "toolbox.aiSkills": "Umiejętności AI", "toolbox.quickTools": "Szybkie narzędzia", "agents.title": "Dla agentów", "agents.newKey": "+ Nowy klucz",
  },
};

export function t(locale: Locale, key: I18nKey): string {
  const base = dict[locale as "en" | "zh"] ?? undefined;
  return base?.[key] ?? partial[locale as string]?.[key] ?? dict.en[key] ?? key;
}

/** How many keys a locale actually translates (structural test). */
export function translatedKeyCount(locale: Locale): number {
  const base = dict[locale as "en" | "zh"];
  if (base) return Object.keys(base).length;
  return Object.keys(partial[locale] ?? {}).length;
}

export function detectLocale(input: string | null | undefined): Locale {
  const l = (input ?? "").toLowerCase();
  const map: [string, Locale][] = [
    ["zh", "zh"], ["ja", "ja"], ["ko", "ko"], ["es", "es"], ["fr", "fr"],
    ["it", "it"], ["ru", "ru"], ["hi", "hi"], ["id", "id"], ["tr", "tr"], ["pl", "pl"],
  ];
  for (const [prefix, loc] of map) if (l.startsWith(prefix)) return loc;
  return "en";
}
