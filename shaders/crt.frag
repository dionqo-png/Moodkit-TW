#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTex0;     // input principal do pass
uniform sampler2D uBloomTex; // textura bloom (half-res upsample)
uniform sampler2D uGlyphTex; // atlas ASCII
uniform sampler2D uMapTex;   // distortion map
uniform vec2 uTexel;         // 1.0 / size do target atual
uniform vec2 uSourceTexel;   // 1.0 / size da fonte
uniform vec2 uResolution;    // resolução do target atual
uniform float uTime;
uniform int uPass;           // 0 preprocess, 1 crt/ascii/distort, 2 bloomExtract, 3 blur, 4 composite+aberr, 5 tonemap, 6 ca init, 7 ca step, 8 ca colorize
uniform int uFilterMode;     // 0=CRT, 1=ASCII, 2=CA, 3=DISTORT

// ----------- PARAMS (Estado) -----------
uniform int uShowEffect;

uniform float uPreBlur;
uniform float uPreGrain;
uniform float uPreGamma;
uniform float uPreBlack;
uniform float uPreWhite;

uniform int uCRTType;        // 0 monitor, 1 tv, 2 lcd
uniform float uDistortion;
uniform float uDotScale;
uniform float uDotPitch;
uniform float uFalloff;
uniform float uGlowRadius;
uniform float uGlowIntensity;

uniform int uBloomMode;      // 0 screen, 1 light, 2 hdr
uniform float uBloomThreshold;
uniform float uBloomIntensity;
uniform float uBloomRadius;

uniform vec2 uRedOffset;
uniform vec2 uBlueOffset;

// ASCII
uniform float uASCIICell;
uniform float uASCIIContrast;
uniform float uASCIIGamma;
uniform float uASCIIFgMix;
uniform int uASCIIColor;
uniform int uASCIIInvert;
uniform int uASCIICharset;
uniform int uASCIIUseCRT;
uniform int uASCIICharCount;

// CA
uniform float uCAThreshold;
uniform float uCACellSize;
uniform int uCAType;
uniform int uCASurvive; // packed lo/hi
uniform int uCABirth;   // packed lo/hi
uniform float uCAMix;
uniform vec3 uCABg;
uniform vec3 uCAFg;

// Distort
uniform int uHasMap;
uniform float uDistThreshold;
uniform float uDistX;
uniform float uDistY;
uniform float uDistScale;
uniform int uDistPre;

// Color palette
uniform int uColorMode;      // 0 off, 1 sepia, 2 mono, 3 high, 4 vapor
uniform float uColorIntensity;

// ----------- Helpers -----------
float saturate(float x){ return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x){ return clamp(x, 0.0, 1.0); }

