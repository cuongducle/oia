// D22: keep recorded replay imports working; product code uses domain modules directly.
export { readDeconstructPng } from "./deconstruct/source-image.js";
export { refineTextRegions } from "./deconstruct/ink-regions.js";
export { kernelInkColor, sampleTextColors } from "./deconstruct/ink-color.js";
export { retainedTextRegions } from "./deconstruct/retained-ink.js";
export { prepareDeconstructRegions, mergeEraseRegions } from "./deconstruct/text-layout.js";
export { composeTextPlate, localTextPlate, repairRetainedRegions } from "./deconstruct/background-plate.js";
