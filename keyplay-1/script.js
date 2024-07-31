let rfidDatabase = {};
let playedVideos = {};
let inputBuffer = '';
let audioContext = null;
let gainNodeA = null;
let gainNodeB = null;
let masterGainNode = null;
let midiAccess = null;
let midiInput = null;
let crossFadeInProgress = false;
let transitionsEnabled = true;
let midiInitialized = false;
let transitionInProgress = false;
let latestVideoData = null;
let currentVideoPlayer;
let nextVideoPlayer;
let waitForEndEnabled = false;
let preloadedVideoData = null;

const debugMenu = document.getElementById('debugMenu');
const keystrokeLog = document.getElementById('keystrokeLog');
const loggingCheckbox = document.getElementById('loggingCheckbox');
const controlsCheckbox = document.getElementById('controlsCheckbox');
const infoCheckbox = document.getElementById('infoCheckbox');
const midiCheckbox = document.getElementById('midiCheckbox');
const transitionCheckbox = document.getElementById('transitionCheckbox');
const waitForEndCheckbox = document.getElementById('waitForEndCheckbox');
const videoPlayerA = document.getElementById('videoPlayerA');
const videoPlayerB = document.getElementById('videoPlayerB');
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

let FADE_DURATION = 1000;

document.addEventListener('DOMContentLoaded', initialize);
document.addEventListener('click', resumeAudioContext);
document.addEventListener('keydown', handleKeydown);

function initialize() {
  currentVideoPlayer = videoPlayerA;
  nextVideoPlayer = videoPlayerB;
  fetch('rfidDatabase.json')
    .then(response => response.json())
    .then(data => {
      rfidDatabase = data;
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
  videoPlayerA.addEventListener('ended', handleVideoEnded);
  videoPlayerB.addEventListener('ended', handleVideoEnded);
  debugToggleButton.addEventListener('click', toggleDebugMenu);
  playPauseButton.addEventListener('click', togglePlayPause);
  fullscreenButton.addEventListener('click', toggleFullscreen);
}

function initializeAudioContext() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  gainNodeA = audioContext.createGain();
  gainNodeB = audioContext.createGain();
  masterGainNode = audioContext.createGain();

  const sourceA = audioContext.createMediaElementSource(videoPlayerA);
  const sourceB = audioContext.createMediaElementSource(videoPlayerB);

  sourceA.connect(gainNodeA).connect(masterGainNode).connect(audioContext.destination);
  sourceB.connect(gainNodeB).connect(masterGainNode).connect(audioContext.destination);

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
      preloadVideo(videoData);
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
    checkVideoFileExists(videoData.video).then(exists => {
      if (exists) playVideo(videoData);
      else {
        console.error(`Video file not found: ${videoData.video}`);
        transitionInProgress = false;
        processVideoQueue();
      }
    });
  }
}

function checkVideoFileExists(videoUrl) {
  return fetch(videoUrl, { method: 'HEAD' }).then(response => response.ok).catch(() => false);
}

function preloadVideo(videoData) {
  nextVideoPlayer.src = videoData.video;
  nextVideoPlayer.load();
  console.log(`Preloaded video: ${videoData.video}`);
}

function playVideo(videoData) {
  transitionInProgress = true;
  nextVideoPlayer.src = videoData.video;
  nextVideoPlayer.load();
  nextVideoPlayer.style.display = 'block';
  if (!transitionsEnabled) {
    standbyScreen.style.opacity = 0;
    standbyScreen.style.display = 'none';
    nextVideoPlayer.play();
    nextVideoPlayer.style.opacity = '1';
    setVolumeForNextVideoPlayer();
    currentVideoPlayer.style.display = 'none';
    transitionInProgress = false;
    currentVideoPlayer = nextVideoPlayer;
    nextVideoPlayer = (currentVideoPlayer === videoPlayerA) ? videoPlayerB : videoPlayerA;
    videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
    videoName.innerText = videoData.name;
    videoCaption.innerText = videoData.caption;
    return;
  }
  crossFadeVideos(videoData.video, () => {
    videoName.innerText = videoData.name;
    videoCaption.innerText = videoData.caption;
    videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
    currentVideoPlayer = nextVideoPlayer;
    nextVideoPlayer = (currentVideoPlayer === videoPlayerA) ? videoPlayerB : videoPlayerA;
  });
}

function crossFadeVideos(newSource, callback) {
  crossFadeInProgress = true;
  const fadeOutElement = currentVideoPlayer;
  const fadeInElement = nextVideoPlayer;
  const fadeOutGainNode = (fadeOutElement === videoPlayerA) ? gainNodeA : gainNodeB;
  const fadeInGainNode = (fadeInElement === videoPlayerA) ? gainNodeA : gainNodeB;

  if (!fadeOutGainNode || !fadeInGainNode) {
    console.error('Gain nodes are not properly initialized');
    crossFadeInProgress = false;
    transitionInProgress = false;
    return;
  }

  nextVideoPlayer.src = newSource;
  nextVideoPlayer.style.mixBlendMode = 'add';

  fadeElement(fadeOutElement, fadeInElement, fadeOutGainNode, fadeInGainNode, () => {
    fadeOutElement.pause();
    crossFadeInProgress = false;
    transitionInProgress = false;
    fadeInElement.onended = handleVideoEnded;
    if (callback) callback();
  });

  nextVideoPlayer.style.display = 'block';
  nextVideoPlayer.play();
  standbyScreen.style.opacity = 0;
  standbyScreen.style.display = 'none';
}

