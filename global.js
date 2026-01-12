/* global.js */

/* ===============================
   1. INJECT STYLES
   =============================== */
const path = window.location.pathname;
const isIndex = path.endsWith("index.html") || path.endsWith("/") || path === "/";

/* ===============================
   2. INJECT STYLES (Only if NOT index)
   =============================== */
if (!isIndex) {
    const headerCss = document.createElement("link");
    headerCss.rel = "stylesheet";
    headerCss.href = "header.css";
    document.head.appendChild(headerCss);

    const footerCss = document.createElement("link");
    footerCss.rel = "stylesheet";
    footerCss.href = "footer.css";
    document.head.appendChild(footerCss);
}

/* ===============================
   2. INITIALIZE ON LOAD
   =============================== */
document.addEventListener("DOMContentLoaded", () => {

    // A. Start Sound Engine Immediately (Loads memory)
    SoundManager.init();

    // B. Load Header & Footer
    if (!isIndex) {
        fetch('header.html')
            .then(r => r.text())
            .then(data => {
                document.body.insertAdjacentHTML('afterbegin', data);
                highlightCurrentPage();
                setupGlobalAudioToggle(); // Connect the mute button
            });

        fetch('footer.html')
            .then(r => r.text())
            .then(data => {
                document.body.insertAdjacentHTML('beforeend', data);
            });
    }
});

function highlightCurrentPage() {
    let currentPath = window.location.pathname.split("/").pop();
    if (currentPath === "" || currentPath === "index.html") currentPath = "home.html";
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active-link');
        }
    });
}

/* ===============================
   3. MUTE TOGGLE LOGIC
   =============================== */
function setupGlobalAudioToggle() {
    // Small delay to ensure HTML is painted
    setTimeout(() => {
        const checkbox = document.getElementById("audio-toggle-checkbox");
        const icon = document.querySelector(".audio-control .icon");

        if (!checkbox) return;

        // Sync visual state with Engine
        checkbox.checked = !SoundManager.globalMute;
        updateMuteIcon(SoundManager.globalMute, icon);

        // Click Listener
        checkbox.addEventListener("change", e => {
            const isSoundOn = e.target.checked;
            const shouldMute = !isSoundOn;

            SoundManager.setGlobalMute(shouldMute);
            updateMuteIcon(shouldMute, icon);
        });
    }, 50);
}

function updateMuteIcon(isMuted, iconElement) {
    if (!iconElement) return;
    iconElement.textContent = isMuted ? "🔇" : "🔊";
    iconElement.style.opacity = isMuted ? "0.5" : "1";
}

/* =========================================
   4. SOUND MANAGER ENGINE
   ========================================= */
