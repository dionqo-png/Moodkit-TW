# CRT Toolbox (WebGL2 multipass)

Projeto “toolbox clean” que aplica um filtro CRT de alta qualidade com WebGL2 (multipass),
com fallback Canvas2D se WebGL falhar. Suporta:

- Upload de imagem (PNG/JPEG) + export (Guardar imagem)
- Webcam em tempo real (getUserMedia)
  - Capturar foto (PNG)
  - Gravar 5 segundos (MediaRecorder) -> WebM (tenta MP4 quando suportado)

## Como abrir no VS Code
1) Abre a pasta `crt-toolbox/` no Visual Studio Code.
2) Confirma que a estrutura de ficheiros está igual à indicada.

## Como correr localmente
Vs server live

