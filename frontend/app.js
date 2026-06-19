// ==========================================
// TEACHu - Frontend Orchestrator (app.js)
// ==========================================

// --- State Management ---
let apiBaseUrl = localStorage.getItem('teachu_api_url') || '';
let currentAudio = null;
let audioContext = null;
let analyser = null;
let sourceNode = null;
let micSourceNode = null;
let micStream = null;
let animationFrameId = null;
let isPlayingAudio = false;
let currentPlaybackRate = 1.0;

// Quiz State
let quizQuestion = null;
let quizScore = 0;
let askedQuestions = [];

// Speech Recognition Init
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false; // Stop listening when user stops speaking
    recognition.interimResults = true;
    recognition.lang = 'hi-IN'; // Optimized for Hinglish speech pattern
}

// --- DOM Elements ---
const dom = {
    tabs: document.querySelectorAll('.tab-btn'),
    panes: document.querySelectorAll('.tab-pane'),
    
    // Header & Settings
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    apiUrlInput: document.getElementById('apiUrlInput'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    pdfStatusPill: document.getElementById('pdfStatusPill'),
    clearPdfBtn: document.getElementById('clearPdfBtn'),

    // Learn Tab
    topicInput: document.getElementById('topicInput'),
    explainBtn: document.getElementById('explainBtn'),
    usePdfCheckbox: document.getElementById('usePdfCheckbox'),
    languageSelect: document.getElementById('languageSelect'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    loadingState: document.getElementById('loadingState'),
    loadingText: document.getElementById('loadingText'),
    explanationArticle: document.getElementById('explanationArticle'),
    articleTitle: document.getElementById('articleTitle'),
    listenFullBtn: document.getElementById('listenFullBtn'),
    articleBlocks: document.getElementById('articleBlocks'),
    mermaidContainer: document.getElementById('mermaidContainer'),
    mermaidOutput: document.getElementById('mermaidOutput'),
    suggestedTags: document.querySelectorAll('.suggested-tag'),

    // Quiz Tab
    quizTopicInput: document.getElementById('quizTopicInput'),
    startQuizBtn: document.getElementById('startQuizBtn'),
    quizUsePdfCheckbox: document.getElementById('quizUsePdfCheckbox'),
    quizLanguageSelect: document.getElementById('quizLanguageSelect'),
    quizPlayZone: document.getElementById('quizPlayZone'),
    quizQuestionText: document.getElementById('quizQuestionText'),
    quizNumber: document.getElementById('quizNumber'),
    scoreVal: document.getElementById('scoreVal'),
    listenQuizQuestionBtn: document.getElementById('listenQuizQuestionBtn'),
    quizHintBtn: document.getElementById('quizHintBtn'),
    quizHintText: document.getElementById('quizHintText'),
    quizMicBtn: document.getElementById('quizMicBtn'),
    speechStatus: document.getElementById('speechStatus'),
    answerInput: document.getElementById('answerInput'),
    submitAnswerBtn: document.getElementById('submitAnswerBtn'),
    quizFeedbackCard: document.getElementById('quizFeedbackCard'),
    feedbackStatusBadge: document.getElementById('feedbackStatusBadge'),
    listenFeedbackBtn: document.getElementById('listenFeedbackBtn'),
    feedbackText: document.getElementById('feedbackText'),
    nextQuestionBtn: document.getElementById('nextQuestionBtn'),

    // Sidebar
    waveformCanvas: document.getElementById('waveformCanvas'),
    voiceIndicatorDot: document.getElementById('voiceIndicatorDot'),
    voiceIndicatorText: document.getElementById('voiceIndicatorText'),
    dropZone: document.getElementById('dropZone'),
    pdfFileInput: document.getElementById('pdfFileInput'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    uploadOverlay: document.getElementById('uploadOverlay'),
    pdfActionModal: document.getElementById('pdfActionModal'),
    pdfActionTitle: document.getElementById('pdfActionTitle'),
    pdfActionPromptText: document.getElementById('pdfActionPromptText'),
    pdfActionYesBtn: document.getElementById('pdfActionYesBtn'),
    pdfActionNoBtn: document.getElementById('pdfActionNoBtn'),
    speedToggleBtn: document.getElementById('speedToggleBtn')
};

// Canvas drawing context
const canvasCtx = dom.waveformCanvas.getContext('2d');

// --- Helper Functions ---
function getApiUrl(endpoint) {
    return apiBaseUrl ? `${apiBaseUrl}${endpoint}` : endpoint;
}

// Update voice indicator state in UI
function setVoiceIndicator(state, text) {
    dom.voiceIndicatorDot.className = 'indicator-dot';
    if (state === 'speaking') {
        dom.voiceIndicatorDot.classList.add('active');
    } else if (state === 'recording') {
        dom.voiceIndicatorDot.classList.add('recording');
    }
    dom.voiceIndicatorText.textContent = text;
}

// ==========================================
// API Settings Modal Handlers
// ==========================================
dom.settingsBtn.addEventListener('click', () => {
    dom.apiUrlInput.value = apiBaseUrl;
    dom.settingsModal.classList.remove('hidden');
});

dom.closeSettingsBtn.addEventListener('click', () => {
    dom.settingsModal.classList.add('hidden');
});

dom.saveSettingsBtn.addEventListener('click', () => {
    let url = dom.apiUrlInput.value.trim();
    if (url && url.endsWith('/')) {
        url = url.slice(0, -1); // remove trailing slash
    }
    apiBaseUrl = url;
    localStorage.setItem('teachu_api_url', url);
    dom.settingsModal.classList.add('hidden');
});

// ==========================================
// Navigation & Tab Switching
// ==========================================
dom.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        dom.tabs.forEach(t => t.classList.remove('active'));
        dom.panes.forEach(p => p.classList.remove('active'));
        
        tab.classList.add('active');
        const activeTabId = tab.getAttribute('data-tab');
        document.getElementById(`${activeTabId}TabContent`).classList.add('active');
        
        // Stop any playing audio
        stopAudio();
    });
});

