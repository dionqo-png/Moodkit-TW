import {
  createGL, createProgram, createQuadVAO,
  createTexture, createFBO, updateTextureFromElement,
  setUniform, setUniformInt, bindTex, drawFullscreen,
  resizeCanvasTo, nowSec
} from "./utils/gl.js";

import {
  defaultState, loadState, saveState,
  createUIBindings, applyTypePreset
} from "./utils/ui.js";

//  Live Server/Vite
async function loadText(relPath) {
  const url = new URL(relPath, import.meta.url);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return await res.text();
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function mergeDeep(base, override) {
  const out = structuredClone(base);
  if (!override) return out;
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[key] = mergeDeep(base[key] ?? {}, val);
    } else {
      out[key] = val;
    }
  }
  return out;
}

// --- DOM ---
const canvasWrap = document.getElementById("canvasWrap");
const outCanvas = document.getElementById("outCanvas");
const webcamVideo = document.getElementById("webcamVideo");

const fileInput = document.getElementById("fileInput");
const tabUpload = document.getElementById("tabUpload");
const tabWebcam = document.getElementById("tabWebcam");

const startWebcamBtn = document.getElementById("startWebcamBtn");
const stopWebcamBtn = document.getElementById("stopWebcamBtn");
const captureBtn = document.getElementById("captureBtn");
const recordBtn = document.getElementById("recordBtn");
const exportAnimBtn = document.getElementById("exportAnimBtn");
const pauseMotionBtn = document.getElementById("pauseMotionBtn");
const saveImageBtn = document.getElementById("saveImageBtn");
const clearCanvasBtn = document.getElementById("clearCanvasBtn");
const canvasZoom = document.getElementById("canvasZoom");

const pillRenderer = document.getElementById("pillRenderer");
const pillFPS = document.getElementById("pillFPS");
const pillSource = document.getElementById("pillSource");
const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));
const accordionToggles = Array.from(document.querySelectorAll("[data-accordion-target]"));
const filtersAccordionToggle = document.querySelector('[data-accordion-target="#filtersAccordion"]');
const filtersAccordionPanel = document.querySelector("#filtersAccordion");
const filterSections = Array.from(document.querySelectorAll("[data-filter-section]"));
const crtSection = document.querySelector(".crt-section");
const crtInputs = Array.from(document.querySelectorAll('[data-key^="crt."]'));
const asciiSection = document.querySelector(".ascii-section");
const asciiInputs = Array.from(document.querySelectorAll('[data-key^="ascii."]'));
const asciiUseCRTChk = document.getElementById("asciiUseCRT");
const caSection = document.querySelector(".ca-section");
const caInputs = Array.from(document.querySelectorAll('[data-key^="ca."]'));
const distortSection = document.querySelector(".distort-section");
const distortInputs = Array.from(document.querySelectorAll('[data-key^="distort."]'));
const distortMapInput = document.getElementById("distortMapInput");
let glyphAtlas = null;
let distortMapEl = null;


const rendererStatus = document.getElementById("rendererStatus");
const errorBox = document.getElementById("errorBox");

// Fonte atual: imagem (HTMLImageElement) ou webcam (HTMLVideoElement)
let sourceType = "upload"; // upload|webcam
let sourceEl = null;      
let webcamStream = null;


const defaults = defaultState();
const loaded = loadState();
const state = mergeDeep(defaults, loaded ?? {});
state.global = state.global ?? {};
saveState(state);

// UI 
const ui = createUIBindings({
  root: document,
  state,
  onChange: () => {
    resizeCanvasTo(outCanvas, state.global.canvasSize);
    applyZoom(state.global.zoom ?? 1);
    if (renderer?.type === "webgl2") renderer.resize(state.global.canvasSize);
  }
});


window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "u") setSource("upload");
  if (k === "w") setSource("webcam");
  if (k === "s") {
    e.preventDefault();
    saveProcessedImage();
  }
  if (e.code === "Space") {
    e.preventDefault();
    if (state.global.filter === "off") return;
    state.global.showEffect = !state.global.showEffect;
    const chk = document.getElementById("showEffect");
    if (chk) chk.checked = state.global.showEffect;
    saveState(state);
  }
});


