// ---------- VARIÁVEIS GERAIS ----------
let palette = [];
let savedPalettes = [];
let selectedIndex = -1;
let selectedSavedIndex = -1;

const NUM_CORES = 5;
const STORAGE_KEY = "moodkit_saved_palettes";

let msg = "";
let msgTimer = 0;

const paletteY = 30;
let paletteH = 190;

let gradientY = 0;
const gradientH = 60;
const gradientGap = 12;
const bottomMargin = 26;
const minPaletteH = 140;

let imgSource = null;
let usingImagePalette = false;

let savedListEl = null;
let savedEmptyEl = null;

// ---------- SETUP / DRAW ----------
function setup() {
  // cria canvas e mete dentro da div #sketch-container
  const container = document.getElementById("sketch-container");

  const canvasWidth = container ? container.offsetWidth : 900;

  const cnv = createCanvas(canvasWidth, 520);
  if (container) cnv.parent("sketch-container");

  noStroke();
  textFont('"MS Sans Serif", "Tahoma", sans-serif');
  pixelDensity(1);

  setupUi();
  carregarPaletasGuardadas();
  gerarPaleta();
  updateSavedList();
}

function draw() {
  background(0);

  updateLayout();
  desenharPainelFundo();
  desenharPalette();
  desenharGradient();
  desenharMensagem();
}

function windowResized() {
  const container = document.getElementById("sketch-container");
  if (container) {
    // Ajusta o canvas para a nova largura do container
    resizeCanvas(container.offsetWidth, 520);
    // O draw() trata de reposicionar tudo (layout) no próximo frame
  }
}

// ---------- UI ----------
function setupUi() {
  const newBtn = document.getElementById("btn-new");
  if (newBtn) newBtn.addEventListener("click", gerarPaleta);

  const saveBtn = document.getElementById("btn-save");
  if (saveBtn) saveBtn.addEventListener("click", guardarPaleta);

  const fileInput = document.getElementById("image-input");
  if (fileInput) fileInput.addEventListener("change", handleFileInput);

  const clearBtn = document.getElementById("btn-clear-saved");
  if (clearBtn) clearBtn.addEventListener("click", limparPaletasGuardadas);

  savedListEl = document.getElementById("saved-list");
  savedEmptyEl = document.getElementById("saved-empty");
}

function updateLayout() {
  const desiredGradientY = height - gradientH - bottomMargin;
  const desiredPaletteH = desiredGradientY - paletteY - gradientGap;

  if (desiredPaletteH < minPaletteH) {
    paletteH = minPaletteH;
    gradientY = paletteY + paletteH + gradientGap;
    return;
  }

  paletteH = desiredPaletteH;
  gradientY = desiredGradientY;
}

// ---------- FUNDO / PAINEL PRINCIPAL ----------
function desenharPainelFundo() {
  noFill();
  stroke(255);
  strokeWeight(1);
  rect(8, 8, width - 16, height - 16);
}

// ---------- GERAR PALETA RANDOM (3 ESTILOS) ----------
function gerarPaleta() {
  usingImagePalette = false;

  const mode = floor(random(3)); // 0 = baseado em base, 1 = monocromático, 2 = complementar

  if (mode === 0) {
    const base = chroma.random();
    palette = chroma
      .scale([
        base.brighten(2),
        base,
        base.darken(1),
        base.darken(2),
        base.desaturate(1)
      ])
      .mode("lab")
      .colors(NUM_CORES);
  } else if (mode === 1) {
    const hue = random(0, 360);
    const c1 = chroma.hsl(hue, 0.9, 0.2);
    const c2 = chroma.hsl(hue, 0.8, 0.45);
    const c3 = chroma.hsl(hue, 0.6, 0.75);
    palette = chroma.scale([c1, c2, c3]).mode("lch").colors(NUM_CORES);
  } else {
    const hue = random(0, 360);
    const base = chroma.hsl(hue, 0.7, 0.45);
    const comp = base.set("hsl.h", hue + 180);
    palette = chroma
      .scale([base.brighten(1), base, comp, comp.darken(1)])
      .mode("lab")
      .colors(NUM_CORES);
  }

  ajustarCorDoMeio();

  selectedIndex = -1;
  selectedSavedIndex = -1;
  updateSavedList();
  mostrarMensagem("Nova paleta random gerada");
  if (window.updateParticleColors) window.updateParticleColors(palette);
}