// Suggested topics handler
dom.suggestedTags.forEach(tag => {
    tag.addEventListener('click', () => {
        dom.topicInput.value = tag.textContent;
        handleExplain(tag.textContent);
    });
});

// ==========================================
// Text-to-Speech (TTS) Playing logic
// ==========================================
function playAudio(text, language = "hinglish", buttonElement = null) {
    // If playing, stop it first
    stopAudio();

    if (!text || !text.trim()) return;

    setVoiceIndicator('speaking', 'AI Speaking...');
    if (buttonElement) {
        buttonElement.classList.add('playing');
        buttonElement.innerHTML = '<span>⏸</span> Stop';
    }

    const ttsUrl = getApiUrl(`/api/tts?text=${encodeURIComponent(text)}&language=${language}`);
    currentAudio = new Audio(ttsUrl);
    currentAudio.playbackRate = currentPlaybackRate;
    isPlayingAudio = true;

    currentAudio.addEventListener('canplay', () => {
        currentAudio.playbackRate = currentPlaybackRate;
        currentAudio.play();
        setupVisualizer(currentAudio);
    });

    currentAudio.addEventListener('ended', () => {
        cleanupAudioState(buttonElement);
    });

    currentAudio.addEventListener('error', (e) => {
        console.error("Audio playback error:", e);
        cleanupAudioState(buttonElement);
    });
}