tabUpload.addEventListener("click", () => setSource("upload"));
tabWebcam.addEventListener("click", () => setSource("webcam"));

function updateTabs() {
  tabUpload.classList.toggle("is-active", sourceType === "upload");
  tabWebcam.classList.toggle("is-active", sourceType === "webcam");
  tabUpload.setAttribute("aria-selected", sourceType === "upload" ? "true" : "false");
  tabWebcam.setAttribute("aria-selected", sourceType === "webcam" ? "true" : "false");
}

function updateFilterButtons(active) {
  filterButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.filter === active);
    btn.setAttribute("aria-pressed", btn.dataset.filter === active ? "true" : "false");
  });
}

function applyFilter(filter) {
  state.global.filter = filter;

  if (filter === "off") {
    state.global.showEffect = false;
  } else {
    state.global.showEffect = true;

    if (filter === "crt") {
      const next = applyTypePreset(state, state.crt.type ?? "monitor");
      Object.assign(state, next);
    }
  }

  const showEffect = document.getElementById("showEffect");
  if (showEffect) {
    showEffect.checked = !!state.global.showEffect;
    showEffect.disabled = filter === "off";
  }

  ui?.fillAll?.();
  saveState(state);

  updateFilterButtons(filter);
  if (filtersAccordionToggle && filtersAccordionPanel) {
    setAccordionExpanded(filtersAccordionToggle, filtersAccordionPanel, filter !== "off");
  }
  updateSectionVisibility(filter);

  const allowCRT = filter === "crt" || (filter === "ascii" && state.ascii.useCRT);
  setCRTEnabled(allowCRT);
  setASCIIEnabled(filter === "ascii");
  setCAEnabled(filter === "ca");
  setDistortEnabled(filter === "distort");
}

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.filter;
    if (!filter) return;
    applyFilter(filter);
  });
});

function setCRTEnabled(on) {
  crtInputs.forEach((el) => {
    el.disabled = !on;
  });
  if (crtSection) crtSection.classList.toggle("is-disabled", !on);
}

function setASCIIEnabled(on) {
  asciiInputs.forEach((el) => {
    el.disabled = !on;
  });
  if (asciiSection) asciiSection.classList.toggle("is-disabled", !on);
}

function setCAEnabled(on){
  caInputs.forEach(el => el.disabled = !on);
  if (caSection) caSection.classList.toggle("is-disabled", !on);
}
function setDistortEnabled(on){
  distortInputs.forEach(el => el.disabled = !on);
  if (distortSection) distortSection.classList.toggle("is-disabled", !on);
}

function updateSectionVisibility(filter){
  filterSections.forEach(sec => {
    const target = sec.getAttribute("data-filter-section");
    const allowCRT = (filter === "crt") || (filter === "ascii" && state.ascii.useCRT);
    const shouldShow =
      target === filter ||
      (target === "color" && filter !== "off") ||
      (target === "crt" && allowCRT);
    sec.hidden = !shouldShow;
  });
}

function applyZoom(z){
  const zoomVal = clamp(Number(z) || 1, 0.5, 2);
  if (canvasWrap) {
    canvasWrap.style.setProperty("--zoom", zoomVal);
  }
}

function setAccordionExpanded(btn, panel, expanded) {
  if (!btn || !panel) return;
  btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  panel.hidden = !expanded;
  panel.classList.toggle("is-open", expanded);
}

accordionToggles.forEach((btn) => {
  const targetSel = btn.getAttribute("data-accordion-target");
  const panel = targetSel ? document.querySelector(targetSel) : null;
  if (!panel) return;
  btn.addEventListener("click", () => {
    const next = btn.getAttribute("aria-expanded") !== "true";
    setAccordionExpanded(btn, panel, next);
  });
});

asciiUseCRTChk?.addEventListener("change", () => {
  const allowCRT = (state.global.filter === "crt") || (state.global.filter === "ascii" && asciiUseCRTChk.checked);
  setCRTEnabled(allowCRT);
  updateSectionVisibility(state.global.filter);
});

function togglePauseMotion() {
  state.global.pauseMotion = !state.global.pauseMotion;
  if (!state.global.pauseMotion) frozenTimeSec = nowSec();
  updatePauseMotionButton();
  saveState(state);
}

