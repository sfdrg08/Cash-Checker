// ========================================
// AI MALAYSIAN CASH SCANNER
// ========================================


// ========================================
// YOUR TEACHABLE MACHINE MODEL
// ========================================

const MODEL_URL =
    "https://teachablemachine.withgoogle.com/models/javfwwAzr/";


// ========================================
// SETTINGS
// ========================================

// Minimum confidence required
// before accepting a detection.

const CONFIDENCE_THRESHOLD = 0.80;


// Prevent the same note from being
// repeatedly added while the user
// holds it in front of the camera.

const SCAN_COOLDOWN = 2500;


// ========================================
// HTML ELEMENTS
// ========================================

const camera =
    document.getElementById("camera");


const startCameraButton =
    document.getElementById("startCamera");


const scanButton =
    document.getElementById("scanButton");


const resultValue =
    document.getElementById("resultValue");


const confidenceText =
    document.getElementById("confidence");


const confidenceBar =
    document.getElementById("confidenceBar");


const totalValue =
    document.getElementById("totalValue");


const clearButton =
    document.getElementById("clearButton");


const aiStatus =
    document.getElementById("aiStatus");


const aiMessage =
    document.getElementById("aiMessage");


const statusIndicator =
    document.getElementById("statusIndicator");


const historyList =
    document.getElementById("historyList");


const scanCount =
    document.getElementById("scanCount");


// ========================================
// VARIABLES
// ========================================

let model = null;

let cameraStream = null;

let cameraRunning = false;

let total = 0;

let history = [];

let lastScanTime = 0;

let scanning = false;


// ========================================
// LOAD AI MODEL
// ========================================

async function loadAIModel() {

    try {

        setAIStatus(
            "loading",
            "Loading AI model...",
            "Connecting to your Teachable Machine model."
        );


        console.log(
            "Loading Teachable Machine model..."
        );


        // Model files

        const modelURL =
            MODEL_URL + "model.json";


        const metadataURL =
            MODEL_URL + "metadata.json";


        // Load model

        model =
            await tmImage.load(
                modelURL,
                metadataURL
            );


        // Number of classes

        const numberOfClasses =
            model.getTotalClasses();


        // Class names

        const classNames =
            model.getClassLabels();


        console.log(
            "AI model loaded."
        );


        console.log(
            "Classes:",
            classNames
        );


        setAIStatus(
            "ready",
            "AI Model: Ready",
            `${numberOfClasses} banknote classes loaded.`
        );


        scanButton.disabled =
            !cameraRunning;


    }

    catch (error) {

        console.error(
            "Model loading error:",
            error
        );


        setAIStatus(
            "error",
            "AI Model: Error",
            "Could not load the Teachable Machine model."
        );


        alert(
            "The AI model could not be loaded.\n\n" +
            "Please check your internet connection " +
            "and make sure the Teachable Machine model " +
            "is publicly available."
        );

    }

}


// ========================================
// AI STATUS
// ========================================

function setAIStatus(
    type,
    title,
    message
) {

    aiStatus.textContent =
        title;


    aiMessage.textContent =
        message;


    statusIndicator.className =
        "status-dot";


    statusIndicator.classList.add(
        type
    );

}


// ========================================
// START CAMERA
// ========================================

startCameraButton.addEventListener(
    "click",
    startCamera
);