function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
    isPlayingAudio = false;
    
    // Reset play buttons
    document.querySelectorAll('.listen-btn').forEach(btn => {
        btn.classList.remove('playing');
        if (btn.id === 'listenFullBtn') {
            btn.innerHTML = '<span class="play-icon">🔊</span> Listen to Full Explanation';
        } else if (btn.id === 'listenQuizQuestionBtn' || btn.id === 'listenFeedbackBtn') {
            btn.innerHTML = '🔊 Listen';
        } else {
            btn.innerHTML = '🔊 Listen';
        }
    });

    setVoiceIndicator('idle', 'System Idle');
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    // Clear canvas
    canvasCtx.clearRect(0, 0, dom.waveformCanvas.width, dom.waveformCanvas.height);
    drawPlaceholderWave();
}

function cleanupAudioState(buttonElement) {
    isPlayingAudio = false;
    setVoiceIndicator('idle', 'System Idle');
    if (buttonElement) {
        buttonElement.classList.remove('playing');
        if (buttonElement.id === 'listenFullBtn') {
            buttonElement.innerHTML = '<span class="play-icon">🔊</span> Listen to Full Explanation';
        } else {
            buttonElement.innerHTML = '🔊 Listen';
        }
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    canvasCtx.clearRect(0, 0, dom.waveformCanvas.width, dom.waveformCanvas.height);
    drawPlaceholderWave();
}

// ==========================================
// Audio Visualizer using Canvas
// ==========================================
function setupVisualizer(audioElement) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
        }

        if (sourceNode) {
            sourceNode.disconnect();
        }

        sourceNode = audioContext.createMediaElementSource(audioElement);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);

        animateWaveform();
    } catch (e) {
        console.warn("Could not setup audio context visualizer (interaction requirement):", e);
    }
}

async function startMicVisualizer() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 128;
        }

        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micSourceNode = audioContext.createMediaStreamSource(micStream);
        micSourceNode.connect(analyser);

        animateWaveform();
    } catch (e) {
        console.warn("Could not capture microphone for visualizer:", e);
    }
}

function stopMicVisualizer() {
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (micSourceNode) {
        micSourceNode.disconnect();
        micSourceNode = null;
    }
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    canvasCtx.clearRect(0, 0, dom.waveformCanvas.width, dom.waveformCanvas.height);
    drawPlaceholderWave();
}

function animateWaveform() {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
        animationFrameId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = '#0f172a'; // slate-900
        canvasCtx.fillRect(0, 0, dom.waveformCanvas.width, dom.waveformCanvas.height);

        const barWidth = (dom.waveformCanvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2.5;

            // Simple visualizer bars mirroring from center
            canvasCtx.fillStyle = `hsl(${220 + (i * 2)}, 80%, 65%)`; // beautiful indigo-blue hues
            const yPos = (dom.waveformCanvas.height - barHeight) / 2;
            canvasCtx.fillRect(x, yPos, barWidth - 1, barHeight);

            x += barWidth;
        }
    };
    draw();
}

function drawPlaceholderWave() {
    canvasCtx.fillStyle = '#0f172a';
    canvasCtx.fillRect(0, 0, dom.waveformCanvas.width, dom.waveformCanvas.height);
    
    // Draw simple flat line in center
    canvasCtx.strokeStyle = '#334155';
    canvasCtx.lineWidth = 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(0, dom.waveformCanvas.height / 2);
    canvasCtx.lineTo(dom.waveformCanvas.width, dom.waveformCanvas.height / 2);
    canvasCtx.stroke();
}

// ==========================================
// LEARN TAB: Topic Explanation Generation
// ==========================================
dom.explainBtn.addEventListener('click', () => {
    const topic = dom.topicInput.value.trim();
    if (topic) {
        handleExplain(topic);
    }
});

dom.topicInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const topic = dom.topicInput.value.trim();
        if (topic) {
            handleExplain(topic);
        }
    }
});

