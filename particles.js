import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GPUComputationRenderer } from 'three/addons/misc/GPUComputationRenderer.js';

// --- Configuração ---
const WIDTH = 512;
const PARTICLES = WIDTH * WIDTH;
let containerEl;

// --- Shaders ---
const fragmentShaderPosition = `
    uniform float time;
    uniform float delta;
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 tmpPos = texture2D(texturePosition, uv);
        vec3 pos = tmpPos.xyz;
        vec4 tmpVel = texture2D(textureVelocity, uv);
        vec3 vel = tmpVel.xyz;
        pos += vel * delta;
        gl_FragColor = vec4(pos, 1.0);
    }
`;

const fragmentShaderVelocity = `
    uniform float time;
    uniform float delta;
    uniform vec3 attractorPos[3];
    uniform vec3 attractorAxis[3];
    
    const float G = 50.0; 
    const float maxSpeed = 8.0;
    const float damp = 0.98;
    const float spinStrength = 2.0;

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec3 pos = texture2D(texturePosition, uv).xyz;
        vec3 vel = texture2D(textureVelocity, uv).xyz;
        vec3 force = vec3(0.0);

        for(int i = 0; i < 3; i++) {
            vec3 target = attractorPos[i];
            vec3 axis = attractorAxis[i];
            vec3 diff = target - pos;
            float dist = length(diff);
            vec3 dir = normalize(diff);
            dist = max(dist, 0.5); 
            float gravity = G / (dist * dist);
            force += dir * gravity;
            vec3 spinForce = cross(axis, diff);
            force += normalize(spinForce) * (gravity * spinStrength);
        }
        vel += force * delta;
        float speed = length(vel);
        if (speed > maxSpeed) {
            vel = normalize(vel) * maxSpeed;
        }
        vel *= damp;
        gl_FragColor = vec4(vel, 1.0);
    }
`;

const vertexShaderRender = `
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;
    varying vec3 vVelocity;
    varying float vSpeed;

    void main() {
        vec4 posTex = texture2D(texturePosition, position.xy);
        vec3 pos = posTex.xyz;
        vec3 vel = texture2D(textureVelocity, position.xy).xyz;
        vVelocity = vel;
        vSpeed = length(vel);
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (2.0 / -mvPosition.z) * 15.0; 
    }
`;