const SoundManager = {
    ctx: null,
    globalMute: false,
    activeProfile: null,
    currentSelection: null,
    initialized: false,

    // DATA (Your Paths)
    profiles: {
        fire: {
            masterVol: 0.5,
            gainNode: null,
            sounds: {
                flame: { src: 'sounds/flames.mp3', vol: 0.7, active: false, el: null, source: null },
                wood: { src: 'sounds/fire.mp3', vol: 0.5, active: false, el: null, source: null }
            }
        },
        water: {
            masterVol: 0.5,
            gainNode: null,
            sounds: {
                rain: { src: 'sounds/rain.mp3', vol: 0.6, active: false, el: null, source: null },
                thunder: { src: 'sounds/thunder.mp3', vol: 0.4, active: false, el: null, source: null }
            }
        },
        earth: {
            masterVol: 0.5,
            gainNode: null,
            sounds: {
                forest: { src: 'sounds/leaves.mp3', vol: 0.6, active: false, el: null, source: null },
                birds: { src: 'sounds/birds.mp3', vol: 0.3, active: false, el: null, source: null },
                wind: { src: 'sounds/wind.mp3', vol: 0.4, active: false, el: null, source: null }
            }
        }
    },

    init() {
        if (this.initialized) return;
        console.log("🔊 SoundManager Initialized");

        // 1. Load Mute State
        this.globalMute = localStorage.getItem("moodkit_mute") === "true";

        // 2. Load Memory (Profile + Active Sounds)
        const savedProfile = localStorage.getItem("moodkit_profile");
        const savedFeatures = JSON.parse(localStorage.getItem("moodkit_features") || "[]");

        if (savedProfile && this.profiles[savedProfile]) {
            this.activeProfile = savedProfile;
            this.currentSelection = { type: "master", profile: savedProfile };

            // Mark sounds as active in data
            savedFeatures.forEach(key => {
                if (this.profiles[savedProfile].sounds[key]) {
                    this.profiles[savedProfile].sounds[key].active = true;
                }
            });

            // Attempt to play immediately (might get blocked)
            this.setupContext();
            this.restorePlayback();
        }

        // 3. THE FAILSAFE (Crucial for Persistence)
        // If browser blocked audio on page load, this unmutes it on the first click.
        const unlockAudio = () => {
            if (!this.ctx) this.setupContext();
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
            // Retry playing sounds
            this.restorePlayback();
        };

        // Listen for ANY interaction to unlock sound
        document.addEventListener('click', unlockAudio, { once: true });
        document.addEventListener('keydown', unlockAudio, { once: true });

        this.initialized = true;
    },

    restorePlayback() {
        if (!this.activeProfile || this.globalMute) return;

        const p = this.profiles[this.activeProfile];

        // Restore Master Volume
        if (p.gainNode) {
            p.gainNode.gain.value = p.masterVol;
        }

        // Restore Individual Sounds
        Object.keys(p.sounds).forEach(key => {
            if (p.sounds[key].active) {
                this.playFeature(this.activeProfile, key);
            }
        });
    },

    /* ===== ACTIONS ===== */

    activateProfile(profileName) {
        if (!this.setupContext()) return;

        // 1. Stop other profiles
        Object.keys(this.profiles).forEach(p => {
            if (p !== profileName) this.stopProfile(p);
        });

        this.activeProfile = profileName;
        const p = this.profiles[profileName];

        // 2. ACTIVATE ALL SOUNDS (This makes the Big Bubble auto-play everything)
        Object.keys(p.sounds).forEach(key => {
            const sound = p.sounds[key];
            sound.active = true;
            this.playFeature(profileName, key);
        });

        // 3. Selection & Save
        this.currentSelection = { type: "master", profile: profileName };
        this.saveState();

        // 4. Update UI
        window.dispatchEvent(new CustomEvent("profile-changed"));
        window.dispatchEvent(new CustomEvent("volume-updated", { detail: p.masterVol }));
    },

    toggleFeature(profileName, featureKey) {
        if (!this.setupContext()) return;

        if (this.activeProfile !== profileName) {
            this.activateProfile(profileName);
        }

        const feature = this.profiles[profileName].sounds[featureKey];
        feature.active = !feature.active;

        feature.active
            ? this.playFeature(profileName, featureKey)
            : this.stopFeature(profileName, featureKey);

        this.currentSelection = { type: "feature", profile: profileName, key: featureKey };
        this.saveState();
    },

    setGlobalMute(shouldMute) {
        this.globalMute = shouldMute;
        localStorage.setItem("moodkit_mute", shouldMute);
        this.applyGlobalMute();
    },

    applyGlobalMute() {
        if (!this.ctx) return;

        Object.values(this.profiles).forEach(profile => {
            if (!profile.gainNode) return;
            const targetVol = this.globalMute ? 0 : profile.masterVol;
            profile.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
            profile.gainNode.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
        });
    },

    /* ===== INTERNAL HELPERS ===== */

    setupContext() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();

            Object.values(this.profiles).forEach(profile => {
                profile.gainNode = this.ctx.createGain();
                profile.gainNode.gain.value = profile.masterVol;
                profile.gainNode.connect(this.ctx.destination);
            });
            this.applyGlobalMute();
        }
        return this.ctx;
    },

    saveState() {
        if (this.activeProfile) {
            localStorage.setItem("moodkit_profile", this.activeProfile);
        }

        const activeFeats = [];
        if (this.activeProfile) {
            const p = this.profiles[this.activeProfile];
            Object.keys(p.sounds).forEach(key => {
                if (p.sounds[key].active) activeFeats.push(key);
            });
        }
        localStorage.setItem("moodkit_features", JSON.stringify(activeFeats));
    },

    stopProfile(profileName) {
        Object.keys(this.profiles[profileName].sounds)
            .forEach(key => this.stopFeature(profileName, key));
        localStorage.removeItem("moodkit_profile");
    },

    stopFeature(profileName, featureKey) {
        const s = this.profiles[profileName].sounds[featureKey];
        s.active = false;
        if (s.el) {
            s.el.pause();
            s.el.currentTime = 0;
        }
        this.saveState();
    },

    adjustVolume(percent) {
        if (!this.currentSelection) return;
        const { type, profile, key } = this.currentSelection;

        if (type === "master") {
            this.profiles[profile].masterVol = percent;
            if (!this.globalMute) {
                this.profiles[profile].gainNode.gain.setTargetAtTime(percent, this.ctx.currentTime, 0.1);
            }
        } else {
            const s = this.profiles[profile].sounds[key];
            s.vol = percent;
            if (s.el) s.el.volume = percent;
        }
        window.dispatchEvent(new CustomEvent("volume-updated", { detail: percent }));
    },

    playFeature(profileName, key) {
        const p = this.profiles[profileName];
        const s = p.sounds[key];

        if (!s.el) {
            s.el = new Audio(s.src);
            s.el.loop = true;
            s.el.volume = s.vol;
            s.source = this.ctx.createMediaElementSource(s.el);
            s.source.connect(p.gainNode);
        }

        // This catch block handles the autoplay policy silently
        // The 'document.click' listener in init() will fix it automatically.
        s.el.play().catch(err => console.log("Waiting for user interaction..."));
    }
};


