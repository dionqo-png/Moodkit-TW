// ---------- VARIÁVEIS GERAIS ----------
let palette = [];
let savedPalettes = [];
let selectedIndex = -1;

const NUM_CORES = 5;

let msg = "";
let msgTimer = 0;

const paletteY = 50;
const paletteH = 140;

const gradientY = 220;
const gradientH = 60;

let imgSource = null;
let usingImagePalette = false;

let fileInput;

// ---------- SETUP / DRAW ----------
function setup() {
  // cria canvas e mete dentro da div #sketch-container
  const container = document.getElementById("sketch-container");
  const cnv = createCanvas(900, 520); // <<-- antes era 480
  if (container) cnv.parent("sketch-container");

  noStroke();
  textFont("monospace");
  pixelDensity(1);

  // input de imagem logo abaixo do canvas, dentro do mesmo container
  fileInput = createFileInput(handleFile);
  if (container) fileInput.parent("sketch-container");
  fileInput.id("image-input");

  fileInput.elt.style.marginTop = "10px";

  gerarPaleta();
}

function draw() {
  background(10);

  desenharPainelFundo();
  desenharTitulo();
  desenharPalette();
  desenharGradient();
  desenharSavedPalettes();
  desenharMensagem();
}

// ---------- FUNDO / PAINEL PRINCIPAL ----------
function desenharPainelFundo() {
  noStroke();
  fill(18, 18, 20, 220);
  rect(10, 10, width - 20, height - 20, 16);

  stroke(255, 60);
  strokeWeight(1);
  line(24, 40, width - 24, 40);
  noStroke();
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
  mostrarMensagem("Nova paleta random gerada");
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

  const w = 80;
  const h = 80;
  const gfx = createGraphics(w, h);
  gfx.image(imgSource, 0, 0, w, h);
  gfx.loadPixels();

  const samples = [];
  const sampleCount = 300;

  for (let i = 0; i < sampleCount; i++) {
    const x = floor(random(w));
    const y = floor(random(h));
    const idx = 4 * (y * w + x);
    const r = gfx.pixels[idx];
    const g = gfx.pixels[idx + 1];
    const b = gfx.pixels[idx + 2];
    samples.push(chroma(r, g, b));
  }

  const anchors = [];
  const numAnchors = 3 + floor(random(3));

  for (let i = 0; i < numAnchors; i++) {
    const c = random(samples);
    anchors.push(c);
  }

  const hexAnchors = anchors.map((c) => c.hex());

  palette = chroma.scale(hexAnchors).mode("lab").colors(NUM_CORES);

  ajustarCorDoMeio();

  selectedIndex = -1;
  usingImagePalette = true;
  mostrarMensagem("Paleta gerada a partir da imagem");
}

// ---------- HANDLER DO UPLOAD ----------
function handleFile(file) {
  if (file.type === "image") {
    loadImage(file.data, (img) => {
      imgSource = img;
      gerarPaletaFromImage();
    });
  } else {
    mostrarMensagem("Por favor escolhe um ficheiro de imagem.");
  }
}

// ---------- DESENHO DA PALETA PRINCIPAL ----------
function desenharPalette() {
  if (!palette || palette.length === 0) return;

  const colWidth = width / NUM_CORES;

  noStroke();
  fill(0, 150);
  rect(12, paletteY + 6, width - 24, paletteH + 10, 14);

  for (let i = 0; i < NUM_CORES; i++) {
    const hex = palette[i];
    const x = i * colWidth;
    const y = paletteY;

    noStroke();
    fill(hex);
    rect(x + 6, y, colWidth - 12, paletteH, 10);

    if (i === selectedIndex) {
      noFill();
      stroke(255);
      strokeWeight(3);
      rect(x + 6, y, colWidth - 12, paletteH, 10);
      noStroke();
    }

    fill(0, 160);
    const labelY = y + paletteH - 24;
    rect(x + 10, labelY, colWidth - 20, 18, 6);

    fill(255);
    textAlign(CENTER, CENTER);
    textSize(13);
    text(hex.toUpperCase(), x + colWidth / 2, labelY + 9);
  }
}

// ---------- GRADIENTE ----------
function desenharGradient() {
  if (!palette || palette.length === 0) return;

  const grad = chroma.scale(palette).mode("lab");

  noStroke();
  fill(0, 140);
  rect(18, gradientY - 8, width - 36, gradientH + 24, 12);

  for (let x = 0; x < width - 40; x++) {
    const t = x / (width - 40 - 1);
    const c = grad(t).hex();
    fill(c);
    rect(20 + x, gradientY, 1, gradientH, 4);
  }

  fill(230);
  textAlign(LEFT, CENTER);
  textSize(12);
  const txt = usingImagePalette
    ? "Paleta gerada a partir da imagem (gradiente entre as cores)"
    : "Paleta random gerada com chroma.js (gradiente suave entre as cores)";
  text(txt, 24, gradientY - 14);
}

// ---------- GUARDAR PALETAS ----------
function guardarPaleta() {
  if (!palette || palette.length === 0) return;
  savedPalettes.push([...palette]);
  mostrarMensagem("Paleta guardada (tecla S)");
}

function desenharSavedPalettes() {
  const startY = gradientY + gradientH + 30;
  const lineH = 24;
  const swatchSize = 16;

  // painel para as paletas guardadas
  noStroke();
  fill(0, 120);
  rect(18, startY - 22, width - 36, 170, 12);

  if (savedPalettes.length === 0) {
    fill(190);
    textAlign(LEFT, TOP);
    textSize(12);
    text("Sem paletas guardadas (prime S para guardar)", 26, startY - 4);
    return;
  }

  fill(220);
  textAlign(LEFT, TOP);
  textSize(12);
  text("Paletas guardadas:", 26, startY - 4);

  for (let i = 0; i < savedPalettes.length; i++) {
    const pal = savedPalettes[i];
    const y = startY + 4 + (i + 1) * lineH;

    for (let j = 0; j < pal.length; j++) {
      const x = 170 + j * (swatchSize + 6);
      fill(pal[j]);
      noStroke();
      rect(x, y, swatchSize, swatchSize, 4);
    }
  }
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

  fill(0, 190);
  noStroke();
  rect(
    width / 2 - boxWidth / 2,
    height - 90,           // <<-- subido (antes -70)
    boxWidth,
    boxHeight,
    10
  );

  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  text(msg, width / 2, height - 90 + boxHeight / 2);
}
