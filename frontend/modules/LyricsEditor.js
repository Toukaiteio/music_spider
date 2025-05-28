// Lyrics Editor Module
// This module contains the HTML structure and JavaScript functions for the lyrics editor tool.

export const lyricsToolHtml = `
<div class="lyrics-tool-container">
    <h4>Lyrics Editor (LRC Format)</h4>
    <div id="lyrics-waveform-placeholder" style="display: flex; align-items: center; margin-bottom: 10px;">
        <span id="lyrics-current-time" style="margin-right: 5px; font-size: 0.9em;">0:00</span>
        <input type="range" id="lyrics-editor-progress-bar" value="0" style="flex-grow: 1; height: 8px;">
        <span id="lyrics-duration" style="margin-left: 5px; font-size: 0.9em;">0:00</span>
    </div>
    <div id="lyrics-playback-controls-placeholder" style="display: flex; justify-content: center; align-items: center; margin-bottom: 10px;">
        <button id="lyrics-slow-down" class="icon-button" aria-label="Slow Down"><span class="material-icons">fast_rewind</span></button>
        <button id="lyrics-simulate-play" class="icon-button" aria-label="Simulate Play"><span class="material-icons">play_arrow</span></button>
        <button id="lyrics-clip-time" class="icon-button" aria-label="Clip Current Time"><span class="material-icons">add_comment</span></button>
        <button id="lyrics-reset-simulation" class="icon-button" aria-label="Reset Simulation"><span class="material-icons">replay</span></button>
        <button id="lyrics-speed-up" class="icon-button" aria-label="Speed Up"><span class="material-icons">fast_forward</span></button>
    </div>
    <label for="lrc-input-area">LRC Content:</label>
    <textarea id="lrc-input-area" placeholder="[mm:ss.xx]Lyric line 1\n[mm:ss.xx]<00:00.xx>Word <00:00.xx>by <00:00.xx>word..." rows="10"></textarea>
    <div id="lrc-error-message" style="color: var(--error-color, red); margin-top: 5px; min-height: 1.2em; font-size: 0.9em;"></div>
    <label for="lrc-preview-area">Preview:</label>
    <div id="lrc-preview-area">Lyrics preview will appear here.</div>
</div>
`;

let mainPlayerManagerInstance = null;
export const lyricsEditorAudio = new Audio();
let currentPlaybackSpeed = 1.0;
let lyricsEditorPlayButtonIcon = null;

let currentParsedLyrics = [];
let lrcPreviewAreaElement = null;
let lrcErrorDisplayElement = null; 
let lrcInputAreaElement = null;

let lastHighlightedLineElement = null;
let lastHighlightedWordElement = null;
let currentBlobUrl = null; // To manage Blob URL lifecycle


