import { describe, it, expect, vi } from "vitest";
import type { Canvas } from "fabric";
vi.mock("fabric", () => {
  class Shape { [key:string]:unknown; constructor(options: object) { Object.assign(this,options); } }
  class Textbox extends Shape { constructor(text:string,options:object) { super({...options,text}); } }
  return { Rect:Shape, Textbox };
});
import { addTextPreset, addShape, resizeCanvas, patchSelectedText } from "../src/editor";
function canvas() {
  return {getWidth:()=>450,getHeight:()=>600,getZoom:()=>0.5,add:vi.fn(),setActiveObject:vi.fn(),requestRenderAll:vi.fn(),fire:vi.fn(),setDimensions:vi.fn()} as unknown as Canvas;
}
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
