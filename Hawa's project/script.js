/* =========================================
   ACCESSIBLE MALAYSIAN CASH SCANNER
   Teachable Machine Version
   ========================================= */

/* =========================================
   CONFIGURATION
   ========================================= */

console.log("CASH SCANNER SCRIPT LOADED");

const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/javfwwAzr/";

const CONFIDENCE_THRESHOLD = 0.60;

// Automatic scan interval
const SCAN_INTERVAL = 1000;

// Number of consecutive matching predictions
const REQUIRED_STABLE_SCANS = 2;

// Number of failed predictions before
// unlocking the previous banknote
const REQUIRED_MISSING_SCANS = 3;


/* =========================================
   VARIABLES
   ========================================= */

let model = null;
let cameraStream = null;
let cameraRunning = false;
let autoScanTimer = null;

let total = 0;
let history = [];
let scanning = false;

// Stable detection
let candidateClass = null;
let candidateCount = 0;

// Prevent the same physical banknote
// from being counted repeatedly
let noteLocked = false;
let missingCount = 0;

// Voice recognition
let recognition = null;
let voiceRecognitionRunning = false;


/* =========================================
   DOM ELEMENTS
   ========================================= */

const camera = document.getElementById("camera");

const modelStatus =
    document.getElementById("modelStatus");

const cameraMessage =
    document.getElementById("cameraMessage");

const screenReaderStatus =
    document.getElementById("screenReaderStatus");

const startCameraBtn =
    document.getElementById("startCameraBtn");

const stopCameraBtn =
    document.getElementById("stopCameraBtn");

const scanBtn =
    document.getElementById("scanBtn");

const voiceBtn =
    document.getElementById("voiceBtn");

const detectedAmount =
    document.getElementById("detectedAmount");

const resultDescription =
    document.getElementById("resultDescription");

const confidenceText =
    document.getElementById("confidenceText");

const confidenceFill =
    document.getElementById("confidenceFill");

const confidenceBar =
    document.querySelector(".confidence-bar");

const totalAmount =
    document.getElementById("totalAmount");

const totalSpeechText =
    document.getElementById("totalSpeechText");

const clearBtn =
    document.getElementById("clearBtn");

const historyList =
    document.getElementById("historyList");


/* =========================================
   INITIALIZATION
   ========================================= */

window.addEventListener("load", initialize);

async function initialize() {

    modelStatus.textContent = "Loading AI...";

    try {

        await loadModel();

        modelStatus.textContent = "AI Ready";

        announce(
            "Cash scanner ready. Tap Start Camera."
        );

    } catch (error) {

        console.error("Model loading error:", error);

        modelStatus.textContent = "AI Error";

        announce(
            "The AI model could not be loaded. Please check your internet connection."
        );
    }

    setupVoiceRecognition();
}


/* =========================================
   LOAD TEACHABLE MACHINE MODEL
   ========================================= */

async function loadModel() {

    const modelURL =
        MODEL_URL + "model.json";

    const metadataURL =
        MODEL_URL + "metadata.json";

    model = await tmImage.load(
        modelURL,
        metadataURL
    );

    console.log("AI model loaded.");

    console.log(
        "Classes:",
        model.getClassLabels()
    );
}


/* =========================================
   START CAMERA
   ========================================= */

async function startCamera() {

    if (!model) {

        announce(
            "The AI model is still loading. Please wait."
        );

        return;
    }

    if (cameraRunning) {
        return;
    }

    try {

        cameraStream =
            await navigator.mediaDevices.getUserMedia({

                video: {

                    facingMode: {
                        ideal: "environment"
                    },

                    width: {
                        ideal: 1280
                    },

                    height: {
                        ideal: 720
                    }
                },

                audio: false
            });


        camera.srcObject =
            cameraStream;

        await camera.play();

        cameraRunning = true;

        startCameraBtn.disabled = true;
        stopCameraBtn.disabled = false;
        scanBtn.disabled = false;

        cameraMessage.textContent =
            "Camera ready. Hold a banknote in front of the camera.";

        announce(
            "Camera ready. Place one banknote in front of the camera."
        );

        startAutomaticScanning();

    } catch (error) {

        console.error(
            "Camera error:",
            error
        );

        cameraMessage.textContent =
            "Camera could not be started.";

        announce(
            "I could not start the camera. Please allow camera permission and try again."
        );
    }
}


