document.addEventListener("DOMContentLoaded", () => {
    // 1. INJECT HEADER
    fetch('header.html')
        .then(response => response.text())
        .then(data => {
            document.body.insertAdjacentHTML('afterbegin', data);
            highlightCurrentPage();
            
            // 2. INIT AUDIO AFTER HEADER IS READY
            initAudioSystem();
        });
});

function highlightCurrentPage() {
    const currentPath = window.location.pathname.split("/").pop() || "index.html";
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.style.opacity = '1';
            link.style.textDecoration = 'underline';
        }
    });
}

function initAudioSystem() {
    const checkbox = document.getElementById("audio-toggle-checkbox");
    
    // Audio Variables
    let audioCtx;
    let gainNode;
    let brownNoiseNode;

    // 1. CHECK SAVED STATE
    let shouldPlay = localStorage.getItem("moodkit_audio") === "true";
    
    // Set the checkbox visual state immediately
    if (shouldPlay) {
        checkbox.checked = true;
    }

    // 2. CHECKBOX EVENT LISTENER
    checkbox.addEventListener('change', function() {
        if (this.checked) {
            localStorage.setItem("moodkit_audio", "true");
            startAudio();
        } else {
            localStorage.setItem("moodkit_audio", "false");
            stopAudio();
        }
    });

    // 3. AUTO-START (If logic says it should be on)
    if (shouldPlay) {
        // We add a one-time click listener to the BODY to handle the 
        // "Autoplay Policy" if the browser blocks us.
        document.body.addEventListener('click', () => {
            if (checkbox.checked) startAudio();
        }, { once: true });
    }

    // --- SOUND GENERATION FUNCTIONS ---

    function startAudio() {
        // Create Context if it doesn't exist
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            
            // Master Volume
            gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.25; // Louder (25%)
            gainNode.connect(audioCtx.destination);
        }

        // Resume if suspended
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        // If sound not running, create it
        if (!brownNoiseNode) {
            createBrownNoise();
        }
    }

    function stopAudio() {
        if (audioCtx) {
            audioCtx.suspend();
        }
    }

    function createBrownNoise() {
        const bufferSize = 2 * audioCtx.sampleRate;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // Brown Noise Algorithm (Integration of White Noise)
        // This sounds like a deep rumble (Thunder/Waterfall)
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            
            // Integrate
            let out = (lastOut + (0.02 * white)) / 1.02;
            lastOut = out;
            
            // Normalize to prevent clipping (Brown noise can get loud)
            out *= 3.5; 
            
            data[i] = out;
        }

        brownNoiseNode = audioCtx.createBufferSource();
        brownNoiseNode.buffer = buffer;
        brownNoiseNode.loop = true;
        brownNoiseNode.connect(gainNode);
        brownNoiseNode.start(0);
    }
}