async function handleExplain(topic) {
    stopAudio();
    dom.welcomeScreen.classList.add('hidden');
    dom.explanationArticle.classList.add('hidden');
    dom.loadingState.classList.remove('hidden');
    
    const selectedLang = dom.languageSelect.value;
    dom.loadingText.textContent = `Asking AI to explain "${topic}" in ${selectedLang}...`;

    try {
        const usePdf = dom.usePdfCheckbox.checked;
        const response = await fetch(getApiUrl('/api/explain'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, use_pdf: usePdf, language: selectedLang })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        renderExplanation(data);
    } catch (e) {
        console.error("Error explaining topic:", e);
        alert("Failed to load explanation. Make sure backend is running.");
        dom.loadingState.classList.add('hidden');
        dom.welcomeScreen.classList.remove('hidden');
    }
}

function renderExplanation(data) {
    dom.loadingState.classList.add('hidden');
    dom.explanationArticle.classList.remove('hidden');

    dom.articleTitle.textContent = data.title;
    dom.articleBlocks.innerHTML = '';

    let fullSpeechScript = "";
    const selectedLang = dom.languageSelect.value;

    // Iterate through interspersed blocks
    data.blocks.forEach((block, index) => {
        if (block.type === 'text') {
            const textDiv = document.createElement('div');
            textDiv.className = 'text-block';
            
            // Build dual translation container
            textDiv.innerHTML = `
                <div class="text-block-header">
                    <button class="listen-btn speak-block-btn" data-index="${index}">🔊 Listen Block</button>
                </div>
                <p class="text-english">${block.summary}</p>
                <p class="text-hinglish">${block.explanation}</p>
            `;
            
            // Attach individual listen handler
            textDiv.querySelector('.speak-block-btn').addEventListener('click', function() {
                if (this.classList.contains('playing')) {
                    stopAudio();
                } else {
                    playAudio(block.explanation, selectedLang, this);
                }
            });

            dom.articleBlocks.appendChild(textDiv);
            fullSpeechScript += block.explanation + " ";
        } 
        else if (block.type === 'image') {
            const imageDiv = document.createElement('div');
            imageDiv.className = 'image-block';

            const caption = block.query || "Diagram illustration";
            imageDiv.innerHTML = `
                <div class="spinner-small image-spinner"></div>
                <img class="hidden" alt="${caption}">
                <p class="image-caption">${caption}</p>
            `;

            const imgEl = imageDiv.querySelector('img');
            const spinnerEl = imageDiv.querySelector('.image-spinner');

            // Fallback strategy for images
            const urls = block.urls || [];
            if (urls.length > 0) {
                let urlIndex = 0;
                
                const tryLoadImage = () => {
                    if (urlIndex < urls.length) {
                        imgEl.src = urls[urlIndex];
                    } else {
                        // All image loading failed, hide card
                        imageDiv.classList.add('hidden');
                    }
                };

                imgEl.onload = () => {
                    spinnerEl.classList.add('hidden');
                    imgEl.classList.remove('hidden');
                };

                imgEl.onerror = () => {
                    urlIndex++;
                    tryLoadImage();
                };

                tryLoadImage();
            } else {
                imageDiv.classList.add('hidden'); // Hide if no search results at all
            }

            dom.articleBlocks.appendChild(imageDiv);
        }
    });

    // Full audio setup
    dom.listenFullBtn.onclick = function() {
        if (this.classList.contains('playing')) {
            stopAudio();
        } else {
            playAudio(fullSpeechScript, selectedLang, this);
        }
    };

    // Render Mermaid Diagram if present
    if (data.mermaid_diagram) {
        let diagramCode = data.mermaid_diagram.trim();
        // Remove markdown backticks if Gemini accidentally included them
        if (diagramCode.startsWith("```mermaid")) {
            diagramCode = diagramCode.replace(/^```mermaid\s*/i, "").replace(/\s*```$/, "");
        } else if (diagramCode.startsWith("```")) {
            diagramCode = diagramCode.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }
        
        dom.mermaidContainer.classList.remove('hidden');
        dom.mermaidOutput.removeAttribute('data-processed');
        dom.mermaidOutput.textContent = diagramCode;
        
        // Parse and validate syntax before rendering to prevent showing the error bomb
        mermaid.parse(diagramCode)
            .then(() => {
                try {
                    mermaid.run({
                        nodes: [dom.mermaidOutput]
                    });
                } catch (runErr) {
                    console.error("Mermaid execution error:", runErr);
                    dom.mermaidContainer.classList.add('hidden');
                }
            })
            .catch(parseErr => {
                console.error("Mermaid syntax validation failed:", parseErr);
                dom.mermaidContainer.classList.add('hidden'); // Hide the mindmap section completely if invalid
            });
    } else {
        dom.mermaidContainer.classList.add('hidden');
    }
}