/* =========================================
   STOP CAMERA
   ========================================= */

function stopCamera() {

    cameraRunning = false;

    if (autoScanTimer) {

        clearInterval(autoScanTimer);

        autoScanTimer = null;
    }

    if (cameraStream) {

        cameraStream
            .getTracks()
            .forEach(track => track.stop());

        cameraStream = null;
    }

    camera.srcObject = null;

    startCameraBtn.disabled = false;
    stopCameraBtn.disabled = true;
    scanBtn.disabled = true;

    cameraMessage.textContent =
        "Camera is not running.";

    resetDetectionState();

    announce(
        "Camera stopped."
    );
}


/* =========================================
   AUTOMATIC SCANNING
   ========================================= */

function startAutomaticScanning() {

    if (autoScanTimer) {

        clearInterval(autoScanTimer);
    }

    autoScanTimer =
        setInterval(() => {

            if (
                cameraRunning &&
                !scanning
            ) {

                performScan();
            }

        }, SCAN_INTERVAL);
}


/* =========================================
   MANUAL SCAN BUTTON
   ========================================= */

scanBtn.addEventListener(
    "click",
    manualScan
);

async function manualScan() {

    if (!cameraRunning) {

        announce(
            "Please start the camera first."
        );

        return;
    }

    if (!model) {

        announce(
            "The AI model is not ready yet."
        );

        return;
    }

    if (scanning) {
        return;
    }

    console.log("MANUAL SCAN BUTTON PRESSED");

    await performScan(true);
}


/* =========================================
   PERFORM AI SCAN
   ========================================= */

async function performScan(manual = false) {

    if (
        !cameraRunning ||
        !model ||
        scanning
    ) {
        return;
    }

    scanning = true;

    try {

        const predictions =
            await model.predict(
                camera,
                false
            );

        console.table(predictions);

        const best =
            getBestPrediction(predictions);

        // Make sure a prediction exists
        if (!best) {

            console.log(
                "AI did not return a prediction."
            );

            scanning = false;

            return;
        }

        console.log(
            "AI BEST PREDICTION:",
            best.className,
            best.probability
        );

        const probability =
            best.probability;

        updateConfidence(
            probability
        );


        /* ---------------------------------
           LOW CONFIDENCE
           --------------------------------- */

        if (
            probability <
            CONFIDENCE_THRESHOLD
        ) {

            console.log(
                "Prediction rejected because confidence is too low."
            );

            handleMissingDetection();

            scanning = false;

            return;
        }


        /* ---------------------------------
           VALID CONFIDENCE
           --------------------------------- */

        missingCount = 0;


        /* ---------------------------------
           PREVENT DUPLICATE COUNTING
           --------------------------------- */

        if (noteLocked) {

            console.log(
                "Banknote already counted. Remove it before scanning another."
            );

            scanning = false;

            return;
        }


        /* ---------------------------------
           CHECK STABILITY
           --------------------------------- */

        if (
            candidateClass ===
            best.className
        ) {

            candidateCount++;

        } else {

            candidateClass =
                best.className;

            candidateCount = 1;
        }

        console.log(
            "STABLE SCANS:",
            candidateCount,
            "/",
            REQUIRED_STABLE_SCANS
        );


        /* ---------------------------------
           ACCEPT BANKNOTE
           --------------------------------- */

        if (
            candidateCount >=
            REQUIRED_STABLE_SCANS
        ) {

            const amount =
                extractAmount(
                    best.className
                );

            console.log(
                "EXTRACTED AMOUNT:",
                amount
            );

            if (!amount) {

                resultDescription.textContent =
                    `AI detected "${best.className}", but the value could not be extracted.`;

                console.error(
                    "Could not extract amount from:",
                    best.className
                );

                scanning = false;

                return;
            }

            acceptBanknote(
                best.className,
                probability
            );
        }

    } catch (error) {

        console.error(
            "Scan error:",
            error
        );

        resultDescription.textContent =
            "An error occurred while scanning.";

    }

    scanning = false;
}


