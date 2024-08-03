let rfidDatabase = {};
let playedVideos = {};
let inputBuffer = '';
let audioContext = null;
let gainNode = null;
let masterGainNode = null;
let midiAccess = null;
let midiInput = null;
let transitionsEnabled = true;
let midiInitialized = false;
let transitionInProgress = false;
let latestVideoData = null;
let currentVideoPlayer = null;
let waitForEndEnabled = false;
let preloadedVideoData = null;
let preloadedVideos = {};
const maxRetries = 3;
const preloadDelay = 200; // Delay between preloading videos (in ms)
let preloadQueue = [];
let isPreloading = false;
let loadedVideosSet = new Set();

const debugMenu = document.getElementById('debugMenu');
const keystrokeLog = document.getElementById('keystrokeLog');
const loggingCheckbox = document.getElementById('loggingCheckbox');
const controlsCheckbox = document.getElementById('controlsCheckbox');
const infoCheckbox = document.getElementById('infoCheckbox');
const midiCheckbox = document.getElementById('midiCheckbox');
const transitionCheckbox = document.getElementById('transitionCheckbox');
const waitForEndCheckbox = document.getElementById('waitForEndCheckbox');
const videoPlayer = document.getElementById('videoPlayer'); // Ensure this element exists in your HTML
const videoInfo = document.getElementById('videoInfo');
const videoName = document.getElementById('videoName');
const videoCaption = document.getElementById('videoCaption');
const standbyScreen = document.getElementById('standbyScreen');
const debugToggleButton = document.getElementById('debugToggleButton');
const masterVolume = document.getElementById('masterVolume');
const midiDeviceSelect = document.getElementById('midiDeviceSelect');
const transitionTimeSlider = document.getElementById('transitionTime');
const transitionTimeValue = document.getElementById('transitionTimeValue');
const playPauseButton = document.getElementById('playPauseButton');
const fullscreenButton = document.getElementById('fullscreenButton');
const progressBar = document.getElementById('progressBar');
const backgroundVideo = document.getElementById('backgroundVideo'); // Ensure this element exists in your HTML

let FADE_DURATION = 1000;

document.addEventListener('DOMContentLoaded', initialize);
document.addEventListener('click', resumeAudioContext);
document.addEventListener('keydown', handleKeydown);

function initialize() {
  if (!videoPlayer) {
    console.error('videoPlayer element not found.');
    return;
  }
  currentVideoPlayer = videoPlayer;
  preloadBackgroundVideo()
    .then(() => fetch('rfidDatabase.json'))
    .then(response => response.json())
    .then(data => {
      rfidDatabase = data;
      preloadAllVideos();
      generateTestButtons();
    })
    .catch(error => console.error('Error loading RFID database:', error));

  masterVolume.addEventListener('input', () => setMasterVolume(masterVolume.value));
  midiCheckbox.addEventListener('change', toggleMIDIInput);
  midiDeviceSelect.addEventListener('change', selectMIDIDevice);
  transitionTimeSlider.addEventListener('input', updateTransitionTime);
  transitionCheckbox.addEventListener('change', toggleTransitions);
  controlsCheckbox.addEventListener('change', toggleVideoControls);
  infoCheckbox.addEventListener('change', toggleVideoInfo);
  waitForEndCheckbox.addEventListener('change', toggleWaitForEnd);
  videoPlayer.addEventListener('ended', handleVideoEnded);
  debugToggleButton.addEventListener('click', toggleDebugMenu);
  playPauseButton.addEventListener('click', togglePlayPause);
  fullscreenButton.addEventListener('click', toggleFullscreen);
}

function preloadBackgroundVideo() {
  return new Promise((resolve, reject) => {
    backgroundVideo.preload = 'auto';
    backgroundVideo.oncanplaythrough = () => {
      console.log('Background video loaded');
      resolve();
    };
    backgroundVideo.onerror = (e) => {
      console.error('Error loading background video:', e);
      reject();
    };
    backgroundVideo.load();
  });
}

function preloadAllVideos() {
  const totalVideos = Object.keys(rfidDatabase).reduce((sum, key) => sum + rfidDatabase[key].videos.length, 0);
  let loadedVideos = 0;

  for (const key in rfidDatabase) {
    rfidDatabase[key].videos.forEach((videoSrc) => {
      if (!loadedVideosSet.has(videoSrc)) {
        preloadQueue.push({ videoSrc, onSuccess: () => {
          loadedVideos++;
          loadedVideosSet.add(videoSrc);
          updateProgressBar(loadedVideos, totalVideos);
          console.log(`Loaded video: ${videoSrc}`);
        }});
      }
    });
  }

  processPreloadQueue();
}

