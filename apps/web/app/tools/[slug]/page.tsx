import { notFound } from "next/navigation";
import Link from "next/link";
import { getTool } from "@/libs/tools-registry";
import { ToolRunner } from "./runner";

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  return (
    <main className="stub" style={{ maxWidth: 720 }}>
      <p className="hintP"><Link href="/toolbox">← Toolbox</Link></p>
      <h1>{tool.name}</h1>
      <p style={{ fontSize: 15 }}>{tool.desc}</p>
      <ToolRunner kind={tool.kind} slug={tool.slug} />
      {!tool.implemented && (
        <p className="hintP" style={{ marginTop: 16 }}>This tool is coming soon. Available now: PNG to JPG, JPG to PDF, Image Resizer, and Bar/Pie Charts.</p>
      )}
    </main>
  );
}
