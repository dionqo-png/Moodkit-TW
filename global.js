/* global.js */

/* ===============================
   HEADER INJECTION
   =============================== */

// Inject CSS
const cssLink = document.createElement("link");
cssLink.rel = "stylesheet";
cssLink.href = "header.css"; 
document.head.appendChild(cssLink);

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize SoundManager immediately (so it's ready)
    SoundManager.init();

    // 2. Load Header
    fetch('header.html')
        .then(r => r.text())
        .then(data => {
            document.body.insertAdjacentHTML('afterbegin', data);
            highlightCurrentPage();
            setupGlobalAudioToggle();
        });
});

function highlightCurrentPage() {
    let currentPath = window.location.pathname.split("/").pop();
    if (currentPath === "") currentPath = "home.html"; 
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active-link');
        }
    });
}

/* ===============================
   GLOBAL AUDIO TOGGLE (HEADER)
   =============================== */

function setupGlobalAudioToggle() {
    // Use a short timeout to ensure the DOM elements are painted
    setTimeout(() => {
        const checkbox = document.getElementById("audio-toggle-checkbox");
        const icon = document.querySelector(".audio-control .icon");

        if (!checkbox) return;

        // Sync visual state with SoundManager
        checkbox.checked = !SoundManager.globalMute;
        updateMuteIcon(SoundManager.globalMute, icon);

        checkbox.addEventListener("change", e => {
            const isSoundOn = e.target.checked;
            const shouldMute = !isSoundOn;
            
            // Tell SoundManager to handle the muting
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
   SOUND MANAGER (With Memory)
   ========================================= */

const SoundManager = {
    ctx: null,
    globalMute: false,
    activeProfile: null,
    currentSelection: null,

    // YOUR EXACT PATHS FROM THE PROMPT
    profiles: {
        fire: {
            masterVol: 0.5,
            gainNode: null,
            sounds: {
                flame: { src: 'sounds/flames.mp3', vol: 0.7, active: false, el: null, source: null },
                wood:  { src: 'sounds/fire.mp3', vol: 0.5, active: false, el: null, source: null }
            }
        },
        water: {
            masterVol: 0.5,
            gainNode: null,
            sounds: {
                rain:    { src: 'sounds/rain.mp3', vol: 0.6, active: false, el: null, source: null },
                thunder: { src: 'sounds/thunder.mp3', vol: 0.4, active: false, el: null, source: null }
            }
        },
        earth: {
            masterVol: 0.5,
            gainNode: null,
            sounds: {
                forest: { src: 'sounds/leaves.mp3', vol: 0.6, active: false, el: null, source: null },
                birds:  { src: 'sounds/birds.mp3', vol: 0.3, active: false, el: null, source: null },
                wind:   { src: 'sounds/wind.mp3', vol: 0.4, active: false, el: null, source: null }
            }
        }
    },

    init() {
        console.log("🔊 SoundManager Initialized");

        // 1. Load Mute State
        this.globalMute = localStorage.getItem("moodkit_mute") === "true";

        // 2. Load Active Sounds (Memory)
        const savedProfile = localStorage.getItem("moodkit_profile");
        const savedFeatures = JSON.parse(localStorage.getItem("moodkit_features") || "[]");

        // 3. Auto-Resume (The Fix for "Sound Stops")
        if (savedProfile && this.profiles[savedProfile]) {
            // We need a user interaction to start audio context usually,
            // so we set up the state, and the first click anywhere will start it.
            this.activeProfile = savedProfile;
            this.currentSelection = { type: "master", profile: savedProfile };
            
            // Mark features as active in data
            savedFeatures.forEach(key => {
                if (this.profiles[savedProfile].sounds[key]) {
                    this.profiles[savedProfile].sounds[key].active = true;
                }
            });

            // Try to auto-play immediately
            this.setupContext();
            this.restorePlayback();
        }

        // 4. Global Unlock (for browser policy)
        document.addEventListener('click', () => {
            if (!this.ctx) this.setupContext();
            if (this.ctx && this.ctx.state === 'suspended' && !this.globalMute) {
                this.ctx.resume();
            }
        }, { once: true });
    },

    restorePlayback() {
        if (!this.activeProfile) return;
        
        // 1. Restore Master Vol
        const p = this.profiles[this.activeProfile];
        if (p.gainNode) {
            // Apply volume immediately
            p.gainNode.gain.value = this.globalMute ? 0 : p.masterVol;
        }

        // 2. Play Active Sounds
        Object.keys(p.sounds).forEach(key => {
            if (p.sounds[key].active) {
                this.playFeature(this.activeProfile, key);
            }
        });
    },

    /* ===== STATE SAVING ===== */
    saveState() {
        // Save Profile
        if (this.activeProfile) {
            localStorage.setItem("moodkit_profile", this.activeProfile);
        }
        
        // Save Active Features
        const activeFeats = [];
        if (this.activeProfile) {
            const p = this.profiles[this.activeProfile];
            Object.keys(p.sounds).forEach(key => {
                if (p.sounds[key].active) activeFeats.push(key);
            });
        }
        localStorage.setItem("moodkit_features", JSON.stringify(activeFeats));
    },

    /* ===== MUTE LOGIC ===== */

    setGlobalMute(shouldMute) {
        this.globalMute = shouldMute;
        localStorage.setItem("moodkit_mute", shouldMute);
        this.applyGlobalMute();
    },

    applyGlobalMute() {
        if (!this.ctx) return;

        Object.values(this.profiles).forEach(profile => {
            if (!profile.gainNode) return;
            
            // Soft mute using Gain (Safer than suspending context)
            const targetVol = this.globalMute ? 0 : profile.masterVol;
            profile.gainNode.gain.cancelScheduledValues(this.ctx.currentTime);
            profile.gainNode.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
        });
    },

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

    /* ===== ACTIONS ===== */

    activateProfile(profileName) {
        if (!this.setupContext()) return;

        // Stop others
        Object.keys(this.profiles).forEach(p => {
            if (p !== profileName) this.stopProfile(p);
        });

        this.activeProfile = profileName;
        this.currentSelection = { type: "master", profile: profileName };
        
        // Auto-start first sound if nothing else is active? 
        // Or just let user click features. 
        // Based on previous code, let's just activate.
        
        this.saveState();
        window.dispatchEvent(new CustomEvent("profile-changed"));
        window.dispatchEvent(
            new CustomEvent("volume-updated", { detail: this.profiles[profileName].masterVol })
        );
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
            // Web Audio Hookup
            s.source = this.ctx.createMediaElementSource(s.el);
            s.source.connect(p.gainNode);
        }
        
        // Important: catch autoplay errors without crashing
        s.el.play().catch(err => console.log("Waiting for interaction:", err));
    }
};