// ==========================================
// QUIZ TAB: Interactive Active Recall
// ==========================================
dom.startQuizBtn.addEventListener('click', () => {
    const topic = dom.quizTopicInput.value.trim();
    if (topic) {
        startQuizSession(topic);
    } else {
        alert("Please enter a topic to start the quiz!");
    }
});

dom.quizTopicInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const topic = dom.quizTopicInput.value.trim();
        if (topic) {
            startQuizSession(topic);
        }
    }
});

async function startQuizSession(topic) {
    stopAudio();
    dom.quizPlayZone.classList.remove('hidden');
    dom.quizFeedbackCard.classList.add('hidden');
    dom.quizQuestionText.textContent = "Generating question...";
    dom.answerInput.value = '';
    dom.speechStatus.textContent = "Click the mic and speak your answer";
    
    const selectedLang = dom.quizLanguageSelect.value;

    try {
        const usePdf = dom.quizUsePdfCheckbox.checked;
        const response = await fetch(getApiUrl('/api/quiz/generate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, use_pdf: usePdf, language: selectedLang })
        });

        if (!response.ok) throw new Error("HTTP error generating question");

        quizQuestion = await response.json();
        
        dom.quizQuestionText.textContent = quizQuestion.question;
        dom.quizHintText.classList.add('hidden');
        dom.quizHintText.textContent = quizQuestion.hint;
        
        // Auto play the question verbally
        playAudio(quizQuestion.question, selectedLang, dom.listenQuizQuestionBtn);

    } catch (e) {
        console.error(e);
        alert("Failed to start quiz.");
        dom.quizPlayZone.classList.add('hidden');
    }
}

dom.listenQuizQuestionBtn.addEventListener('click', function() {
    if (this.classList.contains('playing')) {
        stopAudio();
    } else if (quizQuestion) {
        const selectedLang = dom.quizLanguageSelect.value;
        playAudio(quizQuestion.question, selectedLang, this);
    }
});

dom.quizHintBtn.addEventListener('click', () => {
    dom.quizHintText.classList.toggle('hidden');
});

// --- Speech Recognition answer collection ---
if (recognition) {
    recognition.onstart = () => {
        isRecording = true;
        dom.quizMicBtn.classList.add('recording');
        dom.speechStatus.textContent = "Listening... Speak now.";
        setVoiceIndicator('recording', 'Listening...');
        startMicVisualizer();
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultNo; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        // Output text inside text box
        if (finalTranscript) {
            dom.answerInput.value += finalTranscript + ' ';
        }
    };

    recognition.onerror = (e) => {
        console.error("Speech Recognition Error:", e);
        stopRecording();
    };

    recognition.onend = () => {
        stopRecording();
    };
}

function stopRecording() {
    isRecording = false;
    dom.quizMicBtn.classList.remove('recording');
    dom.speechStatus.textContent = "Mic stopped. You can edit your transcription above.";
    setVoiceIndicator('idle', 'System Idle');
    stopMicVisualizer();
}