function updatePauseMotionButton() {
  if (!pauseMotionBtn) return;
  pauseMotionBtn.textContent = state.global.pauseMotion ? "Resume motion" : "Pause motion";
  pauseMotionBtn.setAttribute("aria-pressed", state.global.pauseMotion ? "true" : "false");
}

// Upload
fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.includes("png") && !file.type.includes("jpeg")) {
    alert("Please choose PNG or JPEG.");
    return;
  }

  const img = new Image();
  img.decoding = "async";
  img.alt = "upload";
  const objURL = URL.createObjectURL(file);
  img.src = objURL;

  try {
    await img.decode();
  } catch {
   
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
  } finally {
    URL.revokeObjectURL(objURL);
  }

  sourceEl = img;
  setSource("upload");
  saveImageBtn.disabled = false;
});

distortMapInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  if (!file.type.includes("png") && !file.type.includes("jpeg")) {
    alert("Distortion map: Please choose PNG or JPEG.");
    return;
  }

  const img = new Image();
  img.decoding = "async";
  const url = URL.createObjectURL(file);
  img.src = url;

  try { await img.decode(); }
  catch { await new Promise((res, rej) => { img.onload = res; img.onerror = rej; }); }
  finally { URL.revokeObjectURL(url); }

  distortMapEl = img;
});

// Webcam controls
startWebcamBtn.addEventListener("click", startWebcam);
stopWebcamBtn.addEventListener("click", stopWebcam);
captureBtn.addEventListener("click", capturePhoto);
recordBtn.addEventListener("click", record5s);
exportAnimBtn.addEventListener("click", exportAnimation3s);
pauseMotionBtn.addEventListener("click", togglePauseMotion);
clearCanvasBtn?.addEventListener("click", clearCanvas);

// Guardar imagem
saveImageBtn.addEventListener("click", saveProcessedImage);

// --- Renderer (WebGL2 multipass, fallback Canvas2D) ---
let renderer = null;

function showError(msg) {
  console.error(msg);
  if (errorBox) {
    errorBox.style.display = "block";
    errorBox.textContent = String(msg);
  }
}
function clearError() {
  if (errorBox) errorBox.style.display = "none";
}

async function initRenderer() {
  resizeCanvasTo(outCanvas, state.global.canvasSize);

  // tenta WebGL2 primeiro (sem pedir 2D antes)
  const gl = createGL(outCanvas);

  if (!gl) {
    renderer = createCanvas2DRenderer(outCanvas);
    pillRenderer.textContent = "Renderer: Canvas2D (fallback)";
    if (rendererStatus) {
      rendererStatus.textContent = "Renderer: Canvas2D (fallback)";
      rendererStatus.style.background = "#fee2e2";
    }
    showError("WebGL2 not available/allowed in this browser. Falling back to Canvas2D (no CRT).");
    return;
  }

  // tenta carregar/compilar shaders
  try {
    const [vs, fs] = await Promise.all([
      loadText("./shaders/crt.vert"),
      loadText("./shaders/crt.frag"),
    ]);

    const program = createProgram(gl, vs, fs);
    const { vao } = createQuadVAO(gl);

    renderer = createWebGL2Renderer(gl, program, vao);
    pillRenderer.textContent = "Renderer: WebGL2";
    if (rendererStatus) {
      rendererStatus.textContent = "Renderer: WebGL2";
      rendererStatus.style.background = "#d1fae5";
    }
    clearError();
  } catch (err) {
    renderer = createCanvas2DRenderer(outCanvas);
    pillRenderer.textContent = "Renderer: Canvas2D (fallback)";
    if (rendererStatus) {
      rendererStatus.textContent = "Renderer: Canvas2D (fallback)";
      rendererStatus.style.background = "#fee2e2";
    }
    showError("Failed to compile shaders / init WebGL2 pipeline. Falling back to Canvas2D.\n" + (err?.message ?? err));
  }
}

