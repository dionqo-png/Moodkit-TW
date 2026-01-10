document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.file-icon');
    const games = document.querySelectorAll('.game-content');

    const targetWindow = document.getElementById('target-window-content');
    const userRevealState = document.getElementById('user-reveal-state');
    const notFoundState = document.getElementById('not-found-state');

    const redSlider = document.getElementById('red-slider');
    const greenSlider = document.getElementById('green-slider');
    const blueSlider = document.getElementById('blue-slider');

    const redTooltip = document.getElementById('red-tooltip');
    const greenTooltip = document.getElementById('green-tooltip');
    const blueTooltip = document.getElementById('blue-tooltip');

    const submitBtn = document.getElementById('submit-btn');
    const newColorBtn = document.getElementById('new-color-btn');
    const feedbackBox = document.getElementById('feedback-box');
    const targetRGB = document.getElementById('target-rgb');
    const accuracyVal = document.getElementById('accuracy-val');
    const gradeVal = document.getElementById('grade-val');

    let targetR, targetG, targetB;

    // Loop through every button
    buttons.forEach(button => {
        button.addEventListener('click', () => {

            // Get the ID of the game we want to show
            const targetId = button.getAttribute('data-target');
            const targetGame = document.getElementById(targetId);

            if (targetGame) {
                // Hide ALL games first (remove 'active' class)
                games.forEach(game => {
                    game.classList.remove('active');
                });

                // Show ONLY the target game (add 'active' class)
                targetGame.classList.add('active');
            }
        });
    });

    function toggleSliders(enabled) {
        redSlider.disabled = !enabled;
        greenSlider.disabled = !enabled;
        blueSlider.disabled = !enabled;
    }

    function updateSliderNumbers() {
        redTooltip.textContent = redSlider.value.toString().padStart(3, '0');
        greenTooltip.textContent = greenSlider.value.toString().padStart(3, '0');
        blueTooltip.textContent = blueSlider.value.toString().padStart(3, '0');
    }

    function initRGBGame() {
        targetR = Math.floor(Math.random() * 256);
        targetG = Math.floor(Math.random() * 256);
        targetB = Math.floor(Math.random() * 256);

        targetWindow.style.backgroundColor = `rgb(${targetR}, ${targetG}, ${targetB})`;

        redSlider.value = 0;
        greenSlider.value = 0;
        blueSlider.value = 0;

        toggleSliders(true);

        updateSliderNumbers();

        userRevealState.style.backgroundColor = 'transparent';
        userRevealState.classList.add('state-hidden');
        userRevealState.classList.remove('state-visible');

        notFoundState.classList.add('state-visible');
        notFoundState.classList.remove('state-hidden');

        submitBtn.style.display = 'block';
        feedbackBox.classList.add('hidden');
    }

    function checkGuess() {
        const userR = parseInt(redSlider.value);
        const userG = parseInt(greenSlider.value);
        const userB = parseInt(blueSlider.value);

        toggleSliders(false);

        notFoundState.classList.remove('state-visible');
        notFoundState.classList.add('state-hidden');

        userRevealState.classList.remove('state-hidden');
        userRevealState.classList.add('state-visible');
        userRevealState.style.backgroundColor = `rgb(${userR}, ${userG}, ${userB})`;

        const totalDiff = Math.abs(targetR - userR) + Math.abs(targetG - userG) + Math.abs(targetB - userB);
        let accuracy = 100 - ((totalDiff / (3 * 255)) * 100);
        accuracy = accuracy.toFixed(1);

        let grade = 'F';
        let gradeColor = '#ff4a4a';
        if (accuracy >= 95) { grade = 'S'; gradeColor = '#b651cf'; }
        else if (accuracy >= 90) { grade = 'A'; gradeColor = '#4bd446'; }
        else if (accuracy >= 82.5) { grade = 'B'; gradeColor = '#e9dd38'; }
        else if (accuracy >= 75) { grade = 'C'; gradeColor = '#ffb52b'; }
        else if (accuracy >= 65) { grade = 'D'; gradeColor = '#ff802b'; }
        else if (accuracy >= 50) { grade = 'E'; gradeColor = '#ff6347'; }
        targetRGB.textContent = `(${targetR}, ${targetG}, ${targetB})`;
        targetRGB.style.color = `rgb(${targetR}, ${targetG}, ${targetB})`;
        accuracyVal.textContent = accuracy;
        gradeVal.textContent = grade;
        gradeVal.style.color = gradeColor;

        submitBtn.style.display = 'none';
        feedbackBox.classList.remove('hidden');
    }

    redSlider.addEventListener('input', updateSliderNumbers);
    greenSlider.addEventListener('input', updateSliderNumbers);
    blueSlider.addEventListener('input', updateSliderNumbers);

    submitBtn.addEventListener('click', checkGuess);
    newColorBtn.addEventListener('click', initRGBGame);


    initRGBGame();
});