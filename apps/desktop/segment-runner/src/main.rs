//! oia-segment-runner: the SAM 3 sidecar (segmentation-process-plan.md, option A).
//!
//! WHY A SEPARATE PROCESS: in every Electron-linked process on macOS, malloc
//! goes through Chromium's PartitionAlloc zone shim, which kills the GB-scale
//! aligned allocations ONNX Runtime's CPU EP needs at 1008px vision encode
//! (SIGTRAP, surfaced to the seller as "exit code 5"). A plain native process
//! has a real system malloc and runs the same graphs fine. The runner is
//! deliberately THIN: BPE tokenization, image preprocessing and mask
//! postprocessing stay in TypeScript in the utility process; only the three
//! ORT session runs live here.
//!
//! Protocol: one JSON request per line on stdin, one JSON response per line on
//! stdout, binary payloads base64 of little-endian f32/i64. stderr = logs.
//! The parent (utility process) owns our lifecycle: closed stdin or a kill
//! signal ends us. The ORT shared library is loaded DYNAMICALLY via
//! ORT_DYLIB_PATH so we execute the exact libonnxruntime the app pins (copied
//! from onnxruntime-node at prepare time), not some bundled copy.
//!
//! Vision outputs stay IN the runner, keyed by the engine's image content
//! hash (LRU 2, mirroring engine.ts): the decoder reads them by key, so the
//! GB-scale FPN tensors never cross the pipe. Only preprocessed pixels in
//! (~12 MB) and mask tensors out (~10 MB) are serialized.
//!
//! The name wiring below MIRRORS engine.ts: vision outputs [0],[1],[2],[6]
//! are fpn_hidden_state_0/1/2 + fpn_position_encoding_2, text output[0] is
//! text_features, decoder outputs are pred_masks/pred_boxes/pred_logits.
//! Keep the two in sync when either changes.

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use ort::environment::Environment;
use ort::session::{builder::GraphOptimizationLevel, Session, SessionInputValue, SessionOutputs};
use ort::value::{Tensor, TensorValueType};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::Path;

#[derive(Deserialize)]
struct TensorIn {
    dims: Vec<usize>,
    data: String,
}