function createCanvas2DRenderer(canvas) {
  const ctx2d = canvas.getContext("2d"); 
  return {
    type: "canvas2d",
    resize: (sizePx) => resizeCanvasTo(canvas, sizePx),
    render: (src) => {
      if (!src) {
        ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      const { sx, sy, sw, sh, dx, dy, dw, dh } = computeLetterbox(src, canvas.width, canvas.height);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
    },
    clear: () => ctx2d.clearRect(0, 0, canvas.width, canvas.height)
  };
}

function computeLetterbox(src, W, H) {
  const srcW = src.videoWidth || src.naturalWidth || src.width;
  const srcH = src.videoHeight || src.naturalHeight || src.height;

  const srcAR = srcW / srcH;
  const dstAR = W / H;

  let dw, dh, dx, dy;
  if (srcAR > dstAR) {
    dw = W; dh = W / srcAR;
    dx = 0; dy = (H - dh) * 0.5;
  } else {
    dh = H; dw = H * srcAR;
    dy = 0; dx = (W - dw) * 0.5;
  }

  return {
    sx: 0, sy: 0, sw: srcW, sh: srcH,
    dx, dy, dw, dh
  };
}

function createWebGL2Renderer(gl, program, vao) {
  gl.useProgram(program);

  const u = {
    uTex0: gl.getUniformLocation(program, "uTex0"),
    uBloomTex: gl.getUniformLocation(program, "uBloomTex"),
    uGlyphTex: gl.getUniformLocation(program, "uGlyphTex"),
    uFilterMode: gl.getUniformLocation(program, "uFilterMode"),
    uASCIIUseCRT: gl.getUniformLocation(program, "uASCIIUseCRT"),
    uASCIICharCount: gl.getUniformLocation(program, "uASCIICharCount"),
    uMapTex: gl.getUniformLocation(program, "uMapTex"),
  };

  // Textura de input (
  let srcTex = createTexture(gl, 2, 2, { linear: true });
  // Glyph atlas para ASCII
  glyphAtlas = createGlyphAtlas(gl, getCharsetString(state.ascii.charset));
  // Distortion map
  let mapTex = createTexture(gl, 2, 2, { linear: true });

  // ping-pong
  const full = { size: 0, a: null, b: null, fboA: null, fboB: null };
  // bloom
  const half = { size: 0, a: null, b: null, fboA: null, fboB: null };

  function alloc(sizePx) {
    full.size = sizePx;
    full.a = createTexture(gl, sizePx, sizePx, { linear: true });
    full.b = createTexture(gl, sizePx, sizePx, { linear: true });
    full.fboA = createFBO(gl, full.a);
    full.fboB = createFBO(gl, full.b);

    const h = Math.max(1, Math.floor(sizePx / 2));
    half.size = h;
    half.a = createTexture(gl, h, h, { linear: true });
    half.b = createTexture(gl, h, h, { linear: true });
    half.fboA = createFBO(gl, half.a);
    half.fboB = createFBO(gl, half.b);
  }

  alloc(state.global.canvasSize);

  function setCommonUniforms(targetSize, srcSize, timeSec) {
    setUniform(gl, program, "uTime", timeSec);
    setUniform(gl, program, "uResolution", [targetSize, targetSize]);
    setUniform(gl, program, "uTexel", [1 / targetSize, 1 / targetSize]);
    setUniform(gl, program, "uSourceTexel", [1 / srcSize.w, 1 / srcSize.h]);
  }

  function ensureGlyphAtlas(glCtx) {
    const charset = getCharsetString(state.ascii.charset);
    if (glyphAtlas && glyphAtlas.charset === charset) return;
    if (glyphAtlas?.tex) glCtx.deleteTexture(glyphAtlas.tex);
    glyphAtlas = createGlyphAtlas(glCtx, charset);
  }

  function setParams() {
   
    setUniformInt(gl, program, "uShowEffect", state.global.showEffect ? 1 : 0);

    
    ensureGlyphAtlas(gl);

    setUniform(gl, program, "uPreBlur", state.pre.blur);
    setUniform(gl, program, "uPreGrain", state.pre.grain);
    setUniform(gl, program, "uPreGamma", state.pre.gamma);
    setUniform(gl, program, "uPreBlack", state.pre.blackPoint);
    setUniform(gl, program, "uPreWhite", state.pre.whitePoint);

    const filterMode = (state.global.filter === "ascii") ? 1 : (state.global.filter === "ca" ? 2 : (state.global.filter === "distort" ? 3 : 0));
    setUniformInt(gl, program, "uFilterMode", filterMode);

    // Color palette filter API: mode off|sepia|mono|high|vapor
    const colorModeInt = state.color?.mode === "sepia" ? 1 : (state.color?.mode === "mono" ? 2 : (state.color?.mode === "high" ? 3 : (state.color?.mode === "vapor" ? 4 : 0)));
    setUniformInt(gl, program, "uColorMode", colorModeInt);
    setUniform(gl, program, "uColorIntensity", state.color?.intensity ?? 0);

    // ASCII params
    setUniform(gl, program, "uASCIICell", state.ascii.cellSize);
    setUniform(gl, program, "uASCIIContrast", state.ascii.contrast);
    setUniform(gl, program, "uASCIIGamma", state.ascii.gamma);
    setUniform(gl, program, "uASCIIFgMix", state.ascii.fgMix);
    setUniformInt(gl, program, "uASCIIColor", state.ascii.color ? 1 : 0);
    setUniformInt(gl, program, "uASCIIInvert", state.ascii.invert ? 1 : 0);
    const charsetInt = state.ascii.charset === "simple" ? 0 : (state.ascii.charset === "dense" ? 2 : 1);
    setUniformInt(gl, program, "uASCIICharset", charsetInt);
    setUniformInt(gl, program, "uASCIIUseCRT", state.ascii.useCRT ? 1 : 0);
    setUniformInt(gl, program, "uASCIICharCount", glyphAtlas?.count ?? 1);

    // CA params
    setUniform(gl, program, "uCAThreshold", state.ca.threshold);
    setUniform(gl, program, "uCACellSize", state.ca.cellSize);
    setUniformInt(gl, program, "uCASteps", state.ca.steps);
    const caTypeInt = state.ca.type === "ltl" ? 1 : (state.ca.type === "mncab" ? 2 : (state.ca.type === "mncc" ? 3 : 0));
    setUniformInt(gl, program, "uCAType", caTypeInt);
    setUniformInt(gl, program, "uCASurvive", (state.ca.sLo & 15) | ((state.ca.sHi & 15) << 4));
    setUniformInt(gl, program, "uCABirth", (state.ca.bLo & 15) | ((state.ca.bHi & 15) << 4));
    setUniform(gl, program, "uCAMix", state.ca.mix);
    setUniform(gl, program, "uCABg", hexToRGB01(state.ca.bgHex));
    setUniform(gl, program, "uCAFg", hexToRGB01(state.ca.fgHex));

    // Distort params
    setUniformInt(gl, program, "uHasMap", distortMapEl ? 1 : 0);
    setUniformInt(gl, program, "uDistPre", state.distort.preprocess ? 1 : 0);
    setUniform(gl, program, "uDistThreshold", state.distort.threshold);
    setUniform(gl, program, "uDistX", state.distort.x);
    setUniform(gl, program, "uDistY", state.distort.y);
    setUniform(gl, program, "uDistScale", state.distort.scale);

    const typeInt = state.crt.type === "monitor" ? 0 : (state.crt.type === "tv" ? 1 : 2);
    setUniformInt(gl, program, "uCRTType", typeInt);
    setUniform(gl, program, "uDistortion", state.crt.distortion);
    setUniform(gl, program, "uDotScale", state.crt.dotScale);
    setUniform(gl, program, "uDotPitch", state.crt.dotPitch);
    setUniform(gl, program, "uFalloff", state.crt.falloff);
    setUniform(gl, program, "uGlowRadius", state.crt.glowRadius);
    setUniform(gl, program, "uGlowIntensity", state.crt.glowIntensity);

    const bloomModeInt = state.bloom.mode === "screen" ? 0 : (state.bloom.mode === "light" ? 1 : 2);
    setUniformInt(gl, program, "uBloomMode", bloomModeInt);
    setUniform(gl, program, "uBloomThreshold", state.bloom.threshold);
    setUniform(gl, program, "uBloomIntensity", state.bloom.intensity);
    setUniform(gl, program, "uBloomRadius", state.bloom.radius);

    setUniform(gl, program, "uRedOffset", [state.conv.rX, state.conv.rY]);
    setUniform(gl, program, "uBlueOffset", [state.conv.bX, state.conv.bY]);
  }

  function drawPass({ pass, inputTex, bloomTex, targetFBO, targetSize, srcSize, timeSec, bloomRadiusOverride }) {
    gl.useProgram(program);
    setParams();
    setCommonUniforms(targetSize, srcSize, timeSec);
    if (bloomRadiusOverride !== undefined) {
      setUniform(gl, program, "uBloomRadius", bloomRadiusOverride);
    }
    setUniformInt(gl, program, "uPass", pass);

    gl.viewport(0, 0, targetSize, targetSize);
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);

    if (u.uTex0) bindTex(gl, inputTex, 0, u.uTex0);

    if (u.uBloomTex && bloomTex) {
      bindTex(gl, bloomTex, 1, u.uBloomTex);
    } else if (u.uBloomTex) {
      bindTex(gl, inputTex, 1, u.uBloomTex);
    }
    if (u.uGlyphTex && glyphAtlas?.tex) bindTex(gl, glyphAtlas.tex, 2, u.uGlyphTex);
    if (u.uMapTex && mapTex) bindTex(gl, mapTex, 3, u.uMapTex);

    drawFullscreen(gl, vao);
    if (targetFBO) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  function render(srcEl, timeSec) {
    if (!srcEl) return;

    updateTextureFromElement(gl, srcTex, srcEl);

    const srcW = srcEl.videoWidth || srcEl.naturalWidth || srcEl.width;
    const srcH = srcEl.videoHeight || srcEl.naturalHeight || srcEl.height;
    const srcSize = { w: Math.max(1, srcW), h: Math.max(1, srcH) };

    if (distortMapEl) updateTextureFromElement(gl, mapTex, distortMapEl);

    // 0) Preprocess -> full.a
    drawPass({
      pass: 0,
      inputTex: srcTex,
      bloomTex: null,
      targetFBO: full.fboA,
      targetSize: full.size,
      srcSize,
      timeSec
    });

    // pre blur
    let preOutTex = full.a;
    if (state.pre.blur > 0.0) {
      drawPass({
        pass: 3,
        inputTex: full.a,
        targetFBO: full.fboB,
        targetSize: full.size,
        srcSize,
        timeSec,
        bloomRadiusOverride: state.pre.blur
      });
      drawPass({
        pass: 3,
        inputTex: full.b,
        targetFBO: full.fboA,
        targetSize: full.size,
        srcSize,
        timeSec,
        bloomRadiusOverride: state.pre.blur
      });
      preOutTex = full.a;
    }

    // 1) CRT -> full.b
    if (state.global.filter === "ca") {
      
      drawPass({ pass: 6, inputTex: preOutTex, targetFBO: full.fboB, targetSize: full.size, srcSize, timeSec });

      
      let readTex = full.b;
      let writeFBO = full.fboA;
      const steps = Math.max(1, state.ca.steps | 0);
      for (let i = 0; i < steps; i++) {
        drawPass({ pass: 7, inputTex: readTex, targetFBO: writeFBO, targetSize: full.size, srcSize, timeSec });
        if (readTex === full.b) { readTex = full.a; writeFBO = full.fboB; }
        else { readTex = full.b; writeFBO = full.fboA; }
      }

      // 1c) CA colorize 
      drawPass({ pass: 8, inputTex: preOutTex, bloomTex: readTex, targetFBO: full.fboB, targetSize: full.size, srcSize, timeSec });
    } else if (state.global.filter === "ascii") {
      // ASCII:
      drawPass({
        pass: 1,
        inputTex: preOutTex,
        targetFBO: null,
        targetSize: full.size,
        srcSize,
        timeSec
      });
      return;
    } else {
      // 1) CRT/Distort 
      drawPass({
        pass: 1,
        inputTex: preOutTex,
        targetFBO: full.fboB,
        targetSize: full.size,
        srcSize,
        timeSec
      });
    }

    // 2) Bloom extract 
    drawPass({
      pass: 2,
      inputTex: full.b,
      targetFBO: half.fboA,
      targetSize: half.size,
      srcSize,
      timeSec
    });

    // 3) Blur half-res ping-pong 
    drawPass({ pass: 3, inputTex: half.a, targetFBO: half.fboB, targetSize: half.size, srcSize, timeSec });
    drawPass({ pass: 3, inputTex: half.b, targetFBO: half.fboA, targetSize: half.size, srcSize, timeSec });
    drawPass({ pass: 3, inputTex: half.a, targetFBO: half.fboB, targetSize: half.size, srcSize, timeSec });
    drawPass({ pass: 3, inputTex: half.b, targetFBO: half.fboA, targetSize: half.size, srcSize, timeSec });

    // 4) Composite + aberration 
    drawPass({
      pass: 4,
      inputTex: full.b,
      bloomTex: half.a,
      targetFBO: full.fboA,
      targetSize: full.size,
      srcSize,
      timeSec
    });

    // 5) Tonemap -> screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, full.size, full.size);

    gl.useProgram(program);
    setParams();
    setCommonUniforms(full.size, srcSize, timeSec);
    setUniformInt(gl, program, "uPass", 5);

    bindTex(gl, full.a, 0, u.uTex0);
    bindTex(gl, full.a, 1, u.uBloomTex);

    drawFullscreen(gl, vao);
  }

  return {
    type: "webgl2",
    resize: (sizePx) => alloc(sizePx),
    render,
    clear: () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, outCanvas.width, outCanvas.height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  };
}

// --- Loop principal + FPS ---
let lastTime = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let fpsOut = 0;
let frozenTimeSec = nowSec();

let running = true;
document.addEventListener("visibilitychange", () => {
  running = !document.hidden;
});

function loop(t) {
  requestAnimationFrame(loop);
  if (!running) return;

  const dt = t - lastTime;
  lastTime = t;

  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc > 500) {
    fpsOut = Math.round((fpsFrames * 1000) / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
    pillFPS.textContent = `FPS: ${fpsOut}`;
  }

  if (!sourceEl) {
    if (renderer?.type === "canvas2d" && renderer.clear) renderer.clear();
    return;
  }

  const timeNow = state.global.pauseMotion ? frozenTimeSec : nowSec();
  if (!state.global.pauseMotion) frozenTimeSec = timeNow;

  if (renderer?.type === "webgl2") {
    renderer.render(sourceEl, timeNow);
  } else {
    renderer?.render(sourceEl);
  }
}


function clearCanvas() {
  if (sourceType === "webcam") stopWebcam();
  sourceEl = null;
  renderer?.clear?.();
  const ctx2d = outCanvas?.getContext?.("2d");
  if (ctx2d) ctx2d.clearRect(0, 0, outCanvas.width, outCanvas.height);
  saveImageBtn.disabled = true;
  exportAnimBtn.disabled = true;
  pillSource.textContent = "Source: None";
}

function setSource(type) {
  sourceType = type;
  updateTabs();

  if (sourceType === "upload") {
    pillSource.textContent = "Source: Upload";
    startWebcamBtn.disabled = false;
    stopWebcamBtn.disabled = true;
    captureBtn.disabled = true;
    recordBtn.disabled = true;
    const hasImage = !!sourceEl && (sourceEl instanceof HTMLImageElement);
    saveImageBtn.disabled = !hasImage;
    exportAnimBtn.disabled = !hasImage;
  } else {
    pillSource.textContent = "Source: Webcam";
    saveImageBtn.disabled = true;
    exportAnimBtn.disabled = !sourceEl;
  }
}

// --- Webcam ---
async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: true
    });

    webcamVideo.srcObject = webcamStream;
    await webcamVideo.play();

    sourceEl = webcamVideo;
    setSource("webcam");

    startWebcamBtn.disabled = true;
    stopWebcamBtn.disabled = false;
    captureBtn.disabled = false;
    recordBtn.disabled = false;
  } catch (err) {
    console.error(err);
    alert("Could not access webcam/microphone. Check permissions.");
  }
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
  }
  webcamVideo.srcObject = null;

  startWebcamBtn.disabled = false;
  stopWebcamBtn.disabled = true;
  captureBtn.disabled = true;
  recordBtn.disabled = true;

  setSource("upload");
}

