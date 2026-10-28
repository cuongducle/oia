"use client";

import { useEffect, useState } from "react";
import { Plus, X, Trash2, Palette, Save, Upload, ArrowRight } from "lucide-react";
import type { BrandKit } from "@pixforge/schema";
import Link from "next/link";

export default function BrandKitPage(){
  const [kits,setKits]=useState<BrandKit[]>([]),[id,setId]=useState<string|undefined>();
  const [name,setName]=useState("Untitled brand kit"),[guidance,setGuidance]=useState("");
  const [colors,setColors]=useState<string[]>([]),[fonts,setFonts]=useState<string[]>([]),[logos,setLogos]=useState<string[]>([]);
  const [apply,setApply]=useState(false),[color,setColor]=useState("#7050e5"),[font,setFont]=useState("");
  const [notes,setNotes]=useState(""),[busy,setBusy]=useState(false),[msg,setMsg]=useState("");
  useEffect(()=>{void refresh().catch(()=>setMsg("Could not load your brand kits."));},[]);
  async function refresh(){const j=await(await fetch("/api/brandkit")).json();if(j.code===0)setKits(j.data);}
  function select(k?:BrandKit){setId(k?.id);setName(k?.name??"Untitled brand kit");setGuidance(k?.guidance??"");setColors(k?.colors??[]);setFonts(k?.fonts??[]);setLogos(k?.logos??[]);setApply(k?.applyByDefault??false);setMsg("");}
  async function save(){
    setBusy(true);setMsg("");try{
      const j=await(await fetch("/api/brandkit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,name,guidance,colors,fonts,logos,applyByDefault:apply})})).json();
      if(j.code!==0)throw new Error(j.msg);setId(j.data.id);setMsg("Brand kit saved.");await refresh();
    }catch(e){setMsg(e instanceof Error?e.message:"Could not save the brand kit.");}finally{setBusy(false);}
  }
  async function remove(){if(!id||!confirm(`Delete brand kit “${name}”?`))return;setBusy(true);try{const res=await fetch(`/api/brandkit?id=${id}`,{method:"DELETE"});if(!res.ok)throw new Error();select();await refresh();}catch{setMsg("Could not delete the brand kit.");}finally{setBusy(false);}}
  async function upload(file:File){setBusy(true);try{const fd=new FormData();fd.set("file",file);const j=await(await fetch("/api/upload/direct",{method:"POST",body:fd})).json();if(j.code!==0)throw new Error();setLogos(l=>l.length<3?[...l,j.data.url]:l);}catch{setMsg("Could not upload the logo.");}finally{setBusy(false);}}
  async function extract(){setBusy(true);setMsg("");try{const j=await(await fetch("/api/brandkit/extract",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({notes})})).json();if(j.code!==0)throw new Error(j.msg);setName(j.data.name);setGuidance(j.data.guidance);setColors(j.data.colors);setFonts(j.data.fonts);setLogos(j.data.logos??[]);setMsg("Brand details extracted. Review them before saving.");}catch{setMsg("Could not extract brand details. Check your AI provider settings.");}finally{setBusy(false);}}
  return <main className="stub">
    <header className="sectionHeading"><div><h1>Brand kit</h1><p>Your identity, consistently expressed.</p></div><button className="secondaryBtn" onClick={()=>select()}><Plus size={15}/>New brand kit</button></header>
    <div className="kitLayout">
      <nav className="kitList" aria-label="Saved brand kits">{kits.map(k=><button key={k.id} className={`kitListItem ${id===k.id?"active":""}`} onClick={()=>select(k)} aria-pressed={id===k.id}><span style={{display:"flex",gap:8,alignItems:"center"}}><Palette size={14}/>{k.name}</span><div className="kitSwatches">{k.colors.slice(0,5).map(c=><span key={c} style={{background:c}}/>)}</div>{k.applyByDefault&&<small className="hintP">Default</small>}</button>)}{kits.length===0&&<p className="hintP">Your saved brand kits will appear here.</p>}<button className={`kitListItem ${!id?"active":""}`} onClick={()=>select()}><Plus size={14}/> Create a brand kit</button></nav>
      <section className="surface kitFields" aria-label="Brand kit details">
        <div className="sectionHeading" style={{margin:0}}><input className="kitTitleInput" value={name} onChange={e=>setName(e.target.value)} aria-label="Brand kit name"/><label className="switchRow"><button role="switch" aria-label="Apply by default" aria-checked={apply} className={`switch ${apply?"on":""}`} onClick={()=>setApply(!apply)}/><span>Default</span></label></div>
        <label className="field">Design guidance<textarea value={guidance} onChange={e=>setGuidance(e.target.value)} maxLength={2000} rows={4} placeholder="Style, voice, layout, and things to avoid…"/><small>{guidance.length.toLocaleString("en-US")} / 2,000 characters · Your assistant uses this as creative direction.</small></label>
        <div className="formSection"><h3>Logo <small>Up to 3 logos</small></h3><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{logos.map((u,i)=><div key={u} style={{position:"relative",width:78,height:78,border:"1px solid var(--line)",borderRadius:10,padding:8}}><img src={u} alt={`Logo ${i+1}`} style={{width:"100%",height:"100%",objectFit:"contain"}}/><button className="iconBtn" style={{position:"absolute",top:-8,right:-8,minWidth:24,minHeight:24,padding:4,background:"#fff",border:"1px solid var(--line)"}} aria-label={`Remove logo ${i+1}`} onClick={()=>setLogos(l=>l.filter(x=>x!==u))}><X size={12}/></button></div>)}{logos.length<3&&<label className="logoUpload"><Upload size={20}/><input aria-label="Upload logo" type="file" accept="image/*" hidden disabled={busy} onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/></label>}</div></div>
        <div className="formSection"><h3>Brand colors <small>Up to 10 colors</small></h3><div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>{colors.map(c=><button key={c} aria-label={`Remove color ${c}`} title={`Remove ${c}`} onClick={()=>setColors(colors.filter(x=>x!==c))} style={{background:c,width:34,height:34,borderRadius:8,border:"1px solid #0002"}}/>)}{colors.length<10&&<><input aria-label="Choose a color" type="color" value={color} onChange={e=>setColor(e.target.value)} style={{width:38,height:36,padding:3}}/><button className="secondaryBtn" onClick={()=>{if(!colors.includes(color))setColors([...colors,color]);}}><Plus size={14}/>Add color</button></>}</div></div>
        <div className="formSection"><h3>Typography <small>Up to 10 fonts</small></h3><div style={{display:"flex",gap:8}}><input aria-label="Font name" style={{flex:1}} value={font} placeholder="e.g. Be Vietnam Pro" onChange={e=>setFont(e.target.value)}/><button className="secondaryBtn" aria-label="Add font" disabled={fonts.length>=10||!font.trim()} onClick={()=>{if(!fonts.includes(font.trim()))setFonts([...fonts,font.trim()]);setFont("");}}><Plus size={16}/></button></div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>{fonts.map(f=><button className="chip" key={f} onClick={()=>setFonts(fonts.filter(x=>x!==f))} aria-label={`Remove font ${f}`}>{f}<X size={12}/></button>)}</div></div>
        <details className="extractPanel"><summary>Start with a brand description</summary><p className="hintP" style={{marginTop:8}}>Paste your brand guidelines. AI can suggest colors, fonts, and creative direction.</p><textarea aria-label="Brand description to extract" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Brand name, audience, style…"/><button className="secondaryBtn" style={{marginTop:10}} disabled={busy||!notes.trim()} onClick={extract}>Extract details <ArrowRight size={14}/></button></details>
        <div style={{display:"flex",alignItems:"center",gap:10}}><button className="primaryBtn" onClick={save} disabled={busy||!name.trim()}><Save size={14}/>{busy?"Saving…":"Save brand kit"}</button>{id&&<><Link className="secondaryBtn" href={`/?brandKit=${id}`}>Design with this kit <ArrowRight size={14}/></Link><button className="iconBtn" disabled={busy} onClick={remove} aria-label="Delete brand kit"><Trash2 size={16}/></button></>}</div>
        {msg&&<p className="notice" role="status" style={{margin:0}}>{msg}</p>}
      </section>
    </div>
  </main>;
}
