import { describe, it, expect, vi } from "vitest";
import type { Canvas } from "fabric";
vi.mock("fabric", () => {
  class Shape { [key:string]:unknown; constructor(options: object) { Object.assign(this,options); } }
  class Textbox extends Shape { constructor(text:string,options:object) { super({...options,text}); } }
  // mirrors the real class surface editor.ts touches at module scope (fabricV6OriginDefaults)
  const FabricObject = { ownDefaults: { originX: "center", originY: "center" }, customProperties: [] as string[] };
  return { Rect:Shape, Textbox, FabricObject };
});
import { addTextPreset, addShape, resizeCanvas, patchSelectedText, fabricV6OriginDefaults } from "../src/editor";
import { FabricObject } from "fabric";

function canvas() {
  return {getWidth:()=>450,getHeight:()=>600,getZoom:()=>0.5,add:vi.fn(),setActiveObject:vi.fn(),requestRenderAll:vi.fn(),fire:vi.fn(),setDimensions:vi.fn()} as unknown as Canvas;
}

describe("F4 follow-up — v6 origin defaults restored on the shared fabric class", () => {
  it("fabric 7 ships center/center; this codebase's whole corpus is authored left/top", () => {
    fabricV6OriginDefaults();
    expect(FabricObject.ownDefaults.originX).toBe("left");
    expect(FabricObject.ownDefaults.originY).toBe("top");
  });
});
describe("Zoom-independent editing and persistent properties", () => {
  it("positions text and shapes in document coordinates, not zoomed viewport pixels", () => {
    const c = canvas();
    expect(addTextPreset(c,"heading")).toMatchObject({left:135,top:480,width:630});
    expect(addShape(c,"rect")).toMatchObject({left:337.5,top:487.5,width:225,height:225});
  });
  it("resizing updates the serialized artboard and emits an undo/autosave event", () => {
    const c = canvas(), clip = {name:"clip",set:vi.fn()};
    c.getObjects = ()=>[clip] as never;
    resizeCanvas(c,1920,1080);
    expect(clip.set).toHaveBeenCalledWith({width:1920,height:1080});
    expect(c.fire).toHaveBeenCalledWith("object:modified",{target:clip});
  });
  it("text property edits participate in undo/autosave", () => {
    const c = canvas(), text = {type:"textbox",set:vi.fn()};
    c.getActiveObject = ()=>text as never;
    patchSelectedText(c,{fill:"#7050e5"});
    expect(text.set).toHaveBeenCalledWith("fill","#7050e5");
    expect(c.fire).toHaveBeenCalledWith("object:modified",{target:text});
  });
});