function formatTime(timeInSeconds) {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatLRCClipTime(timeInSeconds) {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const hundredths = Math.floor((timeInSeconds - Math.floor(timeInSeconds)) * 100);
    return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;
}

export function setMainPlayerManager(instance) {
    mainPlayerManagerInstance = instance;
}

export function pauseEditorAndResetButton() {
    lyricsEditorAudio.pause();
    if (lyricsEditorPlayButtonIcon) {
        lyricsEditorPlayButtonIcon.textContent = 'play_arrow';
    }
}

function displayLrcError(errorMessage) {
    if (lrcInputAreaElement) lrcInputAreaElement.classList.add('lrc-input-error');
    if (lrcErrorDisplayElement) lrcErrorDisplayElement.textContent = errorMessage;
}

function clearLrcError() {
    if (lrcInputAreaElement) lrcInputAreaElement.classList.remove('lrc-input-error');
    if (lrcErrorDisplayElement) lrcErrorDisplayElement.textContent = '';
}

export function resetPreviewHighlights() {
    if (!lrcPreviewAreaElement) return;
    lrcPreviewAreaElement.querySelectorAll('.highlighted-lyric').forEach(el => el.classList.remove('highlighted-lyric'));
    lrcPreviewAreaElement.querySelectorAll('.past-line').forEach(el => el.classList.remove('past-line'));
    lastHighlightedLineElement = null;
    lastHighlightedWordElement = null;
}

export function updatePreviewHighlight(currentTime) {
    if (!lrcPreviewAreaElement || !currentParsedLyrics || currentParsedLyrics.length === 0) {
        return;
    }
    resetPreviewHighlights(); 
    let currentLineIndex = -1;
    for (let i = 0; i < currentParsedLyrics.length; i++) {
        const line = currentParsedLyrics[i];
        const nextLine = currentParsedLyrics[i + 1];
        if (currentTime >= line.time && (!nextLine || currentTime < nextLine.time)) {
            currentLineIndex = i;
            break;
        }
    }
    const lineElements = lrcPreviewAreaElement.querySelectorAll('.lyric-line');
    lineElements.forEach((lineEl, index) => {
        if (index < currentLineIndex) lineEl.classList.add('past-line');
        else lineEl.classList.remove('past-line');
    });
    if (currentLineIndex !== -1) {
        const currentLineData = currentParsedLyrics[currentLineIndex];
        const currentLineElement = lineElements[currentLineIndex];
        if (currentLineElement) {
            currentLineElement.classList.add('highlighted-lyric');
            lastHighlightedLineElement = currentLineElement;
            if (currentLineData.words && currentLineData.words.length > 0) {
                let currentWordIndex = -1;
                for (let j = 0; j < currentLineData.words.length; j++) {
                    const word = currentLineData.words[j];
                    const nextWord = currentLineData.words[j + 1];
                    if (currentTime >= word.time && (!nextWord || currentTime < nextWord.time)) {
                        currentWordIndex = j;
                        break;
                    }
                }
                if (currentWordIndex !== -1) {
                    const wordElements = currentLineElement.querySelectorAll('.lyric-word');
                    if (wordElements[currentWordIndex]) {
                        currentLineElement.classList.remove('highlighted-lyric');
                        wordElements[currentWordIndex].classList.add('highlighted-lyric');
                        lastHighlightedWordElement = wordElements[currentWordIndex];
                    }
                }
            }
        }
    }
}

export function loadAudioSource(url) {
    // Revoke the old blob URL if it exists
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    if (url) {
        lyricsEditorAudio.src = url;
        lyricsEditorAudio.load();
        if (url.startsWith('blob:')) {
            currentBlobUrl = url; // Store the new blob URL
        }
    } else {
        // If URL is null or empty, clear the source
        lyricsEditorAudio.removeAttribute('src');
        lyricsEditorAudio.load(); // Important to call load to apply changes
    }
    
    currentPlaybackSpeed = 1.0;
    lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
    if (lyricsEditorPlayButtonIcon) lyricsEditorPlayButtonIcon.textContent = 'play_arrow';
    
    const progressBar = document.getElementById('lyrics-editor-progress-bar');
    const currentTimeDisplay = document.getElementById('lyrics-current-time');
    const durationDisplay = document.getElementById('lyrics-duration');
    
    if(progressBar) progressBar.value = 0;
    if(currentTimeDisplay) currentTimeDisplay.textContent = "0:00";
    if(durationDisplay) durationDisplay.textContent = "0:00"; // Reset duration until loadedmetadata
    
    resetPreviewHighlights();
    if (lyricsEditorAudio.paused) updatePreviewHighlight(0);
}

export function initLyricsEditorControls(lyricsEditorContainerElement) {
    if (!lyricsEditorContainerElement) {
        console.error("Lyrics editor container element not found for initializing controls.");
        return;
    }
    lrcPreviewAreaElement = lyricsEditorContainerElement.querySelector("#lrc-preview-area");
    lrcInputAreaElement = lyricsEditorContainerElement.querySelector("#lrc-input-area"); 
    lrcErrorDisplayElement = lyricsEditorContainerElement.querySelector("#lrc-error-message"); 

    const playPauseButton = lyricsEditorContainerElement.querySelector("#lyrics-simulate-play");
    const slowDownButton = lyricsEditorContainerElement.querySelector("#lyrics-slow-down");
    const speedUpButton = lyricsEditorContainerElement.querySelector("#lyrics-speed-up");
    const resetButton = lyricsEditorContainerElement.querySelector("#lyrics-reset-simulation");
    const clipTimeButton = lyricsEditorContainerElement.querySelector("#lyrics-clip-time");
    const progressBar = lyricsEditorContainerElement.querySelector("#lyrics-editor-progress-bar");
    const currentTimeDisplay = lyricsEditorContainerElement.querySelector("#lyrics-current-time");
    const durationDisplay = lyricsEditorContainerElement.querySelector("#lyrics-duration");

    if (lrcInputAreaElement) {
        lrcInputAreaElement.addEventListener('input', (event) => {
            const lrcText = event.target.value;
            const result = parseLRC(lrcText); 
            if (result.error) {
                displayLrcError(result.error.message);
                currentParsedLyrics = result.lyrics || []; 
            } else {
                clearLrcError();
                currentParsedLyrics = result.lyrics;
            }
            renderLyricsPreview(currentParsedLyrics, lrcPreviewAreaElement); 
            if (lyricsEditorAudio.paused) {
                updatePreviewHighlight(lyricsEditorAudio.currentTime);
            }
        });
    }

    if (playPauseButton) { 
        lyricsEditorPlayButtonIcon = playPauseButton.querySelector(".material-icons"); 
        playPauseButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (lyricsEditorAudio.paused) {
                if (mainPlayerManagerInstance && typeof mainPlayerManagerInstance.pauseTrack === 'function') {
                    mainPlayerManagerInstance.pauseTrack();
                }
                lyricsEditorAudio.play().catch(e => console.error("Error playing lyrics editor audio:", e));
                if (lyricsEditorPlayButtonIcon) lyricsEditorPlayButtonIcon.textContent = "pause";
            } else {
                lyricsEditorAudio.pause();
                if (lyricsEditorPlayButtonIcon) lyricsEditorPlayButtonIcon.textContent = "play_arrow";
            }
        });
    }
    if (slowDownButton) { 
        slowDownButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (lyricsEditorAudio.playbackRate > 0.5) {
                currentPlaybackSpeed = Math.max(0.5, lyricsEditorAudio.playbackRate - 0.25);
                lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
            }
        });
    }
    if (speedUpButton) { 
        speedUpButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (lyricsEditorAudio.playbackRate < 4.0) { 
                currentPlaybackSpeed = Math.min(4.0, lyricsEditorAudio.playbackRate + 0.25);
                lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
            }
        });
    }
    if (clipTimeButton && lrcInputAreaElement) { 
        clipTimeButton.addEventListener("click", (event) => {
            event.preventDefault();
            const currentTime = lyricsEditorAudio.currentTime;
            const formattedTime = formatLRCClipTime(currentTime);
            const cursorPosition = lrcInputAreaElement.selectionStart;
            const text = lrcInputAreaElement.value;
            let textToInsert = formattedTime;
            if (cursorPosition > 0 && text.charAt(cursorPosition - 1) !== '\n') {
                textToInsert = '\n' + formattedTime;
            }
            lrcInputAreaElement.value = text.slice(0, cursorPosition) + textToInsert + text.slice(lrcInputAreaElement.selectionEnd);
            const newCursorPosition = cursorPosition + textToInsert.length;
            lrcInputAreaElement.selectionStart = newCursorPosition;
            lrcInputAreaElement.selectionEnd = newCursorPosition;
            lrcInputAreaElement.dispatchEvent(new Event('input', { bubbles: true }));
            lrcInputAreaElement.focus();
        });
    }
    if (resetButton) { 
        resetButton.addEventListener("click", (event) => {
            event.preventDefault();
            pauseEditorAndResetButton(); 
            lyricsEditorAudio.currentTime = 0;
            if(progressBar) progressBar.value = 0;
            if(currentTimeDisplay) currentTimeDisplay.textContent = formatTime(0);
            currentPlaybackSpeed = 1.0;
            lyricsEditorAudio.playbackRate = currentPlaybackSpeed;
            resetPreviewHighlights(); 
            updatePreviewHighlight(0); 
        });
    } 
    if (lyricsEditorPlayButtonIcon) lyricsEditorPlayButtonIcon.textContent = lyricsEditorAudio.paused ? "play_arrow" : "pause";
    lyricsEditorAudio.addEventListener('ended', () => { 
        if (lyricsEditorPlayButtonIcon) lyricsEditorPlayButtonIcon.textContent = "play_arrow";
        if(progressBar) progressBar.value = 0; 
        if(currentTimeDisplay) currentTimeDisplay.textContent = formatTime(0); 
        resetPreviewHighlights();
        updatePreviewHighlight(0); 
    });
    if (progressBar && currentTimeDisplay && durationDisplay) { 
        lyricsEditorAudio.addEventListener('loadedmetadata', () => {
            durationDisplay.textContent = formatTime(lyricsEditorAudio.duration);
            progressBar.max = lyricsEditorAudio.duration; 
            progressBar.value = lyricsEditorAudio.currentTime; 
            updatePreviewHighlight(lyricsEditorAudio.currentTime); 
        });
        lyricsEditorAudio.addEventListener('timeupdate', () => {
            currentTimeDisplay.textContent = formatTime(lyricsEditorAudio.currentTime);
            if (!isNaN(lyricsEditorAudio.duration)) progressBar.value = lyricsEditorAudio.currentTime;
            updatePreviewHighlight(lyricsEditorAudio.currentTime); 
        });
        progressBar.addEventListener('input', (event) => {
            if (!isNaN(lyricsEditorAudio.duration)) {
                const seekTime = parseFloat(event.target.value);
                lyricsEditorAudio.currentTime = seekTime;
                if (lyricsEditorAudio.paused) updatePreviewHighlight(seekTime);
            }
        });
    }
}