// ---------- AJUSTAR A COR DO MEIO ----------
function ajustarCorDoMeio() {
  if (!palette || palette.length !== NUM_CORES) return;

  const midIndex = floor(NUM_CORES / 2);
  let cMid = chroma(palette[midIndex]);
  let [h, s, l] = cMid.hsl();

  const isNaHue = isNaN(h);

  if (isNaHue || s < 0.25) {
    const left = chroma(palette[midIndex - 1]);
    const right = chroma(palette[midIndex + 1]);

    cMid = chroma.mix(left, right, 0.5, "lch").saturate(1.2);
    [h, s, l] = cMid.hsl();

    if (s < 0.35) {
      cMid = cMid.saturate(2);
      [h, s, l] = cMid.hsl();
    }
  }

  const hNorm = ((h % 360) + 360) % 360;
  if (hNorm > 20 && hNorm < 70 && s < 0.6 && l > 0.25 && l < 0.7) {
    cMid = cMid.saturate(0.5).brighten(0.1);
  }

  palette[midIndex] = cMid.hex();
}

// ---------- GERAR PALETA A PARTIR DE IMAGEM ----------
function gerarPaletaFromImage() {
  if (!imgSource) return;
  const size = 80, gfx = createGraphics(size, size);
  gfx.image(imgSource, 0, 0, size, size); gfx.loadPixels();

  // 1. Dataset Extraction
  const data = [];
  for (let i = 0; i < gfx.pixels.length; i += 4)
    data.push([gfx.pixels[i], gfx.pixels[i + 1], gfx.pixels[i + 2]]);

  // 2. K-Means (Inline & Optimized)
  let seed = 42, k = 5, iter = 20, centroids = [];
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;

  // Init
  for (let i = 0; i < k; i++) centroids.push(data[Math.floor(rnd() * data.length)]);

  // Convergence Loop
  while (iter--) {
    const clusters = Array.from({ length: k }, () => []);
    data.forEach(p => {
      let min = Infinity, idx = 0;
      centroids.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < min) { min = d; idx = i; }
      });
      clusters[idx].push(p);
    });

    let converged = true;
    centroids = centroids.map((c, i) => {
      const cl = clusters[i];
      if (!cl.length) return data[Math.floor(rnd() * data.length)];
      const newC = [0, 1, 2].map(x => Math.floor(cl.reduce((acc, p) => acc + p[x], 0) / cl.length));
      if (newC.some((v, j) => v !== c[j])) converged = false;
      return newC;
    });
    if (converged) break;
  }

  // 3. Output & UI
  const hex = centroids.map(c => chroma(c).hex()).sort((a, b) => chroma(a).get('lab.l') - chroma(b).get('lab.l'));
  palette = chroma.scale(hex).mode("lab").colors(NUM_CORES);

  gfx.remove();
  typeof ajustarCorDoMeio === 'function' && ajustarCorDoMeio();
  selectedIndex = selectedSavedIndex = -1;
  typeof updateSavedList === 'function' && updateSavedList();
  usingImagePalette = true;
  typeof mostrarMensagem === 'function' && mostrarMensagem("Paleta Dominante Gerada");
  if (window.updateParticleColors) window.updateParticleColors(palette);
}

// ---------- HANDLER DO UPLOAD ----------
function handleFileInput(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    mostrarMensagem("Ficheiro invalido.");
    event.target.value = "";
    return;
  }

  const url = URL.createObjectURL(file);
  loadImage(
    url,
    (img) => {
      imgSource = img;
      gerarPaletaFromImage();
      URL.revokeObjectURL(url);
    },
    () => {
      URL.revokeObjectURL(url);
      mostrarMensagem("Nao foi possivel carregar a imagem.");
    }
  );
  event.target.value = "";
}

// ---------- DESENHO DA PALETA PRINCIPAL ----------
function desenharPalette() {
  if (!palette || palette.length === 0) return;

  const panelX = 12;
  const panelY = paletteY - 6;
  const panelW = width - 24;
  const panelH = paletteH + 12;
  const pad = 8;
  const gap = 8;
  const swatchW = (panelW - pad * 2 - gap * (NUM_CORES - 1)) / NUM_CORES;
  const swatchH = panelH - pad * 2;

  stroke(255);
  noFill();
  rect(panelX, panelY, panelW, panelH);

  for (let i = 0; i < NUM_CORES; i++) {
    const hex = palette[i];
    const x = panelX + pad + i * (swatchW + gap);
    const y = panelY + pad;

    stroke(255);
    strokeWeight(1);
    fill(hex);
    rect(x, y, swatchW, swatchH);

    if (i === selectedIndex) {
      noFill();
      stroke(255);
      strokeWeight(2);
      rect(x, y, swatchW, swatchH);
    }

    stroke(255);
    strokeWeight(1);
    fill(0);
    const labelH = 18;
    const labelY = y + swatchH - labelH - 4;
    rect(x + 6, labelY, swatchW - 12, labelH);

    fill(255);
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(12);
    text(hex.toUpperCase(), x + swatchW / 2, labelY + labelH / 2);
  }
}

