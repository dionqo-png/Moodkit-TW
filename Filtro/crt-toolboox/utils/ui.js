// utils/ui.js
// - Central state schema
// - Two-way binding via data-key
// - Throttling for performance (one update per frame)
// - localStorage (state + presets)
// - CRT presets (Monitor/TV/LCD) with manual override

const LS_KEY = "crt_toolbox_state_v1";
const LS_PRESETS = "crt_toolbox_presets_v1";

export function defaultState() {
  return {
    global: {
      canvasSize: 402,
      showEffect: true,
      filter: "off",
      pauseMotion: false,
      zoom: 1.0,
    },
    pre: {
      blur: 0.0,
      grain: 0.0,
      gamma: 1.0,
      blackPoint: 0.0,
      whitePoint: 255.0,
    },
    crt: {
      type: "monitor", // monitor|tv|lcd
      distortion: 0.02,
      dotScale: 0.93,
      dotPitch: 1.59,
      falloff: 0.12,
      glowRadius: 0.2,
      glowIntensity: 0.1,
    },
    bloom: {
      mode: "hdr", // screen|light|hdr
      threshold: 1.0,
      intensity: 2.01,
      radius: 1.0,
    },
    conv: {
      rX: 0.01,
      rY: 0.01,
      bX: -0.01,
      bY: -0.01,
    },
    ascii: {
      cellSize: 10,
      contrast: 1.2,
      gamma: 1.0,
      fgMix: 0.25,
      charset: "classic", // simple|classic|dense
      color: false,
      invert: false,
      useCRT: false,
    },
    ca: {
      threshold: 0.5,
      cellSize: 6,
      steps: 18,
      type: "classic", // classic|ltl|mncab|mncc
      sLo: 2, sHi: 3,
      bLo: 3, bHi: 3,
      mix: 1.0,
      bgHex: "#0b0b0b",
      fgHex: "#f2f2f2",
    },
    distort: {
      preprocess: true,
      threshold: 0.35,
      x: 0.08,
      y: 0.06,
      scale: 1.4,
    },
    color: {
      mode: "off", // off|sepia|mono|high|vapor
      intensity: 0.0,
    },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

export function loadPresets() {
  try {
    const raw = localStorage.getItem(LS_PRESETS);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function savePresets(presets) {
  try {
    localStorage.setItem(LS_PRESETS, JSON.stringify(presets));
  } catch {}
}

// Acesso por "path" tipo "pre.gamma" ou "conv.rX"
export function getByPath(obj, path) {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) cur = cur?.[p];
  return cur;
}
export function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

function deepMerge(a, b) {
  const out = structuredClone(a);
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
      out[k] = deepMerge(out[k] ?? {}, b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

export function applyTypePreset(state, type) {
  // Presets adjust curves, mask falloff, and bloom accent
  const s = structuredClone(state);

  if (type === "monitor") {
    s.crt.type = "monitor";
    s.crt.distortion = 0.02;
    s.crt.dotScale = 0.93;
    s.crt.dotPitch = 1.59;
    s.crt.falloff = 0.12;
    s.bloom.mode = "hdr";
    s.bloom.threshold = 1.0;
    s.bloom.intensity = 2.01;
    s.bloom.radius = 1.0;
  } else if (type === "tv") {
    s.crt.type = "tv";
    s.crt.distortion = 0.035;
    s.crt.dotScale = 1.15;
    s.crt.dotPitch = 1.25;
    s.crt.falloff = 0.18;
    s.bloom.mode = "screen";
    s.bloom.threshold = 0.9;
    s.bloom.intensity = 2.3;
    s.bloom.radius = 1.15;
  } else {
    s.crt.type = "lcd";
    s.crt.distortion = 0.005;
    s.crt.dotScale = 0.2;
    s.crt.dotPitch = 2.2;
    s.crt.falloff = 0.05;
    s.bloom.mode = "light";
    s.bloom.threshold = 1.1;
    s.bloom.intensity = 1.4;
    s.bloom.radius = 0.85;
  }

  return s;
}

export function createUIBindings({ root, state, onChange }) {
  // Throttle: batch changes into the next frame
  let dirty = false;
  const requestFlush = () => {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(() => {
      dirty = false;
      onChange?.(state);
      saveState(state);
    });
  };

  // Preencher inputs iniciais
  const fillAll = () => {
    // Sliders/data-key
    root.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.getAttribute("data-key");
      const v = getByPath(state, key);

      if (el.type === "radio") {
        el.checked = el.value === String(v);
      } else if (el.type === "checkbox") {
        el.checked = !!v;
      } else if (el.tagName === "SELECT") {
        el.value = String(v);
      } else {
        el.value = String(v);
      }
      updateOutputFor(el);
    });

    // Campos sem data-key
    const canvasSize = root.querySelector("#canvasSize");
    if (canvasSize) canvasSize.value = String(state.global.canvasSize);

    const showEffect = root.querySelector("#showEffect");
    if (showEffect) showEffect.checked = !!state.global.showEffect;

    const crtType = root.querySelector("#crtType");
    if (crtType) crtType.value = state.crt.type;

    // bloom mode radios
    root.querySelectorAll('input[name="bloomMode"]').forEach((r) => {
      r.checked = r.value === state.bloom.mode;
    });
  };

  function updateOutputFor(el) {
    const id = el.id;
    if (!id) return;
    const out = root.querySelector(`#${id}Val`);
    if (!out) return;
    out.textContent = formatValue(el.value);
  }

  function formatValue(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    // manter decimal como pedido (ponto)
    const isInt = Math.abs(n - Math.round(n)) < 1e-6;
    return isInt ? String(Math.round(n)) : n.toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
  }

  // Listeners
  root.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    const key = el.getAttribute?.("data-key");
    if (!key) return;

    // radio
    if (el instanceof HTMLInputElement && el.type === "radio") {
      if (!el.checked) return;
      setByPath(state, key, el.value);
      requestFlush();
      return;
    }

    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      setByPath(state, key, !!el.checked);
      requestFlush();
      return;
    }

    // select
    if (el instanceof HTMLSelectElement) {
      setByPath(state, key, el.value);
      requestFlush();
      return;
    }

    // range/text
    const n = Number(el.value);
    setByPath(state, key, Number.isFinite(n) ? n : el.value);
    updateOutputFor(el);
    requestFlush();
  });

  // canvas size e showEffect (sem data-key)
  const canvasSize = root.querySelector("#canvasSize");
  canvasSize?.addEventListener("change", () => {
    state.global.canvasSize = Number(canvasSize.value);
    requestFlush();
  });

  const showEffect = root.querySelector("#showEffect");
  showEffect?.addEventListener("change", () => {
    state.global.showEffect = !!showEffect.checked;
    requestFlush();
  });

  // tipo CRT (aplica preset + permite override)
  const crtType = root.querySelector("#crtType");
  crtType?.addEventListener("change", () => {
    const next = applyTypePreset(state, crtType.value);
    // merge para manter global e conv, etc.
    const merged = deepMerge(state, next);
    // copiar de volta
    Object.assign(state, merged);
    fillAll();
    requestFlush();
  });

  // Saved presets
  const presetSelect = root.querySelector("#presetSelect");
  const loadPresetIntoSelect = () => {
    const presets = loadPresets();
    if (!presetSelect) return;
    presetSelect.innerHTML = `<option value="">Saved presets</option>`;
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    }
  };
  loadPresetIntoSelect();

  presetSelect?.addEventListener("change", () => {
    const name = presetSelect.value;
    if (!name) return;
    const presets = loadPresets();
    const found = presets.find((p) => p.name === name);
    if (!found) return;
    const merged = deepMerge(state, found.state);
    Object.assign(state, merged);
    fillAll();
    requestFlush();
    presetSelect.value = "";
  });

  // Buttons
  const resetBtn = root.querySelector("#resetBtn");
  resetBtn?.addEventListener("click", () => {
    const fresh = defaultState();
    Object.assign(state, fresh);
    fillAll();
    requestFlush();
  });

  const savePresetBtn = root.querySelector("#savePresetBtn");
  savePresetBtn?.addEventListener("click", () => {
    const name = prompt("Preset name:");
    if (!name) return;
    const presets = loadPresets();
    presets.push({ name, state: structuredClone(state) });
    savePresets(presets);
    loadPresetIntoSelect();
    alert("Preset saved.");
  });

  // Inicializa outputs
  fillAll();

  return {
    fillAll,
    requestFlush,
  };
}




