import { notFound } from "next/navigation";
import Link from "next/link";
import { SKILLS, getSkill } from "@/libs/skills-registry";

export function generateStaticParams() {
  return SKILLS.map((s) => ({ slug: s.slug }));
}

export default async function SkillLanding({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const skill = getSkill(slug);
  if (!skill) notFound();
  return (
    <main className="stub" style={{ maxWidth: 720 }}>
      <p className="hintP"><Link href="/toolbox">← Toolbox</Link></p>
      <h1>{skill.name}</h1>
      <p style={{ fontSize: 16 }}>{skill.desc}</p>
      <h3 style={{ marginTop: 24 }}>Use with your agent (SKILL.md)</h3>
      <pre style={{ background: "#18181b", color: "#f4f4f5", padding: 16, borderRadius: 12, overflowX: "auto", fontSize: 13 }}>
{`# Install the skill (e.g. Claude Code)
cp -r packages/skills/skills/${skill.slug} ~/.claude/skills/

# Configure
export OIA_BASE_URL=https://your-oia.example/api
export OIA_API_KEY=pf-…

# Run
${skill.usage}`}</pre>
      <p className="hintP" style={{ marginTop: 12 }}>You can also create designs in the web app without installing an agent skill.</p>
      <Link href="/" className="primaryBtn" style={{ display: "inline-block", marginTop: 16, textDecoration: "none", padding: "10px 18px" }}>Try it in the studio →</Link>
    </main>
  );
}