dom.quizMicBtn.addEventListener('click', () => {
    if (!SpeechRecognition) {
        alert("Speech Recognition not supported in this browser. Please type your answer.");
        return;
    }
    if (isRecording) {
        recognition.stop();
    } else {
        stopAudio();
        dom.answerInput.value = '';
        
        // Dynamically adjust language for speech recognition
        const selectedLang = dom.quizLanguageSelect.value;
        if (selectedLang === "hindi") {
            recognition.lang = 'hi-IN'; // Pure Hindi
        } else if (selectedLang === "english") {
            recognition.lang = 'en-IN'; // Indian English
        } else {
            recognition.lang = 'hi-IN'; // Hinglish is phonetically closer to Hindi
        }
        
        recognition.start();
    }
});

// Submit Quiz Answer
dom.submitAnswerBtn.addEventListener('click', async () => {
    const answer = dom.answerInput.value.trim();
    if (!answer) {
        alert("Please speak or type your answer before submitting!");
        return;
    }

    stopAudio();
    dom.submitAnswerBtn.disabled = true;
    dom.submitAnswerBtn.textContent = "Evaluating...";

    const selectedLang = dom.quizLanguageSelect.value;

    try {
        const response = await fetch(getApiUrl('/api/quiz/evaluate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: quizQuestion.question,
                expected_keywords: quizQuestion.expected_keywords,
                user_answer: answer,
                language: selectedLang
            })
        });

        if (!response.ok) throw new Error("Evaluation error");

        const result = await response.json();
        
        // Show Feedback
        dom.quizFeedbackCard.classList.remove('hidden');
        dom.feedbackText.textContent = result.feedback;

        dom.quizFeedbackCard.className = 'feedback-card';
        if (result.is_correct) {
            dom.quizFeedbackCard.classList.add('correct');
            dom.feedbackStatusBadge.textContent = 'Correct!';
            quizScore += result.score_delta;
            dom.scoreVal.textContent = quizScore;
        } else {
            dom.quizFeedbackCard.classList.add('incorrect');
            dom.feedbackStatusBadge.textContent = 'Incorrect / Incomplete';
        }

        // Setup feedback listener
        dom.listenFeedbackBtn.onclick = function() {
            if (this.classList.contains('playing')) {
                stopAudio();
            } else {
                playAudio(result.feedback, selectedLang, this);
            }
        };

        // Auto play feedback
        playAudio(result.feedback, selectedLang, dom.listenFeedbackBtn);

    } catch (e) {
        console.error(e);
        alert("Failed to submit answer.");
    } finally {
        dom.submitAnswerBtn.disabled = false;
        dom.submitAnswerBtn.textContent = "Submit Answer";
    }
});

dom.nextQuestionBtn.addEventListener('click', () => {
    const topic = dom.quizTopicInput.value.trim() || dom.topicInput.value.trim() || "current study files";
    startQuizSession(topic);
});

// ==========================================
// PDF Upload Drag & Drop Functionality
// ==========================================
dom.dropZone.addEventListener('click', () => {
    dom.pdfFileInput.click();
});

dom.pdfFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        uploadPdfFile(e.target.files[0]);
    }
});

// Drag enter/over events
['dragenter', 'dragover'].forEach(eventName => {
    dom.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dom.dropZone.classList.add('dragover');
    }, false);
});

// Drag leave/drop events
['dragleave', 'drop'].forEach(eventName => {
    dom.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dom.dropZone.classList.remove('dragover');
    }, false);
});

dom.dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        uploadPdfFile(files[0]);
    }
});

