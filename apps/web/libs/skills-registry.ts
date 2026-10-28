/**
 * BR-SKL — skills registry for /skills/[slug]; MUST match packages/skills/skills/pixforge-*
 * (a test scans the filesystem to catch drift). Descriptions = condensed frontmatter.
 */
export interface SkillInfo {
  slug: string;          // pixforge-<name>
  name: string;
  desc: string;
  usage: string;
}

const EXTRA: SkillInfo[] = [
  { slug: "pixforge-generate-logo", name: "Logo Generator", desc: "Generate brand logo concepts from a name + vibe.", usage: 'node scripts/task.mjs --prompt "pastel tea brand"' },
  { slug: "pixforge-generate-xhs", name: "Xiaohongshu Carousel", desc: "Generate RED vertical carousel set (cover + pages).", usage: "node scripts/task.mjs --prompt 'coffee shop opening' --count 4" },
  { slug: "pixforge-generate-illustrations", name: "Article Illustrations", desc: "Generate 16:9 editorial illustrations for articles.", usage: 'node scripts/task.mjs --prompt "remote work"' },
  { slug: "pixforge-generate-storyboard", name: "Film Storyboard", desc: "Generate storyboard frames from a scene description.", usage: "node scripts/task.mjs --prompt 'chase scene at market' --count 6" },
  { slug: "pixforge-ppt-translate", name: "PPT Translator", desc: "Translate all text in a PPTX into a target language.", usage: "node scripts/task.mjs --file-url https://x --language en" },
  { slug: "pixforge-generate-photo-poetic-editorial", name: "Photo-poetic Editorial", desc: "Photo-poetic editorial artwork from an image.", usage: "node scripts/task.mjs --file-url https://x" },
  { slug: "pixforge-generate-restaged-cinematic", name: "Restaged Cinematic", desc: "Restaged cinematic artwork from an image.", usage: "node scripts/task.mjs --file-url https://x" },
  { slug: "pixforge-query-task", name: "Query Task", desc: "Check async task status by taskId.", usage: "node scripts/task.mjs --task-id task_abc123" },
  { slug: "pixforge-upload", name: "Upload File", desc: "Upload local file, return a public URL.", usage: "node scripts/task.mjs ./logo.png" },
];

export const SKILLS: SkillInfo[] = [
  {
    slug: "pixforge-generate-poster",
    name: "Poster Generator",
    desc: "Generate an event/promo poster, returning a PNG download URL.",
    usage: 'node scripts/generate_poster.mjs --prompt "coffee poster, 20% off" --language en',
  },
  {
    slug: "pixforge-generate-presentation",
    name: "Presentation Creator",
    desc: "Generate a PPTX deck from a topic or outline, returning a download URL.",
    usage: 'node scripts/generate_presentation.mjs --prompt "Q3 review" --n 8 --language en',
  },
  {
    slug: "pixforge-remove-background",
    name: "Background Remover",
    desc: "Remove image background, returning a transparent PNG URL.",
    usage: "node scripts/remove_background.mjs ./photo.jpg",
  },
  {
    slug: "pixforge-image-edit",
    name: "AI Image Editor",
    desc: "Edit an image (inpainting-style) with a prompt, returning a PNG URL.",
    usage: 'node scripts/image_edit.mjs --prompt "make the awning blue" --reference https://…',
  },
  {
    slug: "pixforge-image-translate",
    name: "Image Translator",
    desc: "Translate text inside images while keeping the design.",
    usage: "node scripts/image_translate.mjs --url https://… --language en",
  },
  {
    slug: "pixforge-setup",
    name: "Setup Check",
    desc: "Pre-flight check PIXFORGE_API_KEY and PIXFORGE_BASE_URL.",
    usage: "node scripts/check_env.mjs",
  },
  ...EXTRA,
];

export function getSkill(slug: string): SkillInfo | undefined {
  return SKILLS.find((s) => s.slug === slug);
}
export const AI_SKILLS_IN_TOOLBOX = ["pixforge-generate-presentation", "pixforge-remove-background", "pixforge-image-translate"];