export function parseLRC(lrcString) { 
    const lines = lrcString.trim().split('\n');
    const parsedLyrics = [];
    const timeTagRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    const wordTimeTagRegex = /<(\d{2}):(\d{2})\.(\d{2,3})>/g;
    let lastLineTime = -1;

    for (let i = 0; i < lines.length; i++) {
        const lineStr = lines[i].trim();
        if (!lineStr) continue;

        const lineMatch = lineStr.match(timeTagRegex);
        if (!lineMatch) {
            if (lineStr.startsWith('[') || lineStr.includes(']')) { 
                return { lyrics: parsedLyrics, error: { message: `Invalid line timestamp format. Expected [mm:ss.xx].`, lineNumber: i + 1 } };
            }
            continue;
        }

        const lineMinutes = parseInt(lineMatch[1], 10);
        const lineSeconds = parseInt(lineMatch[2], 10);
        const lineMillisStr = lineMatch[3];
        const lineMillis = parseInt(lineMillisStr, 10);
        const millisFactor = lineMillisStr.length === 2 ? 100 : 1000;

        if (
            lineMinutes < 0 || lineMinutes > 59 ||
            lineSeconds < 0 || lineSeconds > 59 ||
            lineMillis < 0 || (millisFactor === 100 && lineMillis > 99) || (millisFactor === 1000 && lineMillis > 999)
        ) {
            return { lyrics: parsedLyrics, error: { message: `Invalid time values in line timestamp.`, lineNumber: i + 1 } };
        }

        const lineTime = lineMinutes * 60 + lineSeconds + lineMillis / millisFactor;

        if (lineTime < lastLineTime) {
            return { lyrics: parsedLyrics, error: { message: `Line timestamps not in chronological order.`, lineNumber: i + 1 } };
        }
        lastLineTime = lineTime;

        let textContent = lineStr.substring(lineMatch[0].length).trim();
        const words = [];
        let plainTextOnlyForLine = textContent;
        let lastWordTime = -1;

        if (textContent.includes('<')) {
            plainTextOnlyForLine = '';
            const parts = textContent.split(/(<[^>]+>)/);
            let currentAbsWordTime = lineTime;

            for (const part of parts) {
                if (part.match(wordTimeTagRegex)) {
                    const wordMatch = part.match(/<(\d{2}):(\d{2})\.(\d{2,3})>/);
                    if (!wordMatch) { 
                        return { lyrics: parsedLyrics, error: { message: `Invalid word timestamp format.`, lineNumber: i + 1 } };
                    }
                    const wordMinutes = parseInt(wordMatch[1], 10);
                    const wordSeconds = parseInt(wordMatch[2], 10);
                    const wordMillisStr = wordMatch[3];
                    const wordMillis = parseInt(wordMillisStr, 10);
                    const wordMillisFactor = wordMillisStr.length === 2 ? 100 : 1000;

                    if (
                        wordMinutes < 0 || wordMinutes > 59 ||
                        wordSeconds < 0 || wordSeconds > 59 ||
                        wordMillis < 0 || (wordMillisFactor === 100 && wordMillis > 99) || (wordMillisFactor === 1000 && wordMillis > 999)
                    ) {
                        return { lyrics: parsedLyrics, error: { message: `Invalid time values in word timestamp.`, lineNumber: i + 1 } };
                    }

                    const wordTimeOffset = wordMinutes * 60 + wordSeconds + wordMillis / wordMillisFactor;

                    if (wordTimeOffset < lastWordTime) {
                        return { lyrics: parsedLyrics, error: { message: `Word timestamps not in chronological order within line.`, lineNumber: i + 1 } };
                    }

                    lastWordTime = wordTimeOffset;
                    currentAbsWordTime = lineTime + wordTimeOffset;

                } else if (part.trim()) {
                    words.push({ time: currentAbsWordTime, text: part.trim() });
                    plainTextOnlyForLine += part.trim() + " ";
                }
            }

            plainTextOnlyForLine = plainTextOnlyForLine.trim();
        }

        parsedLyrics.push({
            time: lineTime,
            text: plainTextOnlyForLine,
            words: words.length > 0 ? words : null
        });
    }

    return { lyrics: parsedLyrics.sort((a, b) => a.time - b.time), error: null };
};

