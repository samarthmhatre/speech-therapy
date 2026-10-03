document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration and Initialization ---

    // Target elements from the HTML
    const targetPhraseElement = document.getElementById('target-phrase');
    const startButton = document.getElementById('start-btn');
    const resultTextElement = document.getElementById('result-text');
    const feedbackMessageElement = document.getElementById('feedback-message');
    
    // An array of phrases for the user to practice
    const practicePhrases = [
        "The quick brown fox jumps over the lazy dog.",
        "She sells seashells by the seashore.",
        "Peter Piper picked a peck of pickled peppers.",
        "A proper cup of coffee.",
        "Unique New York."
    ];

    let currentTargetPhrase = "";
    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];

    // Initialize Speech Synthesis (TTS) - keeping this native as requested
    const synth = window.speechSynthesis;

    // Check for MediaRecorder support (Required for Whisper audio capture)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        startButton.disabled = true;
        feedbackMessageElement.textContent = "❌ Error: Your browser does not support audio recording. Please try Chrome or Firefox.";
        return;
    }

    // --- Core Functions ---

    function speakFeedback(text) {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9; 
        synth.speak(utterance);
    }

    /**
     * Text-to-Speech: Reads the target phrase out loud.
     * @param {string} text - The text to be spoken.
     */
    function speakPhrase(text) {
        // Clear any prior speech
        synth.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        
        utterance.rate = 0.8; // Slower pace for therapy
        utterance.pitch = 1.0; 
        
        utterance.onend = () => {
            // Once the phrase is spoken, automatically start recording
            startRecording();
        };

        synth.speak(utterance);
    }
    
    /**
     * Cleans and normalizes strings for comparison.
     * Removes punctuation and converts to lower case.
     */
    function normalizeText(text) {
        return text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();
    }

    /**
     * Calculates the similarity (as a percentage) between two strings
     */
    function calculateSimilarity(target, spoken) {
        const normalizedTarget = normalizeText(target);
        const normalizedSpoken = normalizeText(spoken);

        if (normalizedTarget.length === 0 || normalizedSpoken.length === 0) {
            return 0;
        }

        let matchCount = 0;
        for (let i = 0; i < Math.min(normalizedTarget.length, normalizedSpoken.length); i++) {
            if (normalizedTarget[i] === normalizedSpoken[i]) {
                matchCount++;
            }
        }
        
        return Math.round((matchCount / normalizedTarget.length) * 100);
    }

    /**
     * Starts the audio recording process.
     */
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = sendAudioToWhisper;

            mediaRecorder.start();
            isRecording = true;

            // UI Updates
            resultTextElement.textContent = "Listening... (Speak now)";
            feedbackMessageElement.textContent = "Click 'Stop & Check' when finished.";
            startButton.textContent = "Stop & Check";
            startButton.disabled = false; // Enable button so user can click stop
            startButton.classList.add('recording-mode'); // Optional: Add class for styling if needed

        } catch (err) {
            console.error("Microphone error:", err);
            feedbackMessageElement.textContent = "❌ Error accessing microphone. Please allow permissions.";
            startButton.disabled = false;
        }
    }

    /**
     * Stops recording and initiates the upload.
     */
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            isRecording = false;
            
            // UI Updates
            startButton.textContent = "Processing...";
            startButton.disabled = true;
            resultTextElement.textContent = "Analyzing speech with Whisper...";
        }
    }

    /**
     * Sends the recorded audio to the Flask backend for Whisper transcription.
     */
    async function sendAudioToWhisper() {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('target_word', currentTargetPhrase); // Sending for logging/reference

        try {
            // Call the local Python backend
            const response = await fetch('http://127.0.0.1:5000/transcribe', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                handleTranscriptionResult(data.transcription);
            } else {
                throw new Error(data.error || "Unknown server error");
            }

        } catch (error) {
            console.error("Transcription error:", error);
            feedbackMessageElement.textContent = "❌ Server Error: Is app.py running? " + error.message;
            resultTextElement.textContent = "Connection failed.";
            resetUI();
        }
    }

    /**
     * Processes the text returned from Whisper.
     */
    function handleTranscriptionResult(spokenTranscript) {
        resultTextElement.textContent = `You Said: "${spokenTranscript}"`;

        const similarity = calculateSimilarity(currentTargetPhrase, spokenTranscript);

        // Handles the final transcription result
    recognition.onresult = (event) => {
        const spokenTranscript = event.results[0][0].transcript;
        resultTextElement.textContent = `You Said: "${spokenTranscript}"`;

        const similarity = calculateSimilarity(currentTargetPhrase, spokenTranscript);

        let feedback;
        if (similarity >= 90) {
            feedback = `Excellent! Similarity: ${similarity} percent. Great job!`;
        } else if (similarity >= 60) {
            feedback = `Good attempt! Similarity: ${similarity} percent. Try to focus on the whole phrase.`;
        } else {
            feedback = `Keep practicing. Similarity: ${similarity} percent. Listen carefully and try again.`;
        }

        feedbackMessageElement.textContent = feedback;
        
        // NEW: Vocalize the feedback
        speakFeedback(feedback);
    };
        resetUI();
    }

    function resetUI() {
        startButton.textContent = "Start Practice";
        startButton.disabled = false;
        startButton.classList.remove('recording-mode');
        isRecording = false;
    }

    // --- Event Handlers ---

    // Handles the primary button click (Toggle Start / Stop)
    startButton.addEventListener('click', () => {
        if (isRecording) {
            // If currently recording, this button acts as "Stop"
            stopRecording();
        } else {
            // If idle, start a new session
            // 1. Pick a new random phrase
            const randomIndex = Math.floor(Math.random() * practicePhrases.length);
            currentTargetPhrase = practicePhrases[randomIndex];

            // 2. Update the UI
            targetPhraseElement.textContent = currentTargetPhrase;
            resultTextElement.textContent = "Listen to the phrase...";
            feedbackMessageElement.textContent = "Preparing...";
            startButton.disabled = true; // Disable briefly while TTS starts

            // 3. Speak the phrase (TTS 'end' event will trigger startRecording)
            speakPhrase(currentTargetPhrase);
        }
    });

    // Initial setup state
    targetPhraseElement.textContent = "Click 'Start Practice' to begin your session!";
    resultTextElement.textContent = "";
    feedbackMessageElement.textContent = "";
});