float hash12(vec2 p){
  vec3 p3  = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 barrelDistort(vec2 uv, float k){
  // uv 0..1 -> -1..1
  vec2 p = uv * 2.0 - 1.0;
  float r2 = dot(p,p);
  // k > 0 = barrel, k < 0 = pincushion
  p *= (1.0 + k * r2);
  return p * 0.5 + 0.5;
}

vec3 applyLevelsGamma(vec3 c, float blackP, float whiteP, float gammaV){
  float b = blackP / 255.0;
  float w = whiteP / 255.0;
  vec3 x = (c - vec3(b)) / max(vec3(1e-6), vec3(w - b));
  x = saturate(x);
  // gamma: assume input is linear-ish; apply pow for artistic control
  x = pow(x, vec3(1.0 / max(1e-6, gammaV)));
  return x;
}

// scanlines (horizontais) + leve “aperto” de contraste
float scanlines(vec2 uv, float strength){
  float y = uv.y * uResolution.y;
  float s = sin(y * 3.14159);     // alterna
  float line = mix(0.85, 1.0, 0.5 + 0.5*s);
  return mix(1.0, line, strength);
}

// máscara de subpíxeis (moiré controlado por dotPitch/dotScale)
vec3 subpixelMask(vec2 uv, float pitch, float scale, int crtType){
  // pitch em “pixels”, scale controla contraste da máscara
  float x = (uv.x * uResolution.x) / max(1e-6, pitch);
  float tri = fract(x);
  vec3 m;

  // “monitor”: stripes RGB
  if (crtType == 0){
    m = vec3(step(0.0, tri) * (1.0 - step(1.0/3.0, tri)),
             step(1.0/3.0, tri) * (1.0 - step(2.0/3.0, tri)),
             step(2.0/3.0, tri));
  }
  // “tv”: máscara mais suave/compacta (menos agressiva)
  else if (crtType == 1){
    float r = smoothstep(0.00, 0.25, 0.33 - abs(tri - 0.16));
    float g = smoothstep(0.00, 0.25, 0.33 - abs(tri - 0.50));
    float b = smoothstep(0.00, 0.25, 0.33 - abs(tri - 0.84));
    m = vec3(r,g,b);
  }
  // “lcd”: máscara quase neutra
  else {
    m = vec3(1.0);
  }

  // escala/contraste
  m = mix(vec3(1.0), m, saturate(scale));
  return m;
}

vec3 curveByType(vec3 c, int t){
  // pequenas curvas por preset
  if (t == 0){ // Monitor: mais punch e saturação
    c = pow(c, vec3(0.95));
    c *= vec3(1.03, 1.01, 1.00);
  } else if (t == 1){ // TV: ligeiramente quente e soft
    c = pow(c, vec3(1.05));
    c *= vec3(1.03, 1.00, 0.98);
  } else { // LCD: mais limpo
    c = pow(c, vec3(1.0));
  }
  return c;
}

vec3 bloomBlend(vec3 base, vec3 bloom, int mode, float intensity){
  bloom *= intensity;

  if (mode == 0){
    // Screen: 1 - (1-a)(1-b)
    return vec3(1.0) - (vec3(1.0)-base)*(vec3(1.0)-bloom);
  } else if (mode == 1){
    // Light: “add suave”
    return base + bloom * 0.6;
  } else {
    // HDR-ish: add + compress
    vec3 x = base + bloom;
    return x / (vec3(1.0) + x);
  }
}

  // tonemapping simples (filmic-ish)
vec3 tonemap(vec3 x){
  // curva tipo ACES simplificada
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return saturate((x*(a*x + b)) / (x*(c*x + d) + e));
}

vec3 applyPalette(vec3 c){
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 t = c;

  if (uColorMode == 1){
    t = vec3(l) * vec3(1.12, 1.02, 0.88);
  } else if (uColorMode == 2){
    t = vec3(l);
  } else if (uColorMode == 3){
    t = clamp((c - vec3(0.5)) * vec3(1.35) + vec3(0.5), 0.0, 1.0);
    t = mix(t, vec3(step(0.5, t.r), step(0.5, t.g), step(0.5, t.b)), 0.08);
  } else if (uColorMode == 4){
    vec3 vib = vec3(1.05, 0.72, 1.18);
    t = saturate(vec3(c.r * 1.05 + 0.10, c.g * 0.75 + 0.05, c.b * 1.20 + 0.08) * vib);
  }

  return mix(c, t, saturate(uColorIntensity));
}

vec3 sampleRGBOffsets(sampler2D tex, vec2 uv, vec2 redOff, vec2 blueOff){
  vec3 col;
  float r = texture(tex, uv + redOff).r;
  float g = texture(tex, uv).g;
  float b = texture(tex, uv + blueOff).b;
  col = vec3(r,g,b);
  return col;
}

// blur rápido (Kawase-like) por 4 taps (usado no ping-pong)
vec3 kawase4(sampler2D tex, vec2 uv, vec2 texel, float radius){
  vec2 o = texel * radius;
  vec3 c = vec3(0.0);
  c += texture(tex, uv + vec2(-o.x, -o.y)).rgb;
  c += texture(tex, uv + vec2( o.x, -o.y)).rgb;
  c += texture(tex, uv + vec2(-o.x,  o.y)).rgb;
  c += texture(tex, uv + vec2( o.x,  o.y)).rgb;
  return c * 0.25;
}

void main(){
  // Se “Mostrar efeito” estiver off: pass-through
  if (uShowEffect == 0){
    fragColor = texture(uTex0, vUV);
    return;
  }

  if (uPass == 0){
    // PREPROCESS: levels/gamma + grain (blur é aplicado via passes JS)
    vec3 c = texture(uTex0, vUV).rgb;
    c = applyLevelsGamma(c, uPreBlack, uPreWhite, uPreGamma);

    if (uPreGrain > 0.0){
      float n = hash12(vUV * uResolution + uTime * 60.0) - 0.5;
      c += n * uPreGrain * 0.08;
    }

    fragColor = vec4(saturate(c), 1.0);
    return;
  }

  if (uPass == 1){
    if (uFilterMode == 3) {
      // DISTORT MODE
      vec2 uv = vUV;
      float m = 0.0;
      if (uHasMap == 1) {
        vec2 muv = uv * uDistScale;
        vec3 mm = texture(uMapTex, fract(muv)).rgb;
        float l = dot(mm, vec3(0.2126,0.7152,0.0722));
        m = l;
      } else {
        vec2 p = uv * (180.0 * uDistScale);
        m = fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
      }

      float mask = smoothstep(uDistThreshold - 0.02, uDistThreshold + 0.02, m);
      vec2 shift = vec2(uDistX, uDistY) * (mask - 0.5) * 2.0;
      if (uDistPre == 1) shift *= 0.65;

      vec2 duv = uv + shift;
      vec3 col = texture(uTex0, duv).rgb;
      fragColor = vec4(col, 1.0);
      return;
    }

    if (uFilterMode == 1) {
      // ASCII MODE
      vec2 uv = vUV;
      if (uASCIIUseCRT == 1) {
        uv = barrelDistort(uv, uDistortion);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
          fragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
      }
      vec2 res = uResolution;
      float cell = max(2.0, uASCIICell);

      vec2 p = uv * res;
      vec2 cellId = floor(p / cell);
      vec2 cellUV = fract(p / cell);

      vec2 sampleP = (cellId * cell + cell * 0.5) / res;
      vec3 src = texture(uTex0, sampleP).rgb;

      float l = dot(src, vec3(0.2126, 0.7152, 0.0722));
      l = pow(l, 1.0 / max(0.001, uASCIIGamma));
      l = (l - 0.5) * uASCIIContrast + 0.5;
      l = clamp(l, 0.0, 1.0);
      if (uASCIIInvert == 1) l = 1.0 - l;

      if (uASCIICharset == 0) l = pow(l, 1.15);
      else if (uASCIICharset == 2) l = pow(l, 0.85);

      float count = float(max(1, uASCIICharCount));
      float gi = floor(l * (count - 1.0) + 0.5);
      float grid = 16.0;
      vec2 gxy = vec2(mod(gi, grid), floor(gi / grid));
      vec2 glyphUV = (gxy + cellUV) / grid;
      float a = texture(uGlyphTex, glyphUV).r;

      vec3 fg = (uASCIIColor == 1) ? src : vec3(l);
      vec3 outCol = mix(vec3(0.0), fg, a);
      outCol = mix(outCol, src, clamp(uASCIIFgMix, 0.0, 1.0));

      if (uASCIIUseCRT == 1) {
        float scanStr = (uCRTType == 1) ? 0.55 : 0.35;
        scanStr = mix(scanStr, 0.15, float(uCRTType == 2));
        outCol *= scanlines(uv, scanStr);

        vec3 mask = subpixelMask(uv, uDotPitch, uDotScale, uCRTType);
        outCol *= mask;

        vec2 p2 = uv * 2.0 - 1.0;
        float r = dot(p2,p2);
        float v = 1.0 - uFalloff * r;
        outCol *= saturate(v);
      }

      outCol = applyPalette(outCol);
      fragColor = vec4(outCol, 1.0);
      return;
    }

    // CRT PASS: distort + scanlines + mask + falloff + glow seed
    vec2 uv = barrelDistort(vUV, uDistortion);

    // se estiver fora, pinta preto
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0){
      fragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec3 c = texture(uTex0, uv).rgb;
    c = curveByType(c, uCRTType);

    // scanlines: mais forte em TV, mais leve em monitor (LCD quase sem)
    float scanStr = (uCRTType == 1) ? 0.55 : 0.35;
    scanStr = mix(scanStr, 0.15, float(uCRTType == 2));
    c *= scanlines(uv, scanStr);

    // máscara RGB / moiré
    vec3 mask = subpixelMask(uv, uDotPitch, uDotScale, uCRTType);
    c *= mask;

    // falloff: escurece bordas (vignette)
    vec2 p = uv * 2.0 - 1.0;
    float r = dot(p,p);
    float v = 1.0 - uFalloff * r;
    c *= saturate(v);

    // “glow seed” para bloom
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    float glow = smoothstep(0.65, 1.0, luma) * uGlowIntensity;
    c += glow * 0.05;

    fragColor = vec4(saturate(c), 1.0);
    return;
  }

  if (uPass == 2){
    // BLOOM EXTRACT: threshold -> highlights
    vec3 c = texture(uTex0, vUV).rgb;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float t = max(0.0, l - uBloomThreshold);
    vec3 outc = c * t * 2.0;
    fragColor = vec4(outc, 1.0);
    return;
  }

  if (uPass == 3){
    // BLUR PASS (ping-pong): Kawase-like
    vec3 c = kawase4(uTex0, vUV, uTexel, uBloomRadius);
    fragColor = vec4(c, 1.0);
    return;
  }

  if (uPass == 6){
    // CA INIT
    vec2 res = uResolution;
    float cell = max(1.0, uCACellSize);
    vec2 p = vUV * res;
    vec2 cid = floor(p / cell);
    vec2 center = (cid * cell + cell * 0.5) / res;
    vec3 src = texture(uTex0, center).rgb;
    float l = dot(src, vec3(0.2126,0.7152,0.0722));
    float s = step(uCAThreshold, l);
    fragColor = vec4(s, s, s, 1.0);
    return;
  }

  if (uPass == 7){
    // CA STEP
    vec2 res = uResolution;
    float cell = max(1.0, uCACellSize);
    vec2 p = vUV * res;
    vec2 cid = floor(p / cell);
    vec2 center = (cid * cell + cell * 0.5) / res;
    vec2 o = vec2(cell) / res;

    float sC = texture(uTex0, center).r;

    float n = 0.0;
    n += texture(uTex0, center + vec2(-o.x, -o.y)).r;
    n += texture(uTex0, center + vec2( 0.0, -o.y)).r;
    n += texture(uTex0, center + vec2( o.x, -o.y)).r;
    n += texture(uTex0, center + vec2(-o.x,  0.0)).r;
    n += texture(uTex0, center + vec2( o.x,  0.0)).r;
    n += texture(uTex0, center + vec2(-o.x,  o.y)).r;
    n += texture(uTex0, center + vec2( 0.0,  o.y)).r;
    n += texture(uTex0, center + vec2( o.x,  o.y)).r;

    float sLo = float(uCASurvive & 15);
    float sHi = float((uCASurvive >> 4) & 15);
    float bLo = float(uCABirth & 15);
    float bHi = float((uCABirth >> 4) & 15);

    float nn = n;
    if (uCAType == 1) nn = n * 1.05;
    else if (uCAType == 2) nn = n + step(0.5, sC);
    else if (uCAType == 3) nn = max(0.0, n - 0.25);

    float nextS = 0.0;
    if (sC > 0.5) {
      nextS = step(sLo, nn) * step(nn, sHi);
    } else {
      nextS = step(bLo, nn) * step(nn, bHi);
    }

    fragColor = vec4(nextS, nextS, nextS, 1.0);
    return;
  }

  if (uPass == 8){
    // CA COLORIZE (usa uBloomTex como state)
    float s = texture(uBloomTex, vUV).r;
    vec3 src = texture(uTex0, vUV).rgb;
    vec3 caCol = mix(uCABg, uCAFg, s);
    vec3 outCol = mix(src, caCol, clamp(uCAMix, 0.0, 1.0));
    fragColor = vec4(outCol, 1.0);
    return;
  }

  if (uPass == 4){
    // COMPOSITE + ABERRATION:
    // - aplicar offsets R/B (convergence)
    // - misturar bloom
    vec2 redOff = uRedOffset;
    vec2 blueOff = uBlueOffset;

    vec3 base = sampleRGBOffsets(uTex0, vUV, redOff, blueOff);
    vec3 bloom = texture(uBloomTex, vUV).rgb;

    vec3 outc = bloomBlend(base, bloom, uBloomMode, uBloomIntensity);

    fragColor = vec4(saturate(outc), 1.0);
    return;
  }

  // TONEMAP
  vec3 c = texture(uTex0, vUV).rgb;
  c = tonemap(c);
  c = applyPalette(c);
  fragColor = vec4(c, 1.0);
}