function processPreloadQueue() {
  if (isPreloading || preloadQueue.length === 0) return;

  isPreloading = true;
  const { videoSrc, onSuccess } = preloadQueue.shift();

  loadVideo(videoSrc, () => {
    onSuccess();
    isPreloading = false;
    setTimeout(processPreloadQueue, preloadDelay);
  });
}

function loadVideo(videoSrc, onSuccess, retries = 0) {
  if (!videoSrc) {
    console.error('Invalid video source.');
    return;
  }

  const videoElement = document.createElement('video');
  videoElement.src = videoSrc;
  videoElement.preload = 'auto';
  videoElement.style.display = 'none';

  videoElement.oncanplaythrough = () => {
    if (!preloadedVideos[videoSrc]) {
      preloadedVideos[videoSrc] = videoElement;
      document.body.appendChild(videoElement);
      onSuccess();
    }
  };

  videoElement.onerror = () => {
    console.error(`Error loading video: ${videoSrc}`);
    if (retries < maxRetries) {
      console.log(`Retrying to load video: ${videoSrc} (Attempt ${retries + 1})`);
      loadVideo(videoSrc, onSuccess, retries + 1);
    } else {
      isPreloading = false;
      setTimeout(processPreloadQueue, preloadDelay);
    }
  };

  videoElement.load();
}

function updateProgressBar(loadedVideos, totalVideos) {
  const progress = (loadedVideos / totalVideos) * 100;
  progressBar.value = progress;
}

function initializeAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  gainNode = audioContext.createGain();
  masterGainNode = audioContext.createGain();

  const source = audioContext.createMediaElementSource(videoPlayer);

  source.connect(gainNode).connect(masterGainNode).connect(audioContext.destination);

  console.log('AudioContext initialized');
}

function resumeAudioContext() {
  if (!audioContext) {
    initializeAudioContext();
  } else if (audioContext.state === 'suspended') {
    audioContext.resume().then(() => console.log('AudioContext resumed'));
  }
}

function handleKeydown(event) {
  resumeAudioContext();
  if (event.ctrlKey && event.shiftKey && event.key === 'D') {
    toggleDebugMenu();
  }
  handleRFIDInput(event);
  if (loggingCheckbox && loggingCheckbox.checked) {
    logKeystroke(event.key);
  }
}

function handleRFIDInput(event) {
  if (event.key === 'Enter') {
    const tag = inputBuffer.trim();
    if (tag) queueLatestVideoForTag(tag);
    inputBuffer = '';
  } else if (!event.ctrlKey && !event.altKey && !event.metaKey) {
    inputBuffer += event.key;
    if (loggingCheckbox && loggingCheckbox.checked) console.log('Current input buffer:', inputBuffer);
  }
}

function queueLatestVideoForTag(tag) {
  try {
    const videoData = getVideoForRFIDTagOrIdentifier(tag);
    if (waitForEndEnabled) {
      preloadedVideoData = videoData;
    } else {
      latestVideoData = videoData;
      processVideoQueue();
    }
  } catch (error) {
    console.error(error);
  }
}

function getVideoForRFIDTagOrIdentifier(tagOrIdentifier) {
  for (const index in rfidDatabase) {
    if (rfidDatabase[index].keytag.includes(tagOrIdentifier) || index === tagOrIdentifier) {
      if (!playedVideos[index]) playedVideos[index] = [...rfidDatabase[index].videos];
      if (playedVideos[index].length === 0) playedVideos[index] = [...rfidDatabase[index].videos];
      const randomIndex = Math.floor(Math.random() * playedVideos[index].length);
      const video = playedVideos[index].splice(randomIndex, 1)[0];
      return { video, name: rfidDatabase[index].name, caption: rfidDatabase[index].caption };
    }
  }
  throw new Error(`Tag or identifier not found in database: ${tagOrIdentifier}`);
}

function processVideoQueue() {
  if (!transitionInProgress && latestVideoData) {
    const videoData = latestVideoData;
    latestVideoData = null;
    playVideo(videoData);
  }
}