function fadeElement(fadeOutElement, fadeInElement, fadeOutGainNode, fadeInGainNode, callback) {
  if (!fadeOutGainNode || !fadeInGainNode) {
    if (callback) callback();
    return;
  }

  const duration = transitionsEnabled ? FADE_DURATION / 1000 : 0; // Convert milliseconds to seconds
  const currentTime = audioContext.currentTime;

  // Set initial gain values
  fadeOutGainNode.gain.setValueAtTime(fadeOutElement.paused ? 0 : 1, currentTime);
  fadeInGainNode.gain.setValueAtTime(0, currentTime);

  // Schedule gain changes
  fadeOutGainNode.gain.linearRampToValueAtTime(0, currentTime + duration);
  fadeInGainNode.gain.linearRampToValueAtTime(1, currentTime + duration);

  // Manage the opacity and display of video elements using requestAnimationFrame
  const initialOpacity = 0;
  const finalOpacity = 1;
  let start = null;

  function step(timestamp) {
    if (!start) start = timestamp;
    const progress = timestamp - start;
    const opacity = initialOpacity + (finalOpacity - initialOpacity) * (progress / (duration * 1000));

    fadeInElement.style.opacity = opacity;
    fadeOutElement.style.opacity = 1 - opacity;

    if (progress < duration * 1000) {
      requestAnimationFrame(step);
    } else {
      fadeInElement.style.opacity = finalOpacity;
      fadeOutElement.style.opacity = initialOpacity;

      fadeOutElement.style.display = 'none';

      if (callback) callback();
    }
  }

  fadeInElement.style.display = 'block';
  requestAnimationFrame(step);
}

function handleVideoEnded() {
  if (waitForEndEnabled && preloadedVideoData) {
    playPreloadedVideo();
  } else if (!crossFadeInProgress) {
    enterStandbyMode();
  }
}

function playPreloadedVideo() {
  nextVideoPlayer.style.display = 'block';
  nextVideoPlayer.play();
  standbyScreen.style.opacity = 0;
  standbyScreen.style.display = 'none';
  currentVideoPlayer.style.display = 'none';
  currentVideoPlayer = nextVideoPlayer;
  nextVideoPlayer = (currentVideoPlayer === videoPlayerA) ? videoPlayerB : videoPlayerA;
  videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
  videoName.innerText = preloadedVideoData.name;
  videoCaption.innerText = preloadedVideoData.caption;
  preloadedVideoData = null;
  transitionInProgress = false;
}

function enterStandbyMode() {
  if (!standbyScreen) {
    console.error('Standby screen element not found.');
    return;
  }
  if (!crossFadeInProgress) {
    currentVideoPlayer.style.display = 'none';
    nextVideoPlayer.style.display = 'none';
    videoInfo.style.display = 'none';
    videoName.innerText = '';
    videoCaption.innerText = '';
    //standbyScreen.style.display = 'flex'; disable
    //standbyScreen.style.opacity = 1;
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
  videoPlayerA.controls = controlsCheckbox.checked;
  videoPlayerB.controls = controlsCheckbox.checked;
}

function toggleVideoInfo() {
  videoInfo.style.display = infoCheckbox.checked ? 'block' : 'none';
}

function resetVideoPlayers() {
  videoPlayerA.pause();
  videoPlayerB.pause();
  videoPlayerA.currentTime = 0;
  videoPlayerB.currentTime = 0;
  videoPlayerA.src = '';
  videoPlayerB.src = '';
  if (audioContext) {
    gainNodeA.gain.setValueAtTime(1, audioContext.currentTime);
    gainNodeB.gain.setValueAtTime(1, audioContext.currentTime);
  }
  currentVideoPlayer = videoPlayerA;
  nextVideoPlayer = videoPlayerB;
  if (!transitionsEnabled) {
    currentVideoPlayer.style.opacity = '1';
    nextVideoPlayer.style.opacity = '1';
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
    if (crossFadeInProgress) {
      crossFadeInProgress = false;
    }
    transitionInProgress = false;
    currentVideoPlayer.style.opacity = '1';
    nextVideoPlayer.style.opacity = '1';
    currentVideoPlayer.pause();
    currentVideoPlayer = nextVideoPlayer;
    nextVideoPlayer = (currentVideoPlayer === videoPlayerA) ? videoPlayerB : videoPlayerA;
    currentVideoPlayer.play();
    setVolumeForCurrentVideoPlayer();
  }
}

function setVolumeForCurrentVideoPlayer() {
  if (currentVideoPlayer === videoPlayerA) {
    gainNodeA.gain.setValueAtTime(1, audioContext.currentTime);
    gainNodeB.gain.setValueAtTime(0, audioContext.currentTime);
  } else {
    gainNodeA.gain.setValueAtTime(0, audioContext.currentTime);
    gainNodeB.gain.setValueAtTime(1, audioContext.currentTime);
  }
}

function setVolumeForNextVideoPlayer() {
  if (nextVideoPlayer === videoPlayerA) {
    gainNodeA.gain.setValueAtTime(1, audioContext.currentTime);
    gainNodeB.gain.setValueAtTime(0, audioContext.currentTime);
  } else {
    gainNodeA.gain.setValueAtTime(0, audioContext.currentTime);
    gainNodeB.gain.setValueAtTime(1, audioContext.currentTime);
  }
}

function togglePlayPause() {
  [videoPlayerA, videoPlayerB].forEach(player => {
    if (player.paused) {
      player.play();
    } else {
      player.pause();
    }
  });
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
