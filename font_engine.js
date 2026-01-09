/* font_engine.js - Expanded Edition */

document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. THE EXPANDED DATABASE ---
    const pairings = {
        modern: [
            { h: 'Montserrat', b: 'Open Sans', desc: 'Geometric & Clean' },
            { h: 'Poppins', b: 'Lato', desc: 'Friendly & Humanist' },
            { h: 'Oswald', b: 'Roboto', desc: 'Bold & Industrial' },
            { h: 'Playfair Display', b: 'Source Sans Pro', desc: 'High Contrast' },
            { h: 'Raleway', b: 'Merriweather', desc: 'Elegant Modernity' },
            { h: 'Work Sans', b: 'Inter', desc: 'UI Optimized' },
            { h: 'DM Sans', b: 'DM Serif Display', desc: 'Contemporary editorial' },
            { h: 'Manrope', b: 'Fira Sans', desc: 'Tech Startup Vibe' }
        ],
        minimalist: [
            { h: 'Inter', b: 'Inter', desc: 'Pure Functionalism' },
            { h: 'Jost', b: 'Mulish', desc: 'Soft Geometry' },
            { h: 'Lexend', b: 'Lexend Deca', desc: 'Hyper-Legible' },
            { h: 'Space Grotesk', b: 'Space Grotesk', desc: 'Mono-style Sans' },
            { h: 'Questrial', b: 'Muli', desc: 'Airy & Light' },
            { h: 'Outfit', b: 'Urbanist', desc: 'Brand-Ready' }
        ],
        retro: [
            { h: 'Press Start 2P', b: 'VT323', desc: '8-Bit Arcade' },
            { h: 'Righteous', b: 'Roboto Mono', desc: 'Synthwave' },
            { h: 'Bungee', b: 'Space Mono', desc: 'Urban Retro' },
            { h: 'Abril Fatface', b: 'Poppins', desc: '70s Magazine' },
            { h: 'Shrikhand', b: 'Chivo', desc: 'Groovy 70s' },
            { h: 'Limelight', b: 'Federo', desc: 'Art Deco / 20s' },
            { h: 'Monoton', b: 'Iceland', desc: 'Neon Lights' }
        ],
        elegant: [
            { h: 'Cinzel', b: 'Fauna One', desc: 'Classic Roman' },
            { h: 'Cormorant Garamond', b: 'Proza Libre', desc: 'Editorial High-End' },
            { h: 'Spectral', b: 'Karla', desc: 'Modern Serif' },
            { h: 'Prata', b: 'Lato', desc: 'Fashion Brand' },
            { h: 'Bodoni Moda', b: 'Raleway', desc: 'Luxury Vogue' },
            { h: 'Italiana', b: 'Montserrat', desc: 'Chic Boutique' },
            { h: 'Tenor Sans', b: 'Lora', desc: 'Sophisticated Blog' }
        ],
        editorial: [
            { h: 'Frank Ruhl Libre', b: 'Arimo', desc: 'Newspaper Classic' },
            { h: 'Newsreader', b: 'Inter', desc: 'Digital Journalism' },
            { h: 'Libre Baskerville', b: 'Source Serif Pro', desc: 'Bookish & Warm' },
            { h: 'Playfair Display', b: 'Alice', desc: 'Literary Feel' },
            { h: 'Crimson Pro', b: 'Crimson Text', desc: 'Old Style' }
        ],
        tech: [
            { h: 'Orbitron', b: 'Exo 2', desc: 'Futuristic HUD' },
            { h: 'Audiowide', b: 'Rajdhani', desc: 'Cyberpunk' },
            { h: 'Share Tech Mono', b: 'Nova Mono', desc: 'Terminal Code' },
            { h: 'Syncopate', b: 'Titillium Web', desc: 'Space Age' },
            { h: 'Chakra Petch', b: 'Teko', desc: 'Mecha Interface' },
            { h: 'Michroma', b: 'Jura', desc: 'Sci-Fi Display' },
            { h: 'Oxanium', b: 'Goldman', desc: 'Gaming UI' }
        ],
        playful: [
            { h: 'Fredoka One', b: 'Nunito', desc: 'Rounded & Soft' },
            { h: 'Pacifico', b: 'Quicksand', desc: 'Handwritten Vibe' },
            { h: 'Chewy', b: 'Comic Neue', desc: 'Cartoony' },
            { h: 'Permanent Marker', b: 'Kalam', desc: 'Marker Style' },
            { h: 'Bangers', b: 'Roboto Condensed', desc: 'Comic Book' },
            { h: 'Carter One', b: 'Signika', desc: 'Fun Web' }
        ],
        brutalist: [
            { h: 'Archivo Black', b: 'Archivo', desc: 'Heavy Impact' },
            { h: 'Space Grotesk', b: 'Inter', desc: 'Digital Raw' },
            { h: 'Syne', b: 'Public Sans', desc: 'Art School' },
            { h: 'Unbounded', b: 'Work Sans', desc: 'Wide & Loud' },
            { h: 'Anton', b: 'Bebas Neue', desc: 'Poster Style' },
            { h: 'Major Mono Display', b: 'Cutive Mono', desc: 'Glitch / Code' }
        ]
    };

    const grid = document.getElementById('font-grid');
    const select = document.getElementById('vibe-select');
    const input = document.getElementById('text-input');

    // --- 2. LOGIC ---

    function loadFonts(category) {
        const pairs = pairings[category];
        if (!pairs) return;

        // A. Build Google Fonts URL
        const fontNames = new Set();
        pairs.forEach(p => {
            fontNames.add(p.h.replace(/ /g, '+'));
            fontNames.add(p.b.replace(/ /g, '+'));
        });

        const linkId = 'dynamic-fonts';
        let link = document.getElementById(linkId);
        
        if (!link) {
            link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }

        // We explicitly ask for weights 400 (Body) and 700 (Header) to ensure they load correctly
        const families = Array.from(fontNames).map(f => `family=${f}:wght@400;700`).join('&');
        link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;

        // B. Render Grid
        renderGrid(pairs);
    }

    function renderGrid(pairs) {
        grid.innerHTML = ''; 

        const sampleText = input.value || "The quick brown fox jumps over the lazy dog.";

        pairs.forEach(p => {
            const card = document.createElement('div');
            card.className = 'font-card';
            
            // Note: We apply the font-family inline to ensure it renders immediately upon load
            card.innerHTML = `
                <div class="card-header">
                    <span>${p.h} + ${p.b}</span>
                    <span>${p.desc}</span>
                </div>
                <div class="font-preview">
                    <div class="preview-heading" style="font-family: '${p.h}', sans-serif; font-weight: 700;">${p.h}</div>
                    <div class="preview-body" style="font-family: '${p.b}', sans-serif; font-weight: 400;">
                        ${sampleText}
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    // --- 3. LISTENERS ---

    if (select) {
        select.addEventListener('change', (e) => {
            loadFonts(e.target.value);
        });
    }

    if (input) {
        input.addEventListener('input', (e) => {
            const previews = document.querySelectorAll('.preview-body');
            const val = e.target.value || "The quick brown fox jumps over the lazy dog.";
            previews.forEach(el => el.textContent = val);
        });
    }

    // --- 4. INIT ---
    loadFonts('modern'); // Default load
});