async function uploadPdfFile(file) {
    if (file.type !== 'application/pdf') {
        alert("Only PDF files are supported!");
        return;
    }

    // Show upload overlay loader inside drop zone
    if (dom.uploadOverlay) dom.uploadOverlay.classList.remove('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(getApiUrl('/api/upload-pdf'), {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error("PDF processing failed");

        const result = await response.json();
        
        // Show loaded badge
        dom.pdfStatusPill.classList.remove('hidden');
        
        // Toggle PDF context switches on
        dom.usePdfCheckbox.checked = true;
        dom.quizUsePdfCheckbox.checked = true;

        // Auto-extract and populate the title
        const pdfTitle = result.pdf_title || "Uploaded PDF Notes";
        dom.topicInput.value = pdfTitle;
        dom.quizTopicInput.value = pdfTitle;

        // Identify current active tab
        const learnTabActive = document.querySelector('.tab-btn[data-tab="learn"]').classList.contains('active');
        const quizTabActive = document.querySelector('.tab-btn[data-tab="quiz"]').classList.contains('active');

        if (dom.pdfActionModal) {
            if (learnTabActive) {
                dom.pdfActionTitle.textContent = "📄 PDF Notes Loaded!";
                dom.pdfActionPromptText.innerHTML = `I detected the topic: <strong>${pdfTitle}</strong>.<br>Would you like me to explain these PDF notes now?`;
                
                dom.pdfActionYesBtn.onclick = () => {
                    dom.pdfActionModal.classList.add('hidden');
                    handleExplain(pdfTitle);
                };
                dom.pdfActionNoBtn.onclick = () => {
                    dom.pdfActionModal.classList.add('hidden');
                };
                
                dom.pdfActionModal.classList.remove('hidden');
            } else if (quizTabActive) {
                dom.pdfActionTitle.textContent = "⚡ Ready for Active Recall?";
                dom.pdfActionPromptText.innerHTML = `I detected the topic: <strong>${pdfTitle}</strong>.<br>Would you like to start a quiz based on your PDF notes?`;
                
                dom.pdfActionYesBtn.onclick = () => {
                    dom.pdfActionModal.classList.add('hidden');
                    startQuizSession(pdfTitle);
                };
                dom.pdfActionNoBtn.onclick = () => {
                    dom.pdfActionModal.classList.add('hidden');
                };
                
                dom.pdfActionModal.classList.remove('hidden');
            }
        }

    } catch (e) {
        console.error(e);
        alert("Failed to upload notes. Make sure backend is running.");
    } finally {
        if (dom.uploadOverlay) dom.uploadOverlay.classList.add('hidden');
    }
}

// Clear PDF handler
dom.clearPdfBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
        const response = await fetch(getApiUrl('/api/clear-pdf'), {
            method: 'POST'
        });
        if (response.ok) {
            dom.pdfStatusPill.classList.add('hidden');
            dom.usePdfCheckbox.checked = false;
            dom.quizUsePdfCheckbox.checked = false;
            alert("PDF context cleared successfully.");
        }
    } catch (e) {
        console.error("Error clearing PDF:", e);
    }
});

// Theme Toggle Handler
const savedTheme = localStorage.getItem('teachu_theme') || 'light';
if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    if (dom.themeToggleBtn) dom.themeToggleBtn.textContent = '☀️';
} else {
    document.body.classList.remove('dark-theme');
    if (dom.themeToggleBtn) dom.themeToggleBtn.textContent = '🌙';
}

if (dom.themeToggleBtn) {
    dom.themeToggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem('teachu_theme', isDark ? 'dark' : 'light');
        dom.themeToggleBtn.textContent = isDark ? '☀️' : '🌙';
    });
}

if (dom.speedToggleBtn) {
    dom.speedToggleBtn.addEventListener('click', () => {
        if (currentPlaybackRate === 1.0) {
            currentPlaybackRate = 1.5;
        } else if (currentPlaybackRate === 1.5) {
            currentPlaybackRate = 2.0;
        } else if (currentPlaybackRate === 2.0) {
            currentPlaybackRate = 2.5;
        } else if (currentPlaybackRate === 2.5) {
            currentPlaybackRate = 3.0;
        } else {
            currentPlaybackRate = 1.0;
        }
        
        dom.speedToggleBtn.textContent = `${currentPlaybackRate}x`;
        
        if (currentAudio) {
            currentAudio.playbackRate = currentPlaybackRate;
        }
    });
}

// Initializing UI Wave
drawPlaceholderWave();
console.log("TEACHu UI Client loaded. Ready.");