function playVideo(videoData) {
  if (!currentVideoPlayer) {
    console.error('No video player available.');
    return;
  }
  transitionInProgress = true;
  const preloadedVideo = preloadedVideos[videoData.video];
  if (preloadedVideo) {
    currentVideoPlayer.src = preloadedVideo.src;
    currentVideoPlayer.load();
    currentVideoPlayer.style.display = 'block';
    if (!transitionsEnabled) {
      standbyScreen.style.opacity = 0;
      standbyScreen.style.display = 'none';
      currentVideoPlayer.play();
      currentVideoPlayer.style.opacity = '1';
      transitionInProgress = false;
      videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
      videoName.innerText = videoData.name;
      videoCaption.innerText = videoData.caption;
      return;
    }
    crossFadeVideo(videoData.video, () => {
      videoName.innerText = videoData.name;
      videoCaption.innerText = videoData.caption;
      videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
    });
  } else {
    console.error(`Preloaded video not found: ${videoData.video}`);
    transitionInProgress = false;
  }
}

function crossFadeVideo(newSource, callback) {
  crossFadeInProgress = true;
  const fadeOutElement = currentVideoPlayer;
  const fadeOutGainNode = gainNode;

  if (!fadeOutGainNode) {
    console.error('Gain node is not properly initialized');
    crossFadeInProgress = false;
    transitionInProgress = false;
    return;
  }

  currentVideoPlayer.src = newSource;
  currentVideoPlayer.style.mixBlendMode = 'add';

  fadeElement(fadeOutElement, fadeOutGainNode, () => {
    fadeOutElement.pause();
    crossFadeInProgress = false;
    transitionInProgress = false;
    currentVideoPlayer.onended = handleVideoEnded;
    if (callback) callback();
  });

  currentVideoPlayer.style.display = 'block';
  currentVideoPlayer.play();
  standbyScreen.style.opacity = 0;
  standbyScreen.style.display = 'none';
}

function fadeElement(fadeOutElement, fadeOutGainNode, callback) {
  if (!fadeOutGainNode) {
    if (callback) callback();
    return;
  }

  const duration = transitionsEnabled ? FADE_DURATION / 1000 : 0; // Convert milliseconds to seconds
  const currentTime = audioContext.currentTime;

  // Set initial gain values
  fadeOutGainNode.gain.setValueAtTime(fadeOutElement.paused ? 0 : 1, currentTime);

  // Schedule gain changes
  fadeOutGainNode.gain.linearRampToValueAtTime(0, currentTime + duration);

  // Manage the opacity and display of video elements using requestAnimationFrame
  const initialOpacity = 0;
  const finalOpacity = 1;
  let start = null;

  function step(timestamp) {
    if (!start) start = timestamp;
    const progress = timestamp - start;
    const opacity = initialOpacity + (finalOpacity - initialOpacity) * (progress / (duration * 1000));

    fadeOutElement.style.opacity = opacity;

    if (progress < duration * 1000) {
      requestAnimationFrame(step);
    } else {
      fadeOutElement.style.opacity = finalOpacity;

      fadeOutElement.style.display = 'none';

      if (callback) callback();
    }
  }

  fadeOutElement.style.display = 'block';
  requestAnimationFrame(step);
}

function handleVideoEnded() {
  enterStandbyMode();
  if (waitForEndEnabled && preloadedVideoData) {
    playPreloadedVideo();
  }
}

function playPreloadedVideo() {
  const preloadedVideo = preloadedVideos[preloadedVideoData.video];
  if (preloadedVideo) {
    currentVideoPlayer.src = preloadedVideo.src;
    currentVideoPlayer.load();
    currentVideoPlayer.style.display = 'block';
    currentVideoPlayer.play();
    standbyScreen.style.opacity = 0;
    standbyScreen.style.display = 'none';
    videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
    videoName.innerText = preloadedVideoData.name;
    videoCaption.innerText = preloadedVideoData.caption;
    preloadedVideoData = null;
    transitionInProgress = false;
  } else {
    console.error(`Preloaded video not found: ${preloadedVideoData.video}`);
  }
}

function enterStandbyMode() {
  if (!standbyScreen) {
    console.error('Standby screen element not found.');
    return;
  }
  if (!crossFadeInProgress) {
    currentVideoPlayer.style.display = 'none';
    videoInfo.style.display = 'none';
    videoName.innerText = '';
    videoCaption.innerText = '';
    standbyScreen.style.display = 'flex';
    standbyScreen.style.opacity = 1;
    backgroundVideo.style.display = 'block';
    backgroundVideo.style.opacity = 1;
  }
}