/* =========================================
   FIND BEST PREDICTION
   ========================================= */

function getBestPrediction(predictions) {

    if (
        !predictions ||
        predictions.length === 0
    ) {

        return null;
    }

    return predictions.reduce(
        (best, current) => {

            return current.probability >
                best.probability
                ? current
                : best;

        }
    );
}


/* =========================================
   ACCEPT BANKNOTE
   ========================================= */

function acceptBanknote(
    className,
    probability
) {

    const amount =
        extractAmount(className);

    if (!amount) {

        console.error(
            "Unable to extract amount from:",
            className
        );

        return;
    }

    console.log(
        "BANKNOTE ACCEPTED:",
        amount
    );

    // Lock this physical note
    noteLocked = true;

    candidateClass = null;
    candidateCount = 0;
    missingCount = 0;


    /* Add to total */

    total += amount;

    updateTotal();

    addToHistory(
        amount,
        probability
    );

    updateDetectionDisplay(
        amount,
        probability
    );


    /* Vibration */

    vibrate();


    /* Spoken result */

    const amountSpeech =
        amountToSpeech(amount);

    const totalSpeech =
        totalToSpeech(total);

    const message =
        `${amountSpeech} ringgit detected. ${totalSpeech}.`;

    announce(message);

    screenReaderStatus.textContent =
        message;

    console.log(
        "SPOKEN:",
        message
    );
}


/* =========================================
   HANDLE MISSING / LOW CONFIDENCE
   ========================================= */

function handleMissingDetection() {

    missingCount++;

    console.log(
        "Missing / low confidence scans:",
        missingCount
    );

    if (
        missingCount >=
        REQUIRED_MISSING_SCANS
    ) {

        // Unlock the scanner
        noteLocked = false;

        candidateClass = null;

        candidateCount = 0;

        missingCount = 0;

        resultDescription.textContent =
            "Ready for the next banknote.";

        console.log(
            "Scanner unlocked. Ready for next banknote."
        );
    }
}


/* =========================================
   EXTRACT RM VALUE
   ========================================= */

function extractAmount(className) {

    if (!className) {
        return null;
    }

    /*
       Examples:

       "1 ringgit"   -> 1
       "5 ringgit"   -> 5
       "10 ringgit"  -> 10
       "20 ringgit"  -> 20
       "50 ringgit"  -> 50
       "100 ringgit" -> 100

       Also supports:

       "RM1"
       "RM5"
       "RM10"
       "RM20"
       "RM50"
       "RM100"
    */

    const match =
        className.match(
            /(\d+(?:\.\d+)?)/
        );

    if (!match) {

        return null;
    }

    return Number(
        match[1]
    );
}


/* =========================================
   DETECTION DISPLAY
   ========================================= */

function updateDetectionDisplay(
    amount,
    probability
) {

    detectedAmount.textContent =
        `RM${amount}`;

    resultDescription.textContent =
        `${amountToSpeech(amount)} ringgit detected.`;
}


/* =========================================
   CONFIDENCE
   ========================================= */

function updateConfidence(
    probability
) {

    const percentage =
        Math.round(
            probability * 100
        );

    confidenceText.textContent =
        `${percentage}%`;

    confidenceFill.style.width =
        `${percentage}%`;

    confidenceBar.setAttribute(
        "aria-valuenow",
        percentage
    );
}


/* =========================================
   TOTAL
   ========================================= */

function updateTotal() {

    totalAmount.textContent =
        `RM${total}`;

    totalSpeechText.textContent =
        totalToSpeech(total) + ".";
}


/* =========================================
   HISTORY
   ========================================= */

function addToHistory(
    amount,
    probability
) {

    const item = {

        amount: amount,

        confidence:
            Math.round(
                probability * 100
            ),

        time:
            new Date()
    };

    history.unshift(item);

    // Keep latest 20 scans
    if (history.length > 20) {

        history.pop();
    }

    renderHistory();
}


/* =========================================
   RENDER HISTORY
   ========================================= */

