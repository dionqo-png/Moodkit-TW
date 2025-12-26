// utils/gl.js
// Helpers WebGL2: compilar shaders, criar texturas/FBOs, VAO full-screen quad,
// e utilitários de uniformes. Comentários focam partes críticas.

export function createGL(canvas) {
  /** @type {WebGL2RenderingContext|null} */
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  return gl;
}

function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error:\n" + info);
  }
  return sh;
}

export function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("Program link error:\n" + info);
  }
  return prog;
}

export function createQuadVAO(gl) {
  // VAO com um quad full-screen em NDC
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

  // 2 triângulos (6 verts), aPos (vec2)
  const verts = new Float32Array([
    -1, -1,   1, -1,   -1,  1,
    -1,  1,   1, -1,    1,  1
  ]);

  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  // layout(location=0) in vec2 aPos;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, vbo };
}

export function createTexture(gl, w, h, { linear = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);

  // RGBA8 é suficiente para este efeito, com boa compatibilidade.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function updateTextureFromElement(gl, tex, element, maxSize) {
  // Upload de vídeo/imagem para textura. Faz downscale pelo lado do GL via max texture size.
  // Nota: o canvas de saída controla o aspeto final; aqui queremos textura bem dimensionada.
  gl.bindTexture(gl.TEXTURE_2D, tex);

  // Upload direto: o GL faz conversão para RGBA.
  // (Sem mipmaps, clamp-to-edge, para compatibilidade e performance.)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // Para vídeo: element.videoWidth/Height; para imagem: naturalWidth/Height.
  // Aqui não redimensionamos via CPU; o resize é tratado nas passagens/fbos.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);

  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function createFBO(gl, tex) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    throw new Error("Framebuffer incompleto: " + status);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

export function setUniform(gl, program, name, value) {
  const loc = gl.getUniformLocation(program, name);
  if (loc == null) return;

  if (typeof value === "number") {
    // float ou int? aqui assumimos float; para int usa setUniformInt
    gl.uniform1f(loc, value);
    return;
  }
  if (typeof value === "boolean") {
    gl.uniform1i(loc, value ? 1 : 0);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 2) gl.uniform2f(loc, value[0], value[1]);
    else if (value.length === 3) gl.uniform3f(loc, value[0], value[1], value[2]);
    else if (value.length === 4) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
    return;
  }
}

export function setUniformInt(gl, program, name, v) {
  const loc = gl.getUniformLocation(program, name);
  if (loc == null) return;
  gl.uniform1i(loc, v | 0);
}

export function bindTex(gl, tex, unit, uniformLoc) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(uniformLoc, unit);
}

export function drawFullscreen(gl, vao) {
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.bindVertexArray(null);
}

export function resizeCanvasTo(canvas, sizePx) {
  canvas.width = sizePx;
  canvas.height = sizePx;
}

export function nowSec() {
  return performance.now() / 1000;
}