async function startCamera() {

    try {

        // Check browser support

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {

            throw new Error(
                "Camera API not supported."
            );

        }


        // Request rear camera

        cameraStream =
            await navigator.mediaDevices
                .getUserMedia({

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


        // Connect camera

        camera.srcObject =
            cameraStream;


        // Wait for video

        await camera.play();


        cameraRunning =
            true;


        startCameraButton.textContent =
            "📷 Camera Running";


        startCameraButton.disabled =
            true;


        scanButton.disabled =
            model === null;


        confidenceText.textContent =
            "Camera ready. Place a banknote inside the frame.";


    }

    catch (error) {

        console.error(
            "Camera error:",
            error
        );


        alert(
            "Unable to access the camera.\n\n" +
            "Please allow camera permission " +
            "and try again."
        );

    }

}


// ========================================
// SCAN BUTTON
// ========================================

scanButton.addEventListener(
    "click",
    scanBanknote
);


// ========================================
// SCAN BANKNOTE
// ========================================

async function scanBanknote() {

    // Prevent overlapping scans

    if (scanning) {

        return;

    }


    // Make sure AI exists

    if (!model) {

        alert(
            "The AI model is still loading."
        );

        return;

    }


    // Make sure camera is running

    if (!cameraRunning) {

        alert(
            "Please start the camera first."
        );

        return;

    }


    // Prevent rapid repeated scanning

    const currentTime =
        Date.now();


    if (
        currentTime - lastScanTime
        <
        SCAN_COOLDOWN
    ) {

        return;

    }


    scanning = true;


    scanButton.disabled =
        true;


    confidenceText.textContent =
        "🤖 AI is analyzing the banknote...";


    try {

        // =================================
        // RUN AI
        // =================================

        const predictions =
            await model.predict(
                camera,
                false
            );


        console.log(
            "Predictions:",
            predictions
        );


        // =================================
        // FIND BEST PREDICTION
        // =================================

        let bestPrediction =
            predictions[0];


        for (
            let i = 1;
            i < predictions.length;
            i++
        ) {

            if (
                predictions[i].probability
                >
                bestPrediction.probability
            ) {

                bestPrediction =
                    predictions[i];

            }

        }


        const className =
            bestPrediction.className;


        const probability =
            bestPrediction.probability;


        const confidencePercent =
            probability * 100;


        // =================================
        // UPDATE CONFIDENCE BAR
        // =================================

        confidenceBar.style.width =
            `${confidencePercent}%`;


        // =================================
        // CONFIDENCE CHECK
        // =================================

        if (
            probability
            <
            CONFIDENCE_THRESHOLD
        ) {

            resultValue.textContent =
                "Unknown";


            confidenceText.textContent =
                `Confidence: ${confidencePercent.toFixed(1)}% — too low`;


            speak(
                "I could not identify the banknote"
            );


            return;

        }


        // =================================
        // GET MONEY VALUE
        // =================================

        const value =
            extractMoneyValue(
                className
            );


        // If class isn't a money value

        if (value === null) {

            resultValue.textContent =
                className;


            confidenceText.textContent =
                `Confidence: ${confidencePercent.toFixed(1)}%`;


            speak(
                `${className} detected`
            );


            return;

        }


        // =================================
        // DISPLAY RESULT
        // =================================

        resultValue.textContent =
            `RM${value}`;


        confidenceText.textContent =
            `Confidence: ${confidencePercent.toFixed(1)}%`;


        // =================================
        // ADD TOTAL
        // =================================

        total += value;


        updateTotal();


        // =================================
        // ADD HISTORY
        // =================================

        addHistory(
            value,
            confidencePercent
        );


        // =================================
        // VOICE
        // =================================

        speak(
            `${formatMoneyForSpeech(value)} detected`
        );


        // Record scan time

        lastScanTime =
            Date.now();

    }

    catch (error) {

        console.error(
            "Prediction error:",
            error
        );


        confidenceText.textContent =
            "Could not analyze the image.";

    }

    finally {

        scanning =
            false;


        // Allow another scan

        setTimeout(
            () => {

                scanButton.disabled =
                    !cameraRunning ||
                    !model;

            },
            700
        );

    }

}


// ========================================
// EXTRACT MONEY VALUE
// ========================================

function extractMoneyValue(
    className
) {

    /*
        Examples:

        "RM1"
        "RM5"
        "RM10"
        "RM20"
        "RM50"
        "RM100"

        The regular expression finds
        the number after RM.
    */


    const match =
        className.match(
            /RM\s*(\d+(?:\.\d+)?)/
        );


    if (!match) {

        return null;

    }


    const value =
        Number(
            match[1]
        );


    if (
        Number.isNaN(value)
    ) {

        return null;

    }


    return value;

}


// ========================================
// UPDATE TOTAL
// ========================================

function updateTotal() {

    totalValue.textContent =
        `RM${total.toFixed(2)}`;

}


// ========================================
// ADD HISTORY
// ========================================

function addHistory(
    value,
    confidence
) {

    history.unshift({

        value: value,

        confidence: confidence,

        time: new Date()

    });


    // Keep latest 20

    if (
        history.length > 20
    ) {

        history.pop();

    }


    renderHistory();

}


// ========================================
// DISPLAY HISTORY
// ========================================

function renderHistory() {

    scanCount.textContent =
        `${history.length} ${
            history.length === 1
                ? "scan"
                : "scans"
        }`;


    if (
        history.length === 0
    ) {

        historyList.innerHTML = `

            <div class="empty-history">

                No banknotes scanned yet.

            </div>

        `;

        return;

    }


    historyList.innerHTML = "";


    history.forEach(
        (item) => {

            const element =
                document.createElement(
                    "div"
                );


            element.className =
                "history-item";


            element.innerHTML = `

                <div>

                    <div class="history-value">

                        RM${item.value}

                    </div>

                    <div class="history-confidence">

                        Confidence:
                        ${item.confidence.toFixed(1)}%

                    </div>

                </div>


                <div class="history-confidence">

                    ${formatTime(item.time)}

                </div>

            `;


            historyList.appendChild(
                element
            );

        }
    );

}


// ========================================
// FORMAT TIME
// ========================================

function formatTime(
    date
) {

    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );

}


// ========================================
// VOICE
// ========================================

function speak(
    text
) {

    if (
        !("speechSynthesis" in window)
    ) {

        return;

    }


    // Cancel previous speech

    window.speechSynthesis.cancel();


    const speech =
        new SpeechSynthesisUtterance(
            text
        );


    speech.rate =
        0.9;


    speech.pitch =
        1;


    speech.volume =
        1;


    window.speechSynthesis.speak(
        speech
    );

}


// ========================================
// MONEY SPEECH
// ========================================

function formatMoneyForSpeech(
    value
) {

    return `${value} ringgit`;

}


// ========================================
// CLEAR TOTAL
// ========================================

clearButton.addEventListener(
    "click",
    clearAll
);


function clearAll() {

    total = 0;

    history = [];


    resultValue.textContent =
        "—";


    confidenceText.textContent =
        "Waiting for scan...";


    confidenceBar.style.width =
        "0%";


    updateTotal();

    renderHistory();

}


// ========================================
// INITIALIZE
// ========================================

loadAIModel();

renderHistory();