const fragmentShaderRender = `
    varying vec3 vVelocity;
    varying float vSpeed;
    uniform sampler2D gradientMap;
    uniform float time; // <--- Novo uniform

    void main() {
        // Velocidade normalizada (0.0 a 1.0)
        float speedT = smoothstep(0.0, 8.0, vSpeed);
        
        // Fator de deslocamento temporal (ajusta o 0.1 para mudar a velocidade da rotação de cor)
        float colorShift = time * 0.1; 
        
        // Somamos a velocidade com o tempo. 
        // A função fract() garante que o valor fica sempre entre 0.0 e 1.0 (loop)
        float finalT = fract(speedT - colorShift); 

        vec3 finalColor = texture2D(gradientMap, vec2(finalT, 0.5)).rgb;
        
        vec2 coord = gl_PointCoord - vec2(0.5);
        if(length(coord) > 0.5) discard;
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// --- Variáveis Globais ---
let scene, camera, renderer, controls;
let gpuCompute;
let velocityVariable, positionVariable;
let material, mesh;
let uniformAttractors, uniformAttractorAxes;
let gradientTexture;
const CLOUD_RADIUS = 10.0;

let aspect = 1; 
let isLandscape = true;
let spread = 0;

const randPhase = [ 
    10 + Math.random() * 90,
    10 + Math.random() * 90,
    10 + Math.random() * 90
];
const randSpeed = [
    0.75 + Math.random() * 0.5,
    0.75 + Math.random() * 0.5,
    0.75 + Math.random() * 0.5
];

// --- Inicialização ---
function generateGradientTexture(hexPalette) {
    const size = 256; 
    const data = new Uint8Array(size * 4); 
    
    let paletteToUse = (hexPalette && hexPalette.length > 0) ? [...hexPalette] : ['#ffffff', '#000000'];

    if (paletteToUse.length > 1) {
        paletteToUse.push(paletteToUse[0]);
    }

    const scale = window.chroma.scale(paletteToUse).mode('lch'); 

    for (let i = 0; i < size; i++) {
        const t = i / (size - 1);
        const color = scale(t).rgb(); 
        
        data[i * 4] = color[0];
        data[i * 4 + 1] = color[1];
        data[i * 4 + 2] = color[2];
        data[i * 4 + 3] = 255; 
    }

    const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);

    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    texture.needsUpdate = true;
    return texture;
}
init();
animate();

function init() {
    containerEl = document.getElementById('particle-section');
    if (!containerEl) {
        console.error("Container #particle-section não encontrado!");
        return;
    }

    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    aspect = width / height;
    isLandscape = aspect > 1.0;
    spread = isLandscape ? (CLOUD_RADIUS * aspect / 2) : CLOUD_RADIUS / 2;

    // Camera
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(0, 0, 30);

    scene = new THREE.Scene();

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000);
    containerEl.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enableZoom = false;

    initGPGPU();
    initParticles();
    
    // Resize Listener
    window.addEventListener('resize', onWindowResize);
}

function initGPGPU() {
    gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

    if (renderer.capabilities.isWebGL2 === false) {
        gpuCompute.setDataType(THREE.HalfFloatType);
    }

    const dtPosition = gpuCompute.createTexture();
    const dtVelocity = gpuCompute.createTexture();

    fillTextures(dtPosition, dtVelocity);

    velocityVariable = gpuCompute.addVariable("textureVelocity", fragmentShaderVelocity, dtVelocity);
    positionVariable = gpuCompute.addVariable("texturePosition", fragmentShaderPosition, dtPosition);

    gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable]);
    gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable]);

    uniformAttractors = { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] };
    uniformAttractorAxes = { value: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)] };

    velocityVariable.material.uniforms.time = { value: 0.0 };
    velocityVariable.material.uniforms.delta = { value: 0.0 };
    velocityVariable.material.uniforms.attractorPos = uniformAttractors;
    velocityVariable.material.uniforms.attractorAxis = uniformAttractorAxes;

    positionVariable.material.uniforms.time = { value: 0.0 };
    positionVariable.material.uniforms.delta = { value: 0.0 };

    const error = gpuCompute.init();
    if (error !== null) console.error(error);
}

function fillTextures(texturePos, textureVel) {
    const posArray = texturePos.image.data;
    const velArray = textureVel.image.data;

    for (let i = 0; i < posArray.length; i += 4) {
        let x = Math.random() * 2 - 1;
        let y = Math.random() * 2 - 1;
        let z = Math.random() * 2 - 1;
        const mag = Math.sqrt(x * x + y * y + z * z) || 1;
        const r = Math.random() * CLOUD_RADIUS;

        posArray[i + 0] = (x / mag) * r * aspect;
        posArray[i + 1] = (y / mag) * r;
        posArray[i + 2] = isLandscape ? (z / mag) * r : (z / mag) * r * aspect;
        posArray[i + 3] = 1;

        velArray[i + 0] = (Math.random() - 0.5) * 0.1;
        velArray[i + 1] = (Math.random() - 0.5) * 0.1;
        velArray[i + 2] = (Math.random() - 0.5) * 0.1;
        velArray[i + 3] = 1;
    }
}

function initParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLES * 3);

    let p = 0;
    for (let i = 0; i < WIDTH; i++) {
        for (let j = 0; j < WIDTH; j++) {
            positions[p++] = j / (WIDTH - 1);
            positions[p++] = i / (WIDTH - 1);
            positions[p++] = 0;
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    gradientTexture = generateGradientTexture(['#5900ff', '#ffae73']); 

    material = new THREE.ShaderMaterial({
        uniforms: {
            texturePosition: { value: null },
            textureVelocity: { value: null },
            gradientMap: { value: gradientTexture },
            time: { value: 0.0 }
        },
        vertexShader: vertexShaderRender,
        fragmentShader: fragmentShaderRender,
        blending: THREE.NormalBlending,
        depthWrite: false,
        transparent: true
    });

    mesh = new THREE.Points(geometry, material);
    scene.add(mesh);
}

// --- INTEGRAÇÃO COM A PALETA ---
window.updateParticleColors = function(newPalette) {
    if (!material) return;
    
    const newTexture = generateGradientTexture(newPalette);
    
    const oldTexture = material.uniforms.gradientMap.value;
    material.uniforms.gradientMap.value = newTexture;
    
    if (oldTexture) oldTexture.dispose();
};

function onWindowResize() {
    if (!containerEl) return;
    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    
    aspect = width / height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
    
    isLandscape = aspect > 1.0;
    spread = isLandscape ? (CLOUD_RADIUS * aspect / 2) : CLOUD_RADIUS / 2;
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;
    const delta = 0.016;

    // Parâmetros de oscilação
    const ampLong = spread * 0.6;
    const ampShort = CLOUD_RADIUS * 0.35;
    const ampDepth = isLandscape ? CLOUD_RADIUS * 0.35 : spread;

    // Atratores periféricos
    if (isLandscape) {
        uniformAttractors.value[0].set(
            -spread + Math.sin((time + randPhase[0] * 0.6) * randSpeed[0]) * ampLong,
            Math.cos((time + randPhase[0] * 0.8) * randSpeed[0]) * ampShort,
            Math.sin((time + randPhase[0] * 1.2) * randSpeed[0]) * ampDepth
        );
        uniformAttractors.value[1].set(
            spread + Math.cos((time + randPhase[1] * 0.7) * randSpeed[1]) * ampLong,
            Math.sin((time + randPhase[1] * 0.5) * randSpeed[1]) * ampShort,
            Math.cos((time + randPhase[1] * 0.9) * randSpeed[1]) * ampDepth
        );
    } else {
        uniformAttractors.value[0].set(
            Math.sin((time + randPhase[0] * 0.5) * randSpeed[0]) * ampShort,
            spread + Math.cos((time + randPhase[0] * 0.3) * randSpeed[0]) * ampLong,
            Math.sin((time + randPhase[0] * 0.2) * randSpeed[0]) * ampDepth
        );
        uniformAttractors.value[1].set(
            Math.cos((time + randPhase[1] * 0.4) * randSpeed[1]) * ampShort,
            -spread + Math.sin((time + randPhase[1] * 0.5) * randSpeed[1]) * ampLong,
            Math.cos((time + randPhase[1] * 0.3) * randSpeed[1]) * ampDepth
        );
    }

    // Atrator central
    uniformAttractors.value[2].set(
        Math.sin((time + randPhase[2] * 1.2) * randSpeed[2]) * (isLandscape ? ampLong * 1.5 : ampShort * 1.5),
        Math.sin((time + randPhase[2] * 0.7) * randSpeed[2]) * (isLandscape ? ampShort * 1.5 : ampLong * 1.5),
        Math.cos((time + randPhase[2] * 0.9) * randSpeed[2]) * ampDepth
    );
    

    velocityVariable.material.uniforms.time.value = time;
    velocityVariable.material.uniforms.delta.value = delta;
    positionVariable.material.uniforms.time.value = time;
    positionVariable.material.uniforms.delta.value = delta;

    gpuCompute.compute();

    if (material) {
        material.uniforms.time.value = time;
    }

    material.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    material.uniforms.textureVelocity.value = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

    controls.update();
    renderer.render(scene, camera);
}