function renderHistory() {

    historyList.innerHTML = "";

    if (
        history.length === 0
    ) {

        const empty =
            document.createElement("li");

        empty.className =
            "empty-history";

        empty.textContent =
            "No banknotes scanned yet.";

        historyList.appendChild(
            empty
        );

        return;
    }


    history.forEach(
        (item, index) => {

            const li =
                document.createElement("li");

            li.className =
                "history-item";


            const value =
                document.createElement("span");

            value.className =
                "history-value";

            value.textContent =
                `RM${item.amount}`;


            const time =
                document.createElement("span");

            time.className =
                "history-time";

            time.textContent =
                `${formatTime(item.time)} — ${item.confidence}%`;


            li.appendChild(value);

            li.appendChild(time);


            li.setAttribute(
                "aria-label",
                `Scan ${index + 1}: ${item.amount} ringgit, ${item.confidence} percent confidence`
            );


            historyList.appendChild(li);
        }
    );
}


/* =========================================
   TIME
   ========================================= */

function formatTime(date) {

    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );
}


/* =========================================
   CLEAR TOTAL
   ========================================= */

clearBtn.addEventListener(
    "click",
    clearTotal
);

function clearTotal() {

    total = 0;

    history = [];

    resetDetectionState();

    updateTotal();

    renderHistory();

    detectedAmount.textContent =
        "—";

    resultDescription.textContent =
        "No banknote detected yet.";

    updateConfidence(0);

    announce(
        "Total cleared. Total is zero ringgit."
    );

    screenReaderStatus.textContent =
        "Total cleared. Total is zero ringgit.";
}


/* =========================================
   RESET DETECTION STATE
   ========================================= */

function resetDetectionState() {

    candidateClass = null;

    candidateCount = 0;

    noteLocked = false;

    missingCount = 0;
}


/* =========================================
   SPEECH SYNTHESIS
   ========================================= */

function announce(text) {

    console.log(
        "Voice:",
        text
    );

    screenReaderStatus.textContent =
        text;

    if (
        !("speechSynthesis" in window)
    ) {

        return;
    }

    window.speechSynthesis.cancel();

    const speech =
        new SpeechSynthesisUtterance(
            text
        );

    speech.rate = 0.9;

    speech.pitch = 1;

    speech.volume = 1;


    const voices =
        window.speechSynthesis.getVoices();

    const preferredVoice =
        voices.find(
            voice =>
                voice.lang === "en-MY"
        ) ||
        voices.find(
            voice =>
                voice.lang.startsWith("en")
        );

    if (preferredVoice) {

        speech.voice =
            preferredVoice;
    }

    window.speechSynthesis.speak(
        speech
    );
}


/* =========================================
   ASYNC VOICE LOADING
   ========================================= */

if (
    "speechSynthesis" in window
) {

    window.speechSynthesis.onvoiceschanged =
        () => {

            window.speechSynthesis.getVoices();
        };
}


/* =========================================
   MONEY → SPEECH
   ========================================= */

function amountToSpeech(amount) {

    switch (amount) {

        case 1:
            return "one";

        case 5:
            return "five";

        case 10:
            return "ten";

        case 20:
            return "twenty";

        case 50:
            return "fifty";

        case 100:
            return "one hundred";

        default:
            return String(amount);
    }
}


function totalToSpeech(amount) {

    if (amount === 0) {

        return "Total is zero ringgit";
    }

    return `Total is ${numberToSpeech(amount)} ringgit`;
}


function numberToSpeech(number) {

    if (number === 0) {
        return "zero";
    }

    const ones = [

        "",

        "one",

        "two",

        "three",

        "four",

        "five",

        "six",

        "seven",

        "eight",

        "nine"
    ];


    const teens = [

        "ten",

        "eleven",

        "twelve",

        "thirteen",

        "fourteen",

        "fifteen",

        "sixteen",

        "seventeen",

        "eighteen",

        "nineteen"
    ];


    const tens = [

        "",

        "",

        "twenty",

        "thirty",

        "forty",

        "fifty",

        "sixty",

        "seventy",

        "eighty",

        "ninety"
    ];


    if (number < 10) {

        return ones[number];
    }


    if (number < 20) {

        return teens[number - 10];
    }


    if (number < 100) {

        const ten =
            Math.floor(number / 10);

        const one =
            number % 10;

        return one === 0
            ? tens[ten]
            : `${tens[ten]} ${ones[one]}`;
    }


    if (number < 1000) {

        const hundred =
            Math.floor(number / 100);

        const remainder =
            number % 100;

        if (remainder === 0) {

            return `${ones[hundred]} hundred`;
        }

        return `${ones[hundred]} hundred ${numberToSpeech(remainder)}`;
    }


    return String(number);
}