#[derive(Serialize)]
struct TensorOut {
    dims: Vec<usize>,
    dtype: &'static str,
    data: String,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
enum Req {
    Ping,
    Vision { models_dir: String, key: String, pixels: TensorIn },
    Text { models_dir: String, input_ids: Vec<i64>, attn: Vec<i64> },
    Decode { models_dir: String, vision_key: String, text_features: TensorIn, attn: Vec<i64> },
    /** D22 Lens font classifier: input "image" [1,3,128,384], output "logits".
     *  Preprocess/ranking stay in TS (lens.ts); only the session run is here. */
    Lens { lens_dir: String, pixels: TensorIn },
}

#[derive(Serialize)]
#[serde(tag = "op")]
enum Resp {
    #[serde(rename = "pong")]
    Pong,
    #[serde(rename = "vision")]
    Vision { key: String },
    #[serde(rename = "text")]
    Text { text_features: TensorOut },
    #[serde(rename = "decode")]
    Decode { masks: TensorOut, boxes: TensorOut, logits: TensorOut },
    #[serde(rename = "lens")]
    Lens { logits: TensorOut },
    #[serde(rename = "error")]
    Error { message: String },
}

struct Models {
    vision: Session,
    text: Session,
    decoder: Session,
}

impl Models {
    fn load(env: &Environment, dir: &str) -> Result<Models, String> {
        let build = |n: &str| -> Result<Session, String> {
            Session::builder(env)
                .map_err(|e| format!("builder: {e}"))?
                .with_optimization_level(GraphOptimizationLevel::Level3)
                .map_err(|e| format!("opt level: {e}"))?
                .commit_from_file(Path::new(dir).join(n))
                .map_err(|e| format!("load {n}: {e}"))
        };
        Ok(Models {
            vision: build("vision_encoder_int8.onnx")?,
            text: build("text_encoder_int8.onnx")?,
            decoder: build("decoder_int8.onnx")?,
        })
    }
}

fn decode_f32_payload(t: &TensorIn) -> Result<Tensor<f32>, String> {
    let bytes = B64.decode(t.data.as_bytes()).map_err(|e| format!("base64: {e}"))?;
    let n: usize = t.dims.iter().product();
    if bytes.len() != n * 4 {
        return Err(format!("payload is {} bytes, dims need {}", bytes.len(), n * 4));
    }
    let floats: Vec<f32> = bytes.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    Tensor::from_array((t.dims.clone(), floats)).map_err(|e| format!("tensor: {e}"))
}

fn tensor_out_f32(t: &Tensor<f32>) -> TensorOut {
    let (shape, data) = t.extract_tensor();
    let bytes: Vec<u8> = data.iter().flat_map(|x| x.to_le_bytes()).collect();
    let dims: Vec<usize> = shape.iter().map(|d| *d as usize).collect();
    TensorOut { dims, dtype: "f32", data: B64.encode(bytes) }
}

/** take an owned output out of SessionOutputs as a typed f32 tensor */
fn take_f32(outputs: &mut SessionOutputs, name: &str) -> Result<Tensor<f32>, String> {
    let Some(v) = outputs.remove(name) else {
        return Err(format!("output {name} missing"));
    };
    v.downcast::<TensorValueType<f32>>().map_err(|e| format!("output {name} not f32: {e}"))
}

struct State {
    env: Environment,
    models_dir: Option<String>,
    models: Option<Models>,
    lens: Option<(String, Session)>,
    /** the four decoder-facing vision outputs per engine content-hash, LRU 2 like engine.ts */
    vision_cache: HashMap<String, Vec<Tensor<f32>>>,
    vision_order: Vec<String>,
}

fn ensure_models(state: &mut State, dir: &str) -> Result<(), String> {
    if state.models_dir.as_deref() == Some(dir) && state.models.is_some() {
        return Ok(());
    }
    state.models = Some(Models::load(&state.env, dir)?);
    state.models_dir = Some(dir.to_string());
    Ok(())
}

fn handle(state: &mut State, req: Req) -> Resp {
    match req {
        Req::Ping => Resp::Pong,
        Req::Vision { models_dir, key, pixels } => {
            if let Err(e) = ensure_models(state, &models_dir) {
                return Resp::Error { message: e };
            }
            let pixels = match decode_f32_payload(&pixels) {
                Ok(t) => t,
                Err(e) => return Resp::Error { message: e },
            };
            let run = state.models.as_mut().unwrap().vision.run(ort::inputs![
                "pixel_values" => pixels,
            ]);
            let mut outputs = match run {
                Ok(o) => o,
                Err(e) => return Resp::Error { message: format!("vision run: {e}") },
            };
            // mirror engine.ts: outputs [0],[1],[2],[6] == the four names below
            let mut picked: Vec<Tensor<f32>> = Vec::with_capacity(4);
            for name in ["fpn_hidden_state_0", "fpn_hidden_state_1", "fpn_hidden_state_2", "fpn_position_encoding_2"] {
                match take_f32(&mut outputs, name) {
                    Ok(t) => picked.push(t),
                    Err(e) => return Resp::Error { message: e },
                }
            }
            drop(outputs);
            state.vision_order.retain(|k| k != &key);
            state.vision_order.push(key.clone());
            state.vision_cache.insert(key.clone(), picked);
            while state.vision_order.len() > 2 {
                let evict = state.vision_order.remove(0);
                state.vision_cache.remove(&evict);
            }
            Resp::Vision { key }
        }
        Req::Text { models_dir, input_ids, attn } => {
            if let Err(e) = ensure_models(state, &models_dir) {
                return Resp::Error { message: e };
            }
            if input_ids.len() != 32 || attn.len() != 32 {
                return Resp::Error { message: format!("ids {} / attn {} lengths, need 32/32", input_ids.len(), attn.len()) };
            }
            let ids = match Tensor::<i64>::from_array(([1usize, 32usize], input_ids)) {
                Ok(t) => t,
                Err(e) => return Resp::Error { message: e.to_string() },
            };
            let mask = match Tensor::<i64>::from_array(([1usize, 32usize], attn)) {
                Ok(t) => t,
                Err(e) => return Resp::Error { message: e.to_string() },
            };
            let run = state.models.as_mut().unwrap().text.run(ort::inputs![
                "input_ids" => ids,
                "attention_mask" => mask,
            ]);
            let mut outputs = match run {
                Ok(o) => o,
                Err(e) => return Resp::Error { message: format!("text run: {e}") },
            };
            match take_f32(&mut outputs, "text_features") {
                Ok(t) => Resp::Text { text_features: tensor_out_f32(&t) },
                Err(e) => Resp::Error { message: e },
            }
        }
        Req::Decode { models_dir, vision_key, text_features, attn } => {
            if let Err(e) = ensure_models(state, &models_dir) {
                return Resp::Error { message: e };
            }
            if attn.len() != 32 {
                return Resp::Error { message: format!("attn length {}, need 32", attn.len()) };
            }
            let Some(vis) = state.vision_cache.get(&vision_key) else {
                return Resp::Error { message: format!("vision key {vision_key} not cached (runner restarted or LRU evicted)") };
            };
            let tf = match decode_f32_payload(&text_features) {
                Ok(t) => t,
                Err(e) => return Resp::Error { message: e },
            };
            let mask = match Tensor::<i64>::from_array(([1usize, 32usize], attn)) {
                Ok(t) => t,
                Err(e) => return Resp::Error { message: e.to_string() },
            };
            let inputs: Vec<(&str, SessionInputValue)> = vec![
                ("fpn_hidden_state_0", (&vis[0]).into()),
                ("fpn_hidden_state_1", (&vis[1]).into()),
                ("fpn_hidden_state_2", (&vis[2]).into()),
                ("fpn_position_encoding_2", (&vis[3]).into()),
                ("text_features", tf.into()),
                ("attention_mask", mask.into()),
            ];
            let run = state.models.as_mut().unwrap().decoder.run(inputs);
            let mut outputs = match run {
                Ok(o) => o,
                Err(e) => return Resp::Error { message: format!("decoder run: {e}") },
            };
            match (take_f32(&mut outputs, "pred_masks"), take_f32(&mut outputs, "pred_boxes"), take_f32(&mut outputs, "pred_logits")) {
                (Ok(m), Ok(b), Ok(l)) => Resp::Decode { masks: tensor_out_f32(&m), boxes: tensor_out_f32(&b), logits: tensor_out_f32(&l) },
                (Err(e), _, _) | (_, Err(e), _) | (_, _, Err(e)) => Resp::Error { message: e },
            }
        }
        Req::Lens { lens_dir, pixels } => {
            // session cache keyed by dir, options mirror lens.ts (cpu, 4 threads)
            if state.lens.as_ref().map(|(d, _)| d != &lens_dir).unwrap_or(true) {
                let built = Session::builder(&state.env)
                    .map_err(|e| format!("builder: {e}"))
                    .and_then(|mut b| {
                        b = b.with_optimization_level(GraphOptimizationLevel::Level3).map_err(|e| format!("opt level: {e}"))?;
                        b = b.with_intra_threads(4).map_err(|e| format!("threads: {e}"))?;
                        b.commit_from_file(Path::new(&lens_dir).join("lens.onnx")).map_err(|e| format!("lens session: {e}"))
                    });
                match built {
                    Ok(s) => state.lens = Some((lens_dir.clone(), s)),
                    Err(e) => return Resp::Error { message: e },
                }
            }
            let pixels = match decode_f32_payload(&pixels) {
                Ok(t) => t,
                Err(e) => return Resp::Error { message: e },
            };
            let (_, lens_session) = state.lens.as_mut().unwrap();
            let run = lens_session.run(ort::inputs!["image" => pixels]);
            let mut outputs = match run {
                Ok(o) => o,
                Err(e) => return Resp::Error { message: format!("lens run: {e}") },
            };
            match take_f32(&mut outputs, "logits") {
                Ok(t) => Resp::Lens { logits: tensor_out_f32(&t) },
                Err(e) => Resp::Error { message: e },
            }
        }
    }
}

fn main() {
    let dylib = std::env::var("ORT_DYLIB_PATH").unwrap_or_else(|_| {
        eprintln!("[segment-runner] ORT_DYLIB_PATH is not set");
        std::process::exit(2);
    });
    let env = match ort::init_from(&dylib).map_err(|e| e.to_string()).and_then(|b| b.build().map_err(|e| e.to_string())) {
        Ok(env) => env,
        Err(e) => {
            eprintln!("[segment-runner] cannot load ORT from {dylib}: {e}");
            std::process::exit(2);
        }
    };
    eprintln!("[segment-runner] up, ORT {}", ort::info());

    let mut state = State { env, models_dir: None, models: None, lens: None, vision_cache: HashMap::new(), vision_order: Vec::new() };
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut out = stdout.lock();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break }; // parent closed the pipe: exit
        if line.trim().is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<Req>(&line) {
            Ok(req) => handle(&mut state, req),
            Err(e) => Resp::Error { message: format!("bad request: {e}") },
        };
        let Ok(json) = serde_json::to_string(&resp) else { continue };
        if out.write_all(json.as_bytes()).and_then(|_| out.write_all(b"\n")).and_then(|_| out.flush()).is_err() {
            break; // parent gone
        }
    }
}