export function renderLyricsPreview(parsedLyricsToRender, targetElementSelectorOrElement) {
    const lyricsToUse = currentParsedLyrics; 
    if (typeof targetElementSelectorOrElement === 'string') {
        lrcPreviewAreaElement = document.querySelector(targetElementSelectorOrElement);
    } else {
        lrcPreviewAreaElement = targetElementSelectorOrElement;
    }
    if (!lrcPreviewAreaElement) return;
    resetPreviewHighlights(); 
    lrcPreviewAreaElement.innerHTML = ''; 

    if (!lyricsToUse || lyricsToUse.length === 0) {
        const errorIsPresent = lrcErrorDisplayElement && lrcErrorDisplayElement.textContent !== '';
        lrcPreviewAreaElement.textContent = errorIsPresent ? 'Fix errors in LRC content to see preview.' : 'No lyrics to display or invalid LRC format.';
        return;
    }

    lyricsToUse.forEach(line => {
        const p = document.createElement('p');
        p.classList.add('lyric-line');
        p.dataset.time = line.time.toFixed(3);
        if (line.words && line.words.length > 0) {
            line.words.forEach(word => {
                const span = document.createElement('span');
                span.classList.add('lyric-word');
                span.textContent = word.text + ' '; 
                span.dataset.time = word.time.toFixed(3);
                p.appendChild(span);
            });
        } else {
            p.textContent = line.text;
        }
        lrcPreviewAreaElement.appendChild(p);
    });
};