// Capture photo (processed canvas frame)
async function capturePhoto() {
  if (!sourceEl) return;
  await waitForStableFrame();
  outCanvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(blob, `capture_${Date.now()}.png`);
  }, "image/png", 1.0);
}

// Record 5s (canvas stream -> MediaRecorder)
async function record5s() {
  try {
    const stream = outCanvas.captureStream(30);

    if (webcamStream) {
      const audioTrack = webcamStream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);
    }

    const options = pickBestRecorderOptions();
    const rec = new MediaRecorder(stream, options);

    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    recordBtn.disabled = true;
    recordBtn.textContent = "Recording...";

    rec.start(200);

    await sleep(5000);
    rec.stop();

    const blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
    });

    downloadBlob(blob, `record_${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
  } catch (err) {
    console.error(err);
    alert("Recording failed. (Some browsers limit codecs.)");
  } finally {
    recordBtn.disabled = false;
    recordBtn.textContent = "Record 5s";
  }
}

// Export quick animation 
async function exportAnimation3s() {
  try {
    exportAnimBtn.disabled = true;
    exportAnimBtn.textContent = "Recording...";

    
    await waitForStableFrame();

    const stream = outCanvas.captureStream(30);
    const options = pickBestRecorderOptions();
    const rec = new MediaRecorder(stream, options);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    rec.start(200);
    await sleep(3000);
    rec.stop();

    const blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
    });

    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(blob, `anim_${Date.now()}.${ext}`);
  } catch (err) {
    console.error(err);
    alert("Export failed. (MediaRecorder may be unsupported.)");
  } finally {
    exportAnimBtn.disabled = false;
    exportAnimBtn.textContent = "Export 3s clip";
  }
}

function pickBestRecorderOptions() {
  const candidates = [
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2" },
    { mimeType: "video/webm;codecs=vp9,opus" },
    { mimeType: "video/webm;codecs=vp8,opus" },
    { mimeType: "video/webm" },
  ];
  for (const c of candidates) {
    if (!c.mimeType) continue;
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return {};
}

// Guardar imagem processada 
function saveProcessedImage() {
  if (!sourceEl) return;
  waitForStableFrame().then(() => {
    outCanvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `export_${Date.now()}.png`);
    }, "image/png", 1.0);
  });
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function waitForStableFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function hexToRGB01(hex){
  const s = String(hex || "").trim();
  const m = s.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return [1,1,1];
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >>  8) & 255;
  const b = (n      ) & 255;
  return [r/255, g/255, b/255];
}

function getCharsetString(name) {
  if (name === "simple") return " .:-=+*#%@";
  if (name === "dense") return " .'`^\",:;Il!i><~+_-?][}{1)(|\\/=rclxnvuoZaexnhmqX7LIYXZO0QWM&8%B@$";
  // classic
  return " .'`^\",:;Il!i><~+_-?][}{1)(|\\/=rclxnvuoZaexnhmqX7LIYXZO0QWM&8%B@$";
}

function createGlyphAtlas(gl, charset) {
  const size = 1024;
  const grid = 16;
  const cell = size / grid;
  const chars = (charset && charset.length) ? charset.slice(0, 256) : " .:-=+*#%@";
  const count = Math.max(1, Math.min(256, chars.length));

  const cvs = document.createElement("canvas");
  cvs.width = size;
  cvs.height = size;
  const ctx = cvs.getContext("2d");

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.floor(cell * 0.78)}px "Lucida Console", Consolas, monospace`;

  for (let i = 0; i < count; i++) {
    const x = (i % grid) * cell + cell * 0.5;
    const y = Math.floor(i / grid) * cell + cell * 0.55;
    const ch = chars[i] ?? " ";
    ctx.fillText(ch, x, y);
  }

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cvs);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { tex, grid, count, charset: chars };
}

// --- inicialização ---
await initRenderer();

setSource("upload");
pillFPS.textContent = "FPS: --";
pillSource.textContent = "Source: Upload";

saveImageBtn.disabled = true;

applyZoom(state.global.zoom ?? 1);
applyFilter(state.global.filter ?? defaults.global.filter ?? "off");
updatePauseMotionButton();

requestAnimationFrame(loop);
