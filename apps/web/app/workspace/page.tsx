"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Upload, Search, FolderOpen, MessageSquare, ArrowUpRight } from "lucide-react";
import type { Project } from "@pixforge/schema";
import { ScenePreview } from "@/components/ScenePreview";

interface ChatRow { id:number; name:string; updatedAt:number }
export default function Workspace() {
  const router=useRouter();
  const [chats,setChats]=useState<ChatRow[]>([]),[projects,setProjects]=useState<Project[]>([]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [query,setQuery]=useState("");
  useEffect(()=>{
    const ctrl=new AbortController();
    void Promise.all([fetch("/api/chat/sessions",{signal:ctrl.signal}).then(r=>r.json()),fetch("/api/projects",{signal:ctrl.signal}).then(r=>r.json())]).then(([c,p])=>{
      if(c.code===0)setChats(c.data); if(p.code===0)setProjects(p.data);
    }).catch(e=>{if(e.name!=="AbortError")setError("Could not load your workspace. Please reload the page.");}).finally(()=>setLoading(false));
    return ()=>ctrl.abort();
  },[]);
  async function create(file?:File) {
    setBusy(true);setError("");
    try {
      let body:Record<string,unknown>={};
      if(file){
        const fd=new FormData();fd.set("file",file);
        const up=await(await fetch("/api/upload/direct",{method:"POST",body:fd})).json();
        if(up.code!==0)throw new Error("Could not upload the image.");
        body={name:file.name,scene:{version:"6.9.1",objects:[{type:"Rect",name:"clip",left:0,top:0,width:1360,height:2048,fill:"white",selectable:false},{type:"Image",left:0,top:0,width:1360,height:2048,src:up.data.url,crossOrigin:"anonymous",selectable:true}]}};
      }
      const j=await(await fetch("/api/projects",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})).json();
      if(j.code!==0)throw new Error(j.msg);router.push(`/editor?id=${j.data.id}`);
    }catch(e){setError(e instanceof Error?e.message:"Could not create the project.");}finally{setBusy(false);}
  }
  const matches=(name:string)=>name.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"));
  const visibleProjects=projects.filter(p=>matches(p.name)),visibleChats=chats.filter(c=>matches(c.name));
  return <main className="stub">
    <header className="sectionHeading"><div><h1>Workspace</h1><p>Pick up where inspiration left off.</p></div><div className="workspaceActions"><label className="secondaryBtn"><Upload size={14}/>Import image<input type="file" aria-label="Import image" accept="image/*" hidden disabled={busy} onChange={e=>e.target.files?.[0]&&create(e.target.files[0])}/></label><button className="primaryBtn" disabled={busy} onClick={()=>create()}><Plus size={16}/>{busy?"Creating…":"New project"}</button></div></header>
    <label className="searchField"><Search size={15}/><input aria-label="Search projects and conversations" placeholder="Search your workspace…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {error&&<p className="notice error" role="alert">{error}</p>}
    {loading?<p role="status" className="hintP" style={{marginTop:28}}>Loading your workspace…</p>:<>
      <section style={{marginTop:32}}><div className="sectionHeading"><h2>Your projects</h2><span className="hintP">{visibleProjects.length} {visibleProjects.length===1?"project":"projects"}</span></div>
        <div className="projectGrid">{visibleProjects.map(p=><article key={p.id}><Link href={`/editor?id=${p.id}`} className="projectPreview" aria-label={`Open ${p.name}`}>{p.pages[0]&&<ScenePreview scene={p.pages[0].canvas} label={p.name}/>}</Link><div className="projectMeta"><div><strong>{p.name}</strong><small>{timeAgo(p.updatedAt??Date.now())} · {p.pages.length} {p.pages.length===1?"page":"pages"}</small></div><Link href={`/p/${p.id}`} className="iconBtn" aria-label={`View shared project ${p.name}`}><ArrowUpRight size={16}/></Link></div></article>)}</div>
        {visibleProjects.length===0&&<div className="emptyState"><FolderOpen size={30} strokeWidth={1.2}/><h3>{query?"No projects found":"Room for your first idea"}</h3><p>{query?"Try a different search.":"Create something new or start with a template."}</p><Link className="secondaryBtn" href="/">Explore templates <ArrowUpRight size={14}/></Link></div>}
      </section>
      <section style={{marginTop:36}}><div className="sectionHeading"><h2>Recent conversations</h2><MessageSquare size={17} color="var(--muted)"/></div><div className="chatGrid">{visibleChats.map(c=><Link key={c.id} href={`/?session=${c.id}`} className="chatCard"><strong>{c.name}</strong><span>{timeAgo(c.updatedAt)}</span></Link>)}</div>{visibleChats.length===0&&<p className="hintP">{query?"No matching conversations.":"Your conversations with the assistant will appear here."}</p>}</section>
    </>}
  </main>;
}
function timeAgo(ts:number){const m=Math.max(0,Math.floor((Date.now()-ts)/60000));if(m<1)return"Just now";if(m<60)return`${m} min ago`;const h=Math.floor(m/60);return h<24?`${h} hr ago`:`${Math.floor(h/24)} days ago`;}