// ---------- GRADIENTE ----------
function desenharGradient() {
  if (!palette || palette.length === 0) return;

  const grad = chroma.scale(palette).mode("lab");
  const panelX = 12;
  const panelW = width - 24;
  const pad = 8;

  stroke(255);
  noFill();
  rect(panelX, gradientY - 4, panelW, gradientH + 8);

  noStroke();
  const gradW = panelW - pad * 2;
  for (let x = 0; x < gradW; x++) {
    const t = x / (gradW - 1);
    const c = grad(t).hex();
    fill(c);
    rect(panelX + pad + x, gradientY, 1, gradientH);
  }
}

// ---------- GUARDAR PALETAS ----------
function guardarPaleta() {
  if (!palette || palette.length === 0) return;
  savedPalettes.unshift([...palette]);
  selectedSavedIndex = 0;
  salvarPaletasGuardadas();
  updateSavedList();
  mostrarMensagem("Paleta guardada");
}

function limparPaletasGuardadas() {
  if (savedPalettes.length === 0) return;
  savedPalettes = [];
  selectedSavedIndex = -1;
  salvarPaletasGuardadas();
  updateSavedList();
  mostrarMensagem("Paletas limpas");
}

// ---------- INTERAÇÃO ----------
function mousePressed() {
  const colWidth = width / NUM_CORES;

  if (mouseY >= paletteY && mouseY <= paletteY + paletteH) {
    const idx = floor(mouseX / colWidth);
    if (idx >= 0 && idx < NUM_CORES) {
      selectedIndex = idx;
      const hex = palette[idx];
      copiarHex(hex);
      mostrarMensagem("HEX copiado: " + hex.toUpperCase());
    }
  }
}

function copiarHex(hex) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(hex).catch((err) => {
      console.warn("Não foi possível copiar para clipboard:", err);
    });
  }
  console.log("HEX copiado:", hex);
}

function keyPressed() {
  if (key === " ") {
    gerarPaleta();
  } else if (key === "s" || key === "S") {
    guardarPaleta();
  }
}

function carregarPaleta(index) {
  const pal = savedPalettes[index];
  if (!pal) return;
  palette = [...pal];
  selectedIndex = -1;
  selectedSavedIndex = index;
  usingImagePalette = false;
  updateSavedList();
  mostrarMensagem("Paleta carregada");
  if (window.updateParticleColors) window.updateParticleColors(palette);
}

function carregarPaletasGuardadas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return;
    savedPalettes = data.filter(
      (pal) => Array.isArray(pal) && pal.length === NUM_CORES
    );
  } catch (err) {
    console.warn("Erro ao ler paletas guardadas:", err);
  }
}

function salvarPaletasGuardadas() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPalettes));
  } catch (err) {
    console.warn("Erro ao guardar paletas:", err);
  }
}

function updateSavedList() {
  if (!savedListEl) return;
  savedListEl.innerHTML = "";

  if (savedEmptyEl) {
    savedEmptyEl.hidden = savedPalettes.length > 0;
  }

  savedPalettes.forEach((pal, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "saved-item" + (index === selectedSavedIndex ? " is-active" : "");
    item.setAttribute("aria-label", "Paleta " + (index + 1));
    item.addEventListener("click", () => carregarPaleta(index));

    const label = document.createElement("span");
    label.className = "saved-index";
    label.textContent = "P" + (index + 1);

    const swatches = document.createElement("span");
    swatches.className = "saved-swatches";
    pal.forEach((hex) => {
      const swatch = document.createElement("span");
      swatch.className = "saved-swatch";
      swatch.style.background = hex;
      swatches.appendChild(swatch);
    });

    item.appendChild(label);
    item.appendChild(swatches);
    savedListEl.appendChild(item);
  });
}

// ---------- UI ----------
function desenharTitulo() {
  fill(255);
  textAlign(LEFT, TOP);
  textSize(16);
  text("Gerador de Paletas", 24, 16);

  textSize(11);
  fill(210);
  text(
    "Espaço: nova paleta   |   S: guardar paleta   |   Clique numa cor: copia HEX",
    24,
    32
  );

  // sobe um pouco o texto de instrução para não ficar tão colado ao fundo
  text(
    "Carrega uma imagem no input abaixo do canvas para gerar uma paleta a partir dela.",
    24,
    height - 50
  );
}

function mostrarMensagem(txt) {
  msg = txt;
  msgTimer = frameCount;
}

function desenharMensagem() {
  if (!msg) return;
  const duracao = 180; // ~3 segundos

  if (frameCount - msgTimer > duracao) return;

  const boxWidth = 360;
  const boxHeight = 28;

  fill(0);
  stroke(255);
  rect(
    width / 2 - boxWidth / 2,
    height - 90,           // <<-- subido (antes -70)
    boxWidth,
    boxHeight,
    2
  );

  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(12);
  text(msg, width / 2, height - 90 + boxHeight / 2);
}