// Theme synchronization
(() => {
    "use strict";
    const STORAGE_KEY = "moodkit_prefs_v1";

    const DEFAULTS = {
        grain: false,
        grid: true,
        glow: true,
        audio: false,
        preset: "Neon Clean"
    };

    const PRESETS = {
        "Neon Clean": {
            accent: "#7affc7", accent2: "#63b7ff", accent3: "#0babb1",
            glow1: "rgba(122, 255, 199, 0.18)", glow2: "rgba(99, 183, 255, 0.16)",
            grain: "rgba(122, 255, 199, 0.65)", grain2: "rgba(122, 255, 199, 0.2)"
        },
        "Mono Warm": {
            accent: "#ffd480", accent2: "#ff9f4f", accent3: "#ff7b7b",
            glow1: "rgba(255, 212, 128, 0.18)", glow2: "rgba(255, 159, 79, 0.16)",
            grain: "rgba(255, 212, 128, 0.65)", grain2: "rgba(255, 212, 128, 0.2)"
        },
        "CRT Grid": {
            accent: "#6cff6c", accent2: "#30f040", accent3: "#0ee03c",
            glow1: "rgba(108, 255, 108, 0.18)", glow2: "rgba(36, 255, 127, 0.16)",
            grain: "rgba(108, 255, 108, 0.65)", grain2: "rgba(108, 255, 108, 0.2)"
        }
    };

    const getState = () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS;
    };

    const saveState = (newState) => {
        const current = getState();
        const updated = { ...current, ...newState };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        applyState(updated);
    };

    const applyState = (state) => {
        const body = document.body;

        body.classList.toggle("grain-on", state.grain);
        body.classList.toggle("grid-on", state.grid);
        body.classList.toggle("glow-on", state.glow);

        const p = PRESETS[state.preset] || PRESETS["Neon Clean"];
        body.style.setProperty("--accent", p.accent);
        body.style.setProperty("--accent-2", p.accent2);
        body.style.setProperty("--accent-3", p.accent3);
        body.style.setProperty("--glow-1", p.glow1);
        body.style.setProperty("--glow-2", p.glow2);
        body.style.setProperty("--grain-color", p.grain);
        body.style.setProperty("--grain2-color", p.grain2);
    };

    const syncControls = () => {
        const state = getState();

        const map = { //mapping
            "grain": "grain",
            "grid": "grid",
            "glow": "glow",
            "audio-toggle-checkbox": "audio",
            "preset-select": "preset"
        };

        for (const [id, key] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (!el) continue;

            if (el.tagName === "SELECT") {
                el.value = state[key];
            } else if (el.type === "checkbox") {
                el.checked = state[key];
            }

            if (!el.dataset.bound) {
                el.addEventListener("change", (e) => {
                    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
                    saveState({ [key]: val });
                });
                el.dataset.bound = "true";
            }
        }
    };
    applyState(getState());

    // Run again when DOM is ready to catch the inputs
    window.addEventListener("DOMContentLoaded", () => {
        applyState(getState());
        syncControls();
    });

})();