function setMasterVolume(level) {
  if (audioContext && masterGainNode) {
    masterGainNode.gain.setValueAtTime(level, audioContext.currentTime);
  }
}

function toggleDebugMenu() {
  debugMenu.style.display = (debugMenu.style.display === 'none' || debugMenu.style.display === '') ? 'block' : 'none';
  if (debugMenu.style.display === 'block') {
    generateTestButtons();
    if (midiCheckbox.checked && !midiInitialized) {
      enableMIDIInput();
    }
  }
}

function generateTestButtons() {
  const testButtonsDiv = document.getElementById('testButtons');
  testButtonsDiv.innerHTML = '';
  for (const index in rfidDatabase) {
    const button = document.createElement('button');
    button.textContent = index;
    button.onclick = () => simulateRFIDInput(index);
    testButtonsDiv.appendChild(button);
  }
}

function simulateRFIDInput(tag) {
  queueLatestVideoForTag(tag);
}

function logKeystroke(key) {
  keystrokeLog.innerText += key + ' ';
}

function updateTransitionTime() {
  FADE_DURATION = parseInt(transitionTimeSlider.value, 10);
  transitionTimeValue.textContent = transitionTimeSlider.value;
}

function toggleTransitions() {
  transitionsEnabled = transitionCheckbox.checked;
  if (!transitionsEnabled && transitionInProgress) {
    // Finish current transition immediately
    finishTransition();
  }
}

function toggleVideoControls() {
  videoPlayer.controls = controlsCheckbox.checked;
}

function toggleVideoInfo() {
  videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
}

function resetVideoPlayers() {
  videoPlayer.pause();
  videoPlayer.currentTime = 0;
  videoPlayer.src = '';
  if (audioContext) {
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
  }
  videoPlayer.style.opacity = '1';
  if (!transitionsEnabled) {
    setVolumeForCurrentVideoPlayer();
  }
}

function toggleMIDIInput() {
  if (midiCheckbox.checked) {
    enableMIDIInput();
  } else {
    disableMIDIInput();
  }
}

function enableMIDIInput() {
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
  } else {
    console.error('WebMIDI is not supported in this browser.');
  }
}

function disableMIDIInput() {
  if (midiInput) {
    midiInput.onmidimessage = null;
    midiInput = null;
  }
}

function selectMIDIDevice(event) {
  if (midiInput) {
    midiInput.onmidimessage = null;
  }
  const selectedDeviceId = event.target.value;
  midiInput = midiAccess.inputs.get(selectedDeviceId);
  if (midiInput) {
    midiInput.onmidimessage = handleMIDIMessage;
  }
}

function onMIDISuccess(midi) {
  midiAccess = midi;
  midiInitialized = true;
  const inputs = midiAccess.inputs.values();
  midiDeviceSelect.innerHTML = '';
  for (let input of inputs) {
    const option = document.createElement('option');
    option.value = input.id;
    option.text = input.name;
    midiDeviceSelect.appendChild(option);
  }
  if (midiDeviceSelect.options.length > 0) {
    midiDeviceSelect.selectedIndex = 0;
    midiInput = midiAccess.inputs.get(midiDeviceSelect.value);
    if (midiInput) {
      midiInput.onmidimessage = handleMIDIMessage;
    }
  } else {
    console.warn('No MIDI input devices detected.');
  }
}

function onMIDIFailure() {
  console.error('Failed to access MIDI devices.');
}

function handleMIDIMessage(message) {
  const [status, data1, data2] = message.data;
  if (status === 0x90 && data2 !== 0) {
    for (const index in rfidDatabase) {
      if (rfidDatabase[index].NoteOnMidiMap === data1) {
        queueLatestVideoForTag(index);
        break;
      }
    }
  }
}

function finishTransition() {
  if (transitionInProgress) {
    crossFadeInProgress = false;
    transitionInProgress = false;
    currentVideoPlayer.style.opacity = '1';
    currentVideoPlayer.play();
    setVolumeForCurrentVideoPlayer();
  }
}

function setVolumeForCurrentVideoPlayer() {
  gainNode.gain.setValueAtTime(1, audioContext.currentTime);
}

function togglePlayPause() {
  if (videoPlayer.paused) {
    videoPlayer.play();
  } else {
    videoPlayer.pause();
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
    });
  } else {
    document.exitFullscreen();
  }
}

function toggleWaitForEnd() {
  waitForEndEnabled = waitForEndCheckbox.checked;
}
