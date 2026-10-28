import { describe, it, expect } from "vitest";
import { sceneSize } from "../libs/studio-ui";
describe("Artboard dimensions survive page switches and reloads", () => {
  it("prefers the named artboard over arbitrary rectangles", () => {
    expect(sceneSize({objects:[{type:"Rect",width:30,height:40},{type:"rect",name:"clip",width:1920,height:1080}]})).toEqual({width:1920,height:1080});
  });
  it("supports older scenes without a name and safely handles invalid dimensions", () => {
    expect(sceneSize({objects:[{type:"Rect",width:900,height:1200}]})).toEqual({width:900,height:1200});
    expect(sceneSize({objects:[{name:"clip",width:0,height:NaN}]})).toEqual({width:1360,height:2048});
  });
});
