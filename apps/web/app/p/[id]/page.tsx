import { notFound } from "next/navigation";
import { getRuntime } from "@/libs/runtime";
import { ScenePreview } from "@/components/ScenePreview";
export const dynamic = "force-dynamic";
export default async function SharedProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { projects } = await getRuntime();
  const project = projects.get(id);
  if (!project) notFound();
  return <main className="stub" style={{maxWidth:860}}><div className="sectionHeading"><h1>{project.name}</h1><span className="wordmark" style={{fontSize:20}}>O<span>ia</span></span></div><p className="hintP">Shared project · Read only</p>{project.pages.map((page,i)=><section key={page.id} style={{marginTop:24}}><p className="hintP">Page {i+1} of {project.pages.length}</p><div style={{aspectRatio:`${page.width}/${page.height}`,background:"white",border:"1px solid var(--line)",boxShadow:"var(--shadow)"}}><ScenePreview scene={page.canvas} label={`${project.name}, page ${i+1}`}/></div></section>)}</main>;
}
