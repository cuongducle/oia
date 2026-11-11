/** Detector geometry in the renderer contract. `box` is the padded placement
 *  box (post-unclip); `inkBox` is the tight pre-unclip kernel box whose ring
 *  sits on the line's own background, the reliable place to measure ink color. */
export interface DetectedTextLine {
  box: { x: number; y: number; w: number; h: number };
  inkBox: { x: number; y: number; w: number; h: number };
  angle: number;
  score: number;
}
export interface TextDetector {
  /** @returns text lines in reading order. */
  detect(input: { png: Uint8Array; signal: AbortSignal }): Promise<DetectedTextLine[]>;
}