document.addEventListener("DOMContentLoaded", () => {
    const triggerBtn = document.getElementById("voice-trigger");
    const mainText = document.getElementById("voice-text");
    const subText = document.getElementById("voice-subtext");

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!triggerBtn || !SpeechRecognition) {
        if (mainText) mainText.textContent = "Voice control not supported in this browser.";
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    let isListening = false;

    // Command Map
    const commands = {
        // Palette  
        "palette": "palette-title",
        "palettes": "palette-title",
        "color": "palette-title",
        "colors": "palette-title",
        // Games
        "skill": "games-title",
        "skills": "games-title",
        "challenge": "games-title",
        "challenges": "games-title",
        "game": "games-title",
        "games": "games-title",
        "training": "games-title",
        // Font
        "font": "font-title",
        "typography": "font-title",
        // Briefings
        "portfolio": "brief-title",
        "brief": "brief-title",
        "briefs": "brief-title",
        "briefing": "brief-title",
        "briefings": "brief-title",
        // Filter
        "effect": "filters-title",
        "effects": "filters-title",
        "filter": "filters-title",
        "filters": "filters-title",
        // Sound
        "ambient": "sound-title",
        "noise": "sound-title",
        "noises": "sound-title",
        "audio": "sound-title",
        "sound": "sound-title",
        "sounds": "sound-title"
    };

    triggerBtn.addEventListener("click", () => {
        if (isListening) {
            recognition.stop();
            isListening = false;
            triggerBtn.classList.remove("listening");
            mainText.textContent = "Navigate through the activity board with your voice";
            subText.textContent = "";
        } else {
            requestPermissionAndStart();
        }
    });

    function requestPermissionAndStart() {
        mainText.textContent = "Requesting Permission...";

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                stream.getTracks().forEach(track => track.stop());

                recognition.start();
                isListening = true;
                triggerBtn.classList.add("listening");
                mainText.textContent = ". . .";
                subText.textContent = "Click again to stop recording";
            })
            .catch(err => {
                console.error("Mic Permission Denied:", err);
                mainText.textContent = "Microphone Blocked";
                subText.textContent = "Check your browser settings";
            });
    }

    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();

        mainText.textContent = `"${transcript}"`;

        const upperText = transcript.toUpperCase();
        for (const [key, id] of Object.entries(commands)) {
            if (upperText.includes(key.toUpperCase())) {
                const titleEl = document.getElementById(id);
                if (titleEl) {
                    const card = titleEl.closest('.activity-card');

                    document.querySelectorAll('.highlight-active').forEach(el => el.classList.remove('highlight-active'));

                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    card.classList.add('highlight-active');
                    subText.textContent = `Opening ${key}...`;
                }
            }
        }
    };

    recognition.onerror = (event) => {
        console.error("voice error:", event.error);
        mainText.textContent = "Microphone Error";
        subText.textContent = "Try again";
        recognition.stop();
        isListening = false;
        triggerBtn.classList.remove("listening");
    };

    recognition.onend = () => {
        if (isListening) {
            recognition.start();
        }
    };
});