// audio.js — фоновая музыка, эмбиент локаций, настройки громкости.

const PREFS_KEY = "sabbatical_audio_v1";
const MUSIC_URL = "assets/music/music1.mp3";
const SOUNDS_DIR = "assets/sounds/";

const DEFAULT_PREFS = {
  musicEnabled: true,
  soundsEnabled: true,
  musicVolume: 0.18,
  soundsVolume: 0.22,
};

let prefs = loadPrefs();
let musicAudio = null;
let musicStarted = false;
let ambientAudio = null;
let currentAmbientTrack = null;
let currentAmbientLocationId = null;
const houseSoundPick = new Map();

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      musicEnabled: parsed.musicEnabled !== false,
      soundsEnabled: parsed.soundsEnabled !== false,
      musicVolume: clamp01(parsed.musicVolume ?? DEFAULT_PREFS.musicVolume),
      soundsVolume: clamp01(parsed.soundsVolume ?? DEFAULT_PREFS.soundsVolume),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn("[audio] prefs save failed", err);
  }
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function wireLoop(audio) {
  audio.loop = true;
  audio.addEventListener("ended", () => {
    audio.currentTime = 0;
    const attempt = audio.play();
    if (attempt?.catch) {
      attempt.catch((err) => console.warn("[audio] loop restart failed:", err));
    }
  });
}

function getMusicAudio() {
  if (!musicAudio) {
    musicAudio = new Audio(MUSIC_URL);
    musicAudio.preload = "auto";
    wireLoop(musicAudio);
  }
  applyMusicVolume();
  return musicAudio;
}

function applyMusicVolume() {
  if (!musicAudio) return;
  musicAudio.volume = prefs.musicEnabled ? prefs.musicVolume : 0;
}

function applyAmbientVolume() {
  if (!ambientAudio) return;
  ambientAudio.volume = prefs.soundsEnabled ? prefs.soundsVolume : 0;
}

function applyVolumes() {
  applyMusicVolume();
  applyAmbientVolume();
}

function isHouseOrLighthouse(locId) {
  return locId === "lighthouse" || locId.endsWith("house");
}

function pickHouseSound(locId) {
  if (!houseSoundPick.has(locId)) {
    houseSoundPick.set(locId, Math.random() < 0.5 ? "forrest" : "forrest2");
  }
  return houseSoundPick.get(locId);
}

function ambientTrackForLocation(locId) {
  if (locId === "beach" || locId === "bar") return "sea";
  if (locId === "forest" || locId === "thicket") return "forrest3";
  if (isHouseOrLighthouse(locId)) return pickHouseSound(locId);
  return null;
}

function stopAmbientPlayback() {
  if (!ambientAudio) return;
  ambientAudio.pause();
  ambientAudio.currentTime = 0;
  ambientAudio = null;
  currentAmbientTrack = null;
}

function playAmbient(trackName) {
  if (
    currentAmbientTrack === trackName &&
    ambientAudio &&
    !ambientAudio.paused
  ) {
    applyAmbientVolume();
    return;
  }

  stopAmbientPlayback();
  ambientAudio = new Audio(`${SOUNDS_DIR}${trackName}.mp3`);
  currentAmbientTrack = trackName;
  ambientAudio.preload = "auto";
  wireLoop(ambientAudio);
  applyAmbientVolume();
  const attempt = ambientAudio.play();
  if (attempt?.catch) {
    attempt.catch((err) => console.warn("[audio] ambient blocked:", err));
  }
}

function resumeMusicIfNeeded() {
  if (!musicStarted || !prefs.musicEnabled) return;
  const attempt = getMusicAudio().play();
  if (attempt?.catch) {
    attempt.catch((err) => console.warn("[audio] music resume failed:", err));
  }
}

function resumeAmbientIfNeeded() {
  if (!currentAmbientLocationId || !prefs.soundsEnabled) return;
  const track = ambientTrackForLocation(currentAmbientLocationId);
  if (track) playAmbient(track);
}

export function getAudioPrefs() {
  return { ...prefs };
}

export function setAudioPrefs(patch) {
  const wasMusicEnabled = prefs.musicEnabled;
  const wasSoundsEnabled = prefs.soundsEnabled;

  prefs = {
    ...prefs,
    ...patch,
    musicVolume: patch.musicVolume != null ? clamp01(patch.musicVolume) : prefs.musicVolume,
    soundsVolume: patch.soundsVolume != null ? clamp01(patch.soundsVolume) : prefs.soundsVolume,
  };
  savePrefs();
  applyVolumes();

  const musicToggled = patch.musicEnabled !== undefined && patch.musicEnabled !== wasMusicEnabled;
  const soundsToggled = patch.soundsEnabled !== undefined && patch.soundsEnabled !== wasSoundsEnabled;

  if (musicToggled) {
    if (!prefs.musicEnabled) musicAudio?.pause();
    else resumeMusicIfNeeded();
  }

  if (soundsToggled) {
    if (!prefs.soundsEnabled) stopAmbientPlayback();
    else resumeAmbientIfNeeded();
  }
}

export function startBackgroundMusic() {
  if (!prefs.musicEnabled) return;
  if (musicStarted) {
    resumeMusicIfNeeded();
    return;
  }
  musicStarted = true;
  const attempt = getMusicAudio().play();
  if (attempt?.catch) {
    attempt.catch((err) => {
      console.warn("[audio] music blocked:", err);
      musicStarted = false;
    });
  }
}

export function stopBackgroundMusic() {
  if (!musicAudio) return;
  musicAudio.pause();
  musicAudio.currentTime = 0;
  musicStarted = false;
}

export function setAmbientForLocation(locId) {
  currentAmbientLocationId = locId || null;
  if (!locId || !prefs.soundsEnabled) {
    stopAmbientPlayback();
    return;
  }
  const track = ambientTrackForLocation(locId);
  if (!track) {
    stopAmbientPlayback();
    return;
  }
  playAmbient(track);
}

export function clearAmbient() {
  currentAmbientLocationId = null;
  stopAmbientPlayback();
}

export function resetAudioSession() {
  stopBackgroundMusic();
  clearAmbient();
  houseSoundPick.clear();
}

export function isBackgroundMusicPlaying() {
  return Boolean(musicAudio && !musicAudio.paused);
}

const AUDIO_CONTROL_SETS = [
  {
    musicToggle: "audio-music-enabled",
    soundsToggle: "audio-sounds-enabled",
    musicVolume: "audio-music-volume",
    soundsVolume: "audio-sounds-volume",
    root: "menu-audio",
  },
  {
    musicToggle: "splash-audio-music-enabled",
    soundsToggle: "splash-audio-sounds-enabled",
    musicVolume: "splash-audio-music-volume",
    soundsVolume: "splash-audio-sounds-volume",
    root: "splash-audio",
  },
];

function getControlElements(set) {
  const musicToggle = document.getElementById(set.musicToggle);
  const soundsToggle = document.getElementById(set.soundsToggle);
  const musicVolume = document.getElementById(set.musicVolume);
  const soundsVolume = document.getElementById(set.soundsVolume);
  if (!musicToggle || !soundsToggle || !musicVolume || !soundsVolume) return null;
  return { musicToggle, soundsToggle, musicVolume, soundsVolume };
}

function syncControlSet(set) {
  const els = getControlElements(set);
  if (!els) return;
  const p = getAudioPrefs();
  els.musicToggle.checked = p.musicEnabled;
  els.soundsToggle.checked = p.soundsEnabled;
  els.musicVolume.value = String(Math.round(p.musicVolume * 100));
  els.soundsVolume.value = String(Math.round(p.soundsVolume * 100));
  els.musicVolume.disabled = !p.musicEnabled;
  els.soundsVolume.disabled = !p.soundsEnabled;
}

function syncAllAudioControls() {
  for (const set of AUDIO_CONTROL_SETS) syncControlSet(set);
}

function wireAudioControlSet(set) {
  const els = getControlElements(set);
  if (!els) return;

  const onMusicVolume = () => {
    setAudioPrefs({ musicVolume: Number(els.musicVolume.value) / 100 });
    syncAllAudioControls();
  };
  const onSoundsVolume = () => {
    setAudioPrefs({ soundsVolume: Number(els.soundsVolume.value) / 100 });
    syncAllAudioControls();
  };

  els.musicToggle.addEventListener("change", () => {
    setAudioPrefs({ musicEnabled: els.musicToggle.checked });
    syncAllAudioControls();
  });
  els.soundsToggle.addEventListener("change", () => {
    setAudioPrefs({ soundsEnabled: els.soundsToggle.checked });
    syncAllAudioControls();
  });
  els.musicVolume.addEventListener("input", onMusicVolume);
  els.musicVolume.addEventListener("change", onMusicVolume);
  els.soundsVolume.addEventListener("input", onSoundsVolume);
  els.soundsVolume.addEventListener("change", onSoundsVolume);

  const root = set.root ? document.getElementById(set.root) : null;
  root?.addEventListener("pointerdown", (e) => e.stopPropagation());
  root?.addEventListener("click", (e) => e.stopPropagation());
}

export function initAudioMenu() {
  for (const set of AUDIO_CONTROL_SETS) wireAudioControlSet(set);
  syncAllAudioControls();
}

export function syncAudioMenu() {
  syncAllAudioControls();
}
