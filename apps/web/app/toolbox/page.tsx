"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileImage, Scissors, Languages, ArrowRight } from "lucide-react";
import { QUICK_TOOLS } from "@/libs/tools-registry";
import { STUDIO_TEMPLATES } from "@/libs/studio-templates";
import { ScenePreview } from "@/components/ScenePreview";

const AI_TOOLS = [
  { name:"Presentation Creator", desc:"Turn a topic or outline into a presentation worth sharing.", href:"/skills/pixforge-generate-presentation", kind:"slides" },
  { name:"XHS Creator", desc:"Create a cohesive vertical carousel for Xiaohongshu/RED.", href:"/tools/xhs-creator", kind:"social" },
  { name:"Background Remover", desc:"Isolate your subject with a transparent background, ready for your next design.", href:"/skills/pixforge-remove-background", kind:"background" },
  { name:"Image Translator", desc:"Translate the words in an image while preserving its layout.", href:"/skills/pixforge-image-translate", kind:"translate" },
  { name:"PPT Translator", desc:"Translate an entire PowerPoint into the language you need.", href:"/tools/ppt-translator", kind:"ppt", soon:true },
];
function Preview({kind}:{kind:string}) {
  if(kind==="slides" || kind==="ppt") return <div className="toolPreview" style={{background:kind==="ppt"?"#f2ede5":"#eeeaf6"}}><div className="miniSlide"><small>{kind==="ppt"?"TRANSLATE YOUR IDEAS":"YOUR NEXT PRESENTATION"}</small>A clearer<br/>perspective.</div>{kind==="ppt" && <Languages size={24} color="#8d7863"/>}</div>;
  if(kind==="social") return <div className="toolPreview" style={{background:"#eee5de"}}>{STUDIO_TEMPLATES.slice(0,2).map(t=><div className="miniPoster" key={t.id}><ScenePreview scene={t.scene} label={t.name}/></div>)}</div>;
  if(kind==="background") return <div className="toolPreview" style={{background:"#edf0e9"}}><div style={{width:94,height:115,overflow:"hidden",borderRadius:7}}><img src="/studio/botanical.webp" alt="Original product image" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div><Scissors size={21} color="#7a8871"/><div className="checker" style={{borderRadius:7,width:94,height:115,display:"grid",placeItems:"center"}}><FileImage size={34} color="#7a8871"/></div></div>;
  return <div className="toolPreview" style={{background:"#eaf0f6"}}><div style={{padding:15,border:"1px solid #d5dee9",background:"white",borderRadius:8,fontSize:17,color:"#4b6683"}}>Hello.</div><ArrowRight size={18} color="#69829e"/><div style={{padding:15,border:"1px solid #d5dee9",background:"white",borderRadius:8,fontSize:17,color:"#4b6683"}}>Bonjour.</div></div>;
}
export default function Toolbox() {
  const [tab,setTab]=useState<"ai"|"quick">("ai");
  return <main className="stub">
    <header className="sectionHeading"><div><h1>Toolbox</h1><p>The right tool for every part of your creative process.</p></div></header>
    <div className="tabs" aria-label="Tool category"><button className={`tabBtn ${tab==="ai"?"active":""}`} aria-pressed={tab==="ai"} onClick={()=>setTab("ai")}>AI skills</button><button className={`tabBtn ${tab==="quick"?"active":""}`} aria-pressed={tab==="quick"} onClick={()=>setTab("quick")}>Quick tools</button></div>
    {tab==="ai" ? <>
      {[{title:"Create something new",tools:AI_TOOLS.slice(0,2),generation:true},{title:"Refine & translate",tools:AI_TOOLS.slice(2),generation:false}].map(group=><section key={group.title} className="toolSection"><h2>{group.title}</h2><div className={`toolGrid ${group.generation?"generation":""}`}>{group.tools.map(t=><Link href={t.href} className="toolCard" key={t.name}><Preview kind={t.kind}/><div className="toolCardBody"><h3>{t.name}{"soon" in t && t.soon?<span className="availability">Coming soon</span>:<ArrowUpRight size={14}/>}</h3><p>{t.desc}</p></div></Link>)}</div></section>)}
    </> : <>{(["Converter","Image Editor","Creative AI","Image Generator"] as const).map((cat,i)=><section key={cat} className="toolSection"><h2>{["File converters","Image editing","Creative AI","Images & charts"][i]}</h2><div className="toolGrid">{QUICK_TOOLS.filter(t=>t.category===cat).map(t=><Link key={t.slug} href={`/tools/${t.slug}`} className="toolCard"><div className="toolCardBody"><h3>{t.name}{!t.implemented?<span className="availability">Coming soon</span>:<ArrowUpRight size={14}/>}</h3><p>{t.desc}</p></div></Link>)}</div></section>)}</>}
  </main>;
}