/* =========================================
   VIBRATION
   ========================================= */

function vibrate() {

    if (
        "vibrate" in navigator
    ) {

        navigator.vibrate(
            [100, 50, 100]
        );
    }
}


/* =========================================
   VOICE COMMANDS
   ========================================= */

function setupVoiceRecognition() {

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


    if (!SpeechRecognition) {

        voiceBtn.disabled = true;

        voiceBtn.textContent =
            "🎙 Voice Commands Unsupported";

        return;
    }


    recognition =
        new SpeechRecognition();


    recognition.continuous = true;

    recognition.interimResults = false;

    recognition.lang = "en-MY";


    recognition.onstart =
        () => {

            voiceRecognitionRunning =
                true;

            voiceBtn.textContent =
                "🎙 Voice Commands ON";

            announce(
                "Voice commands are on."
            );
        };


    recognition.onend =
        () => {

            voiceRecognitionRunning =
                false;

            voiceBtn.textContent =
                "🎙 Voice Commands";


            if (cameraRunning) {

                try {

                    recognition.start();

                } catch (error) {

                    console.log(
                        "Voice restart:",
                        error
                    );
                }
            }
        };


    recognition.onerror =
        event => {

            console.log(
                "Speech recognition error:",
                event.error
            );
        };


    recognition.onresult =
        event => {

            const result =
                event.results[
                    event.results.length - 1
                ];


            const command =
                result[0]
                    .transcript
                    .toLowerCase()
                    .trim();


            console.log(
                "Voice command:",
                command
            );


            processVoiceCommand(
                command
            );
        };
}


/* =========================================
   VOICE BUTTON
   ========================================= */

voiceBtn.addEventListener(
    "click",
    toggleVoiceRecognition
);


function toggleVoiceRecognition() {

    if (!recognition) {

        announce(
            "Voice commands are not supported by this browser."
        );

        return;
    }


    if (
        voiceRecognitionRunning
    ) {

        recognition.stop();

        announce(
            "Voice commands are off."
        );

        return;
    }


    try {

        recognition.start();

    } catch (error) {

        console.error(error);
    }
}


/* =========================================
   PROCESS VOICE COMMAND
   ========================================= */

function processVoiceCommand(
    command
) {

    /* TOTAL */

    if (
        command.includes("total") ||
        command.includes("how much")
    ) {

        announce(
            totalToSpeech(total)
        );

        return;
    }


    /* CLEAR */

    if (
        command.includes("clear") ||
        command.includes("reset")
    ) {

        clearTotal();

        return;
    }


    /* STOP */

    if (
        command.includes("stop scanning") ||
        command.includes("stop camera")
    ) {

        stopCamera();

        return;
    }


    /* START */

    if (
        command.includes("start scanning") ||
        command.includes("start camera")
    ) {

        if (!cameraRunning) {

            startCamera();
        }

        return;
    }


    /* SCAN */

    if (
        command === "scan" ||
        command.includes("scan now")
    ) {

        manualScan();

        return;
    }
}


/* =========================================
   BUTTON EVENTS
   ========================================= */

startCameraBtn.addEventListener(
    "click",
    startCamera
);


stopCameraBtn.addEventListener(
    "click",
    stopCamera
);


/* =========================================
   KEYBOARD ACCESSIBILITY
   ========================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            cameraRunning
        ) {

            stopCamera();
        }
    }
);


/* =========================================
   PAGE EXIT
   ========================================= */

window.addEventListener(
    "beforeunload",
    () => {

        if (cameraStream) {

            cameraStream
                .getTracks()
                .forEach(
                    track =>
                        track.stop()
                );
        }
    }
);