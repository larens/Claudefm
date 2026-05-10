const port = chrome.runtime.connect({ name: "sidepanel" });

const elChat = document.getElementById("chat");
const elInput = document.getElementById("input");
const elSend = document.getElementById("send");
const elBtnMic = document.getElementById("btnMic");
const elComposerHint = document.getElementById("composerHint");
const elAvatarBtn = document.getElementById("avatarBtn");
const elAvatarFile = document.getElementById("avatarFile");
const elAvatarImg = document.getElementById("avatarImg");
const elAvatarFallback = document.getElementById("avatarFallback");
const elDjDisplay = document.getElementById("djDisplay");
const elDjNameText = document.getElementById("djNameText");
const elDjEditIcon = document.getElementById("djEditIcon");
const elDjEdit = document.getElementById("djEdit");
const elDjNameInput = document.getElementById("djNameInput");
const elDjNameSave = document.getElementById("djNameSave");
const elDjNameCancel = document.getElementById("djNameCancel");
const elProviderName = document.getElementById("providerName");
const elBtnQueue = document.getElementById("btnQueue");
const elQueue = document.getElementById("queue");
const elQueueList = document.getElementById("queueList");
const elQueueCount = document.getElementById("queueCount");
const elBtnMemory = document.getElementById("btnMemory");
const elMemoryPanel = document.getElementById("memoryPanel");
const elMemoryClose = document.getElementById("btnMemoryClose");
const elMemoryStatus = document.getElementById("memoryStatus");
const elMemoryContent = document.getElementById("memoryContent");

const elTrackTitle = document.getElementById("trackTitle");
const elTrackTime = document.getElementById("trackTime");
const elProgress = document.getElementById("progress");
const elBtnPlay = document.getElementById("btnPlay");
const elBtnNext = document.getElementById("btnNext");
const elBtnPrev = document.getElementById("btnPrev");
const elAudio = document.getElementById("audio");
const elInterruptHint = document.getElementById("interruptHint");

const audioA = elAudio;
const audioB = new Audio();
audioA.preload = "auto";
audioB.preload = "auto";

let queue = [];
let queueIndex = -1;
let interrupted = false;
let userPaused = false;
let segueSpokenInQueue = 0;
let seeking = false;
let hintTimer = null;
let recognizing = false;
let recognition = null;
let djName = "Claudio";
let activeAudio = audioA;
let preloadAudio = audioB;
let preloadIndex = -1;
let preloadStatus = "idle";
let preloadRequestToken = 0;
let playRequestToken = 0;

elDjDisplay.hidden = false;
elDjEdit.hidden = true;
elDjEdit.style.display = "none";

function getAudioDebugInfo(audio) {
  return {
    src: audio.currentSrc || audio.src || "",
    duration: audio.duration,
    currentTime: audio.currentTime,
    readyState: audio.readyState,
    networkState: audio.networkState,
  };
}

function resetAudioElement(audio) {
  try {
    audio.pause();
  } catch {}
  audio.removeAttribute("src");
  audio.load();
  audio.currentTime = 0;
}

function mergeResolvedTrack(track, resolved) {
  const streamUrl = (resolved?.streamUrl || "").replace(/`/g, "").trim();
  return {
    ...track,
    ...(resolved?.track || {}),
    streamUrl,
    provider: resolved?.provider || track.provider || "resolved",
    cover: resolved?.cover || track.cover || "",
    durationMs: resolved?.durationMs || track.durationMs || 0,
  };
}

function isPreloadedTrack(index) {
  return preloadIndex === index && preloadStatus === "ready" && Boolean(preloadAudio.src);
}

function clearPreload(reason = "reset") {
  preloadRequestToken += 1;
  preloadIndex = -1;
  preloadStatus = "idle";
  resetAudioElement(preloadAudio);
  console.log("[preload] cleared", { reason });
}

async function prefetchTrackAt(index) {
  if (index < 0 || index >= queue.length) return;
  if (index === queueIndex) return;
  if (preloadIndex === index && (preloadStatus === "resolving" || preloadStatus === "loading" || preloadStatus === "ready")) {
    return;
  }

  const track = queue[index];
  if (!track) return;

  const token = ++preloadRequestToken;
  preloadIndex = index;
  preloadStatus = "resolving";
  console.log("[preload] start", { index, track });

  try {
    const resolved = await resolveTrack(track);
    if (token !== preloadRequestToken) return;

    const streamUrl = (resolved?.streamUrl || "").replace(/`/g, "").trim();
    if (!streamUrl) throw new Error("prefetch resolve missing streamUrl");

    const mergedTrack = mergeResolvedTrack(track, resolved);
    queue[index] = mergedTrack;
    preloadStatus = "loading";
    resetAudioElement(preloadAudio);
    preloadAudio.src = streamUrl;
    preloadAudio.load();
    console.log("[preload] loading", { index, track: mergedTrack, streamUrl });
  } catch (error) {
    if (token !== preloadRequestToken) return;
    console.warn("[preload] failed", { index, track, error: String(error) });
    preloadIndex = -1;
    preloadStatus = "error";
    resetAudioElement(preloadAudio);
  }
}

function schedulePreloadForNextTrack() {
  const nextIndex = queueIndex + 1;
  if (nextIndex >= 0 && nextIndex < queue.length) {
    void prefetchTrackAt(nextIndex);
    return;
  }
  clearPreload("no-next-track");
}

async function activatePreloadedTrack(index) {
  if (!isPreloadedTrack(index)) return false;

  const nextTrack = queue[index];
  const previousAudio = activeAudio;
  const nextAudio = preloadAudio;

  console.log("[preload] swap", { index, track: nextTrack, audio: getAudioDebugInfo(nextAudio) });
  try {
    previousAudio.pause();
  } catch {}

  activeAudio = nextAudio;
  preloadAudio = previousAudio;
  preloadIndex = -1;
  preloadStatus = "idle";

  try {
    await activeAudio.play();
  } catch (error) {
    console.error("[preload] swap play failed", error, { index, track: nextTrack });
    activeAudio = previousAudio;
    preloadAudio = nextAudio;
    return false;
  }

  resetAudioElement(preloadAudio);
  updateTimeUI(activeAudio.currentTime, activeAudio.duration);
  updateProgressUI(activeAudio.currentTime, activeAudio.duration);
  setPlayingUI(true);
  port.postMessage({ type: "playbackState", playing: true });
  schedulePreloadForNextTrack();
  return true;
}

async function ensureMicPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (e) {
    const name = e?.name ? String(e.name) : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      setHint("麦克风权限被拒绝，请在系统与浏览器中允许 Chrome 使用麦克风后重试");
    } else {
      setHint("无法获取麦克风，请检查系统/浏览器麦克风权限");
    }
    return false;
  }
}

function formatTime(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "00:00";
  const t = Math.floor(s);
  const m = Math.floor(t / 60);
  const ss = t % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function updateTimeUI(currentSec, durationSec) {
  const current = formatTime(currentSec);
  const duration = formatTime(durationSec);
  elTrackTime.textContent = `${current} / ${duration}`;
}

function updateProgressUI(currentSec, durationSec) {
  if (!elProgress) return;
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    elProgress.value = "0";
    return;
  }
  const ratio = Math.min(1, Math.max(0, currentSec / durationSec));
  elProgress.value = String(Math.round(ratio * 1000));
}

function setButtonIcon(button, name) {
  if (!button) return;
  const icons = button.querySelectorAll("[data-icon]");
  icons.forEach((icon) => {
    const active = icon.dataset.icon === name;
    if (active) {
      icon.removeAttribute("hidden");
    } else {
      icon.setAttribute("hidden", "");
    }
    icon.style.display = active ? "block" : "none";
  });
}

function setPlayingUI(playing) {
  setButtonIcon(elBtnPlay, playing ? "pause" : "play");
  elBtnPlay.setAttribute("aria-label", playing ? "暂停" : "播放");
}

function buildTitle(track) {
  const name = track?.name ? String(track.name) : "";
  const artist = track?.artist ? String(track.artist) : "";
  if (!name && !artist) return "未播放";
  if (!name) return artist;
  if (!artist) return name;
  return `${name} - ${artist}`;
}

async function getPreferences() {
  const { preferences } = await chrome.storage.local.get("preferences");
  return preferences ?? {};
}

async function patchPreferences(patch) {
  const prefs = await getPreferences();
  const next = { ...prefs, ...patch };
  await chrome.storage.local.set({ preferences: next });
  return next;
}

function setAvatarUI(avatarDataUrl) {
  const src = avatarDataUrl ? String(avatarDataUrl) : "";
  if (src) {
    elAvatarImg.src = src;
    elAvatarImg.style.display = "block";
    elAvatarFallback.style.display = "none";
  } else {
    elAvatarImg.removeAttribute("src");
    elAvatarImg.style.display = "none";
    elAvatarFallback.style.display = "grid";
  }
}

function setDjNameUI(name) {
  const raw = name && String(name).trim() ? String(name).trim() : "Claudio";
  djName = Array.from(raw).slice(0, 8).join("") || "Claudio";
  elDjNameText.textContent = djName;
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  elChat.appendChild(div);
  elChat.scrollTop = elChat.scrollHeight;
}

function buildPlayListMessage(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return "";
  const lines = tracks.map((t, i) => {
    const name = t?.name ? String(t.name).trim() : "";
    const artist = t?.artist ? String(t.artist).trim() : "";
    const title = [name, artist].filter(Boolean).join(" - ").trim();
    return `${i + 1}. ${title || "未知歌曲"}`;
  });
  return `歌单推荐：\n${lines.join("\n")}`;
}

function renderQueue() {
  if (elQueueCount) elQueueCount.textContent = `（${queue.length}）`;
  elQueueList.innerHTML = "";
  queue.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "queueItem";
    row.addEventListener("click", () => {
      console.log("[renderQueue] row clicked, index:", i);
      void playAt(i);
    });

    const prefix = document.createElement("div");
    prefix.className = "queuePrefix";

    const index = document.createElement("div");
    index.className = "queueIndex";
    index.textContent = String(i + 1);

    const coverBox = document.createElement("div");
    coverBox.className = "queueCoverBox fallback";

    const cover = document.createElement("img");
    cover.className = "queueCover";
    cover.alt = "";
    cover.decoding = "async";
    cover.loading = "lazy";
    const coverUrl = t?.cover ? String(t.cover).trim() : "";
    if (coverUrl) {
      cover.src = coverUrl;
      coverBox.classList.remove("fallback");
    } else {
      cover.hidden = true;
    }
    cover.addEventListener("load", () => {
      cover.hidden = false;
      coverBox.classList.remove("fallback");
    });
    cover.addEventListener("error", () => {
      cover.hidden = true;
      cover.removeAttribute("src");
      coverBox.classList.add("fallback");
    });
    coverBox.appendChild(cover);

    prefix.appendChild(index);
    prefix.appendChild(coverBox);

    const meta = document.createElement("div");
    meta.className = "queueText";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = t.name || "未知歌曲";
    const artist = document.createElement("div");
    artist.className = "artist";
    artist.textContent = t.artist || "";
    meta.appendChild(name);
    meta.appendChild(artist);

    row.appendChild(prefix);
    row.appendChild(meta);
    if (i === queueIndex) {
      row.style.opacity = "1";
      row.style.fontWeight = "700";
    } else {
      row.style.opacity = "0.85";
    }
    elQueueList.appendChild(row);
  });
}

function setHint(text) {
  if (!elComposerHint) return;
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  if (!text) {
    elComposerHint.hidden = true;
    elComposerHint.textContent = "";
    return;
  }
  elComposerHint.textContent = text;
  elComposerHint.hidden = false;
  hintTimer = setTimeout(() => {
    elComposerHint.hidden = true;
    elComposerHint.textContent = "";
    hintTimer = null;
  }, 2600);
}

function setMemoryStatus(text) {
  if (!elMemoryStatus) return;
  elMemoryStatus.textContent = text ? String(text) : "";
}

function openMemoryPanel() {
  if (!elMemoryPanel) return;
  elMemoryPanel.hidden = false;
  setMemoryStatus("正在读取…");
}

function closeMemoryPanel() {
  if (!elMemoryPanel) return;
  elMemoryPanel.hidden = true;
}

async function refreshMemoryFromFile() {
  setMemoryStatus("正在读取 /Users/lairuisi/Documents/Claudiofm/music.md …");
  try {
    const resp = await chrome.runtime.sendMessage({ type: "readMemoryFile" });
    if (!resp?.ok) {
      setMemoryStatus(`读取失败：${resp?.error || "unknown"}`);
      if (elMemoryContent) elMemoryContent.textContent = "(空)";
      return;
    }
    const content = resp?.content ? String(resp.content) : "";
    if (elMemoryContent) elMemoryContent.textContent = content && content.trim() ? content.trim() : "(空)";
    setMemoryStatus(`已加载：${resp.path || "/Users/lairuisi/Documents/Claudiofm/music.md"}`);
  } catch (e) {
    const message = e?.message ? String(e.message) : String(e);
    setMemoryStatus(`读取失败：${message}`);
    if (elMemoryContent) elMemoryContent.textContent = "(空)";
  }
}

function updateSendState() {
  const text = (elInput?.value ?? "").trim();
  if (recognizing) {
    elSend.disabled = false;
    elSend.classList.add("enabled");
    setButtonIcon(elSend, "stop");
    elSend.setAttribute("aria-label", "结束语音");
    return;
  }
  const enabled = text.length > 0;
  elSend.disabled = !enabled;
  elSend.classList.toggle("enabled", enabled);
  setButtonIcon(elSend, "send");
  elSend.setAttribute("aria-label", "发送");
}

function enterDjEdit() {
  elDjDisplay.hidden = true;
  elDjDisplay.style.display = "none";
  elDjEdit.hidden = false;
  elDjEdit.style.display = "";
  elDjNameInput.value = djName;
  elDjNameInput.focus();
  elDjNameInput.select();
}

function exitDjEdit() {
  elDjEdit.hidden = true;
  elDjEdit.style.display = "none";
  elDjDisplay.hidden = false;
  elDjDisplay.style.display = "";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = String(dataUrl);
  });
}

function canvasToDataUrl(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(canvas.toDataURL("image/png"));
          return;
        }
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      },
      "image/webp",
      0.9
    );
  });
}

async function cropAvatar(file) {
  const dataUrl = await fileToDataUrl(file);
  const img = await dataUrlToImage(dataUrl);
  const size = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - size) / 2);
  const sy = Math.floor((img.height - size) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(48, 48, 48, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, sx, sy, size, size, 0, 0, 96, 96);
  ctx.restore();
  return await canvasToDataUrl(canvas);
}

async function resolveTrack(track) {
  const cachedStreamUrl = (track?.streamUrl || "").replace(/`/g, "").trim();
  if (cachedStreamUrl) {
    return {
      provider: track?.provider || "cached",
      track: {
        name: track?.name || "",
        artist: track?.artist || "",
      },
      streamUrl: cachedStreamUrl,
      cover: track?.cover || "",
      durationMs: track?.durationMs || 0,
    };
  }

  if (typeof window.resolveTrackFromPaojiao === "function") {
    const res = await window.resolveTrackFromPaojiao(track);
    if (res?.streamUrl) return res;
  }
  const res = await chrome.runtime.sendMessage({ type: "resolveTrack", track });
  if (!res || !res.streamUrl) {
    throw new Error("resolve failed");
  }
  return res;
}

async function playAt(i) {
  const token = ++playRequestToken;
  const track = queue[i];
  if (!track) return;
  queueIndex = i;
  userPaused = false;
  seeking = false;
  setPlayingUI(false);
  elTrackTitle.textContent = buildTitle(track);
  updateTimeUI(0, 0);
  updateProgressUI(0, 0);
  renderQueue();

  try {
    activeAudio.pause();
  } catch {}

  if (await activatePreloadedTrack(i)) {
    return;
  }

  let resolved;
  try {
    resolved = await resolveTrack(track);
  } catch (e) {
    console.error("[playAt] resolveTrack failed", e, { track, index: i });
    if (token === playRequestToken) {
      setHint("歌曲解析失败，可能是音源不可用或网络问题");
    }
    return;
  }

  if (token !== playRequestToken) return;

  const streamUrl = (resolved?.streamUrl || "").replace(/`/g, "").trim();
  if (!streamUrl) {
    console.error("[playAt] no streamUrl! resolved:", resolved);
    if (token === playRequestToken) {
      setHint("歌曲解析失败：未找到播放链接");
    }
    return;
  }

  const mergedTrack = mergeResolvedTrack(track, resolved);
  queue[i] = mergedTrack;
  elTrackTitle.textContent = buildTitle(mergedTrack);
  renderQueue();

  clearPreload("manual-play");
  if (token !== playRequestToken) return;

  activeAudio.src = streamUrl;
  activeAudio.currentTime = 0;
  activeAudio.load();
  try {
    await activeAudio.play();
  } catch (e) {
    console.error("[playAt] audio.play failed", e, { streamUrl, track: mergedTrack });
    setPlayingUI(false);
    if (token === playRequestToken) {
      setHint("播放失败：浏览器拦截或音源不可播放");
    }
    return;
  }
  if (token !== playRequestToken) return;
  setPlayingUI(true);
  port.postMessage({ type: "playbackState", playing: true });
  schedulePreloadForNextTrack();
}

async function playNext() {
  if (!queue.length) return;
  const next = Math.min(queueIndex + 1, queue.length - 1);
  if (next === queueIndex) return;
  await playAt(next);
}

async function playPrev() {
  if (!queue.length) return;
  const prev = Math.max(queueIndex - 1, 0);
  if (prev === queueIndex) return;
  await playAt(prev);
}

function speak(text) {
  if (!text) return;
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function shouldSpeakSegue() {
  if (segueSpokenInQueue >= 3) return false;
  if (queueIndex <= 0) return true;
  if (segueSpokenInQueue === 0) return true;
  return Math.random() < 0.35;
}

async function handleAssistantResult(result) {
  if (typeof result === "string") {
    const text = result.trim();
    if (text) appendMessage("assistant", text);
    else appendMessage("assistant", "未收到有效回复");
    return;
  }

  if (!result || typeof result !== "object") {
    appendMessage("assistant", "未收到有效回复");
    return;
  }

  const parts = [];
  if (result.say) parts.push(result.say);
  if (result.reason) parts.push(result.reason);
  if (parts.length) appendMessage("assistant", parts.join("\n\n"));

  if (result.segue && shouldSpeakSegue()) {
    segueSpokenInQueue += 1;
    speak(result.segue);
  }

  if (Array.isArray(result.play) && result.play.length) {
    const playListMessage = buildPlayListMessage(result.play);
    if (playListMessage) appendMessage("assistant", playListMessage);
    setHint(`已推荐 ${result.play.length} 首歌曲，可点歌单查看/播放`);
    if (queue.length === 0 || queueIndex >= queue.length - 1) {
      segueSpokenInQueue = 0;
    }
    queue = queue.concat(
      result.play.map((t) => ({
        ...t,
        streamUrl: (t?.streamUrl || "").replace(/`/g, "").trim(),
        provider: t?.provider || "pending",
      }))
    );
    renderQueue();
    if (queueIndex === -1) {
      await playAt(0);
    } else {
      schedulePreloadForNextTrack();
    }
  }
}

port.onMessage.addListener(async (msg) => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "requestLocation") {
    if (!("geolocation" in navigator) || typeof navigator.geolocation?.getCurrentPosition !== "function") {
      port.postMessage({ type: "locationResult", ok: false, error: "geolocation unsupported" });
      return;
    }
    try {
      const result = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              ok: true,
              coords: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              },
            }),
          (err) => {
            const message = err?.message ? String(err.message) : "geolocation failed";
            resolve({ ok: false, error: message });
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
        );
      });
      if (!result.ok) setHint("定位失败，已使用时间与历史记忆推荐");
      port.postMessage({ type: "locationResult", ...result });
    } catch (e) {
      const message = e?.message ? String(e.message) : String(e);
      setHint("定位失败，已使用时间与历史记忆推荐");
      port.postMessage({ type: "locationResult", ok: false, error: message });
    }
    return;
  }
  if (msg.type === "chatResult") {
    await handleAssistantResult(msg.result);
    return;
  }
  if (msg.type === "interruptStart") {
    if (!activeAudio.paused) {
      interrupted = true;
      elInterruptHint.hidden = false;
      await activeAudio.pause();
      setPlayingUI(false);
      port.postMessage({ type: "playbackState", playing: false });
    }
    return;
  }
  if (msg.type === "interruptEnd") {
    elInterruptHint.hidden = true;
    if (interrupted && !userPaused) {
      interrupted = false;
      try {
        await activeAudio.play();
        setPlayingUI(true);
        port.postMessage({ type: "playbackState", playing: true });
      } catch {}
    }
    return;
  }
});

elSend.addEventListener("click", async () => {
  if (recognizing) {
    try {
      recognition?.stop?.();
    } catch {}
    return;
  }
  const text = elInput.value.trim();
  if (!text) return;
  elInput.value = "";
  updateSendState();
  appendMessage("user", text);
  try {
    await chrome.runtime.sendMessage({ type: "chat", text });
  } catch (e) {
    const message = e?.message ? String(e.message) : String(e);
    appendMessage("assistant", `发送失败：${message}`);
  }
});

elInput.addEventListener("keydown", async (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    elSend.click();
  }
});

elInput.addEventListener("input", () => {
  updateSendState();
});

elAvatarBtn.addEventListener("click", () => {
  elAvatarFile.value = "";
  elAvatarFile.click();
});

elAvatarFile.addEventListener("change", async () => {
  const file = elAvatarFile.files && elAvatarFile.files[0];
  if (!file) return;
  try {
    const avatarDataUrl = await cropAvatar(file);
    await patchPreferences({ avatarDataUrl });
    setAvatarUI(avatarDataUrl);
    setHint("头像已更新");
  } catch {
    setHint("头像处理失败");
  }
});

elDjEditIcon.addEventListener("click", () => enterDjEdit());

elDjNameCancel.addEventListener("click", () => {
  elDjNameInput.value = djName;
  exitDjEdit();
});

elDjNameSave.addEventListener("click", async () => {
  const raw = (elDjNameInput.value || "").trim();
  const next = Array.from(raw).slice(0, 8).join("");
  if (!next) {
    setHint("DJ 名称不能为空");
    return;
  }
  await patchPreferences({ djName: next });
  setDjNameUI(next);
  exitDjEdit();
  setHint("已保存");
});

elDjNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    exitDjEdit();
  }
});

elDjNameInput.addEventListener("input", () => {
  const raw = elDjNameInput.value || "";
  const next = Array.from(raw).slice(0, 8).join("");
  if (next !== raw) elDjNameInput.value = next;
});



elBtnQueue.addEventListener("click", () => {
  elQueue.hidden = !elQueue.hidden;
});

elBtnPlay.addEventListener("click", async () => {
  if (!activeAudio.src) {
    if (queue.length) await playAt(Math.max(queueIndex, 0));
    return;
  }
  if (activeAudio.paused) {
    userPaused = false;
    try {
      await activeAudio.play();
      setPlayingUI(true);
      port.postMessage({ type: "playbackState", playing: true });
    } catch {}
  } else {
    userPaused = true;
    await activeAudio.pause();
    setPlayingUI(false);
    port.postMessage({ type: "playbackState", playing: false });
  }
});

elBtnNext.addEventListener("click", playNext);
elBtnPrev.addEventListener("click", playPrev);

function bindAudioEvents(audio, label) {
  audio.addEventListener("play", () => {
    if (audio !== activeAudio) return;
    setPlayingUI(true);
    port.postMessage({ type: "playbackState", playing: true });
  });

  audio.addEventListener("pause", () => {
    if (audio !== activeAudio) return;
    setPlayingUI(false);
    port.postMessage({ type: "playbackState", playing: false });
  });

  audio.addEventListener("loadedmetadata", () => {
    console.log(`[audio:${label}] loadedmetadata`, getAudioDebugInfo(audio));
    if (audio !== activeAudio) return;
    updateTimeUI(audio.currentTime, audio.duration);
    if (!seeking) updateProgressUI(audio.currentTime, audio.duration);
  });

  audio.addEventListener("loadstart", () => {
    console.log(`[audio:${label}] loadstart`, getAudioDebugInfo(audio));
  });

  audio.addEventListener("canplay", () => {
    console.log(`[audio:${label}] canplay`, getAudioDebugInfo(audio));
    if (audio === preloadAudio && preloadStatus === "loading") {
      preloadStatus = "ready";
      console.log("[preload] ready", { index: preloadIndex, audio: getAudioDebugInfo(audio) });
    }
  });

  audio.addEventListener("canplaythrough", () => {
    console.log(`[audio:${label}] canplaythrough`, getAudioDebugInfo(audio));
  });

  audio.addEventListener("durationchange", () => {
    if (audio !== activeAudio) return;
    updateTimeUI(audio.currentTime, audio.duration);
    if (!seeking) updateProgressUI(audio.currentTime, audio.duration);
  });

  audio.addEventListener("timeupdate", () => {
    if (audio !== activeAudio) return;
    updateTimeUI(audio.currentTime, audio.duration);
    if (!seeking) updateProgressUI(audio.currentTime, audio.duration);
  });

  audio.addEventListener("ended", async () => {
    if (audio !== activeAudio) return;
    await playNext();
  });

  audio.addEventListener("stalled", () => {
    console.warn(`[audio:${label}] stalled`, getAudioDebugInfo(audio));
  });

  audio.addEventListener("suspend", () => {
    console.warn(`[audio:${label}] suspend`, getAudioDebugInfo(audio));
  });

  audio.addEventListener("abort", () => {
    console.warn(`[audio:${label}] abort`, getAudioDebugInfo(audio));
  });

  audio.addEventListener("error", () => {
    if (audio === preloadAudio) {
      console.warn("[preload] audio error", {
        index: preloadIndex,
        code: audio.error?.code ?? null,
        message: audio.error?.message ?? "",
        audio: getAudioDebugInfo(audio),
      });
      preloadIndex = -1;
      preloadStatus = "error";
      return;
    }

    const mediaError = audio.error;
    console.error("[audio] playback error", {
      code: mediaError?.code ?? null,
      message: mediaError?.message ?? "",
      ...getAudioDebugInfo(audio),
      queueIndex,
      track: queue[queueIndex] || null,
    });
    setPlayingUI(false);
  });
}

bindAudioEvents(audioA, "A");
bindAudioEvents(audioB, "B");

elProgress.addEventListener("input", () => {
  const duration = activeAudio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  seeking = true;
  const ratio = Number(elProgress.value) / 1000;
  const nextTime = ratio * duration;
  updateTimeUI(nextTime, duration);
});

elProgress.addEventListener("change", () => {
  const duration = activeAudio.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const ratio = Number(elProgress.value) / 1000;
  activeAudio.currentTime = ratio * duration;
  seeking = false;
});

elBtnMic.addEventListener("click", async () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setHint("当前浏览器不支持语音输入");
    return;
  }

  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.addEventListener("result", (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) {
          finalText += (r[0]?.transcript ?? "").trim() + " ";
        }
      }
      finalText = finalText.trim();
      if (!finalText) return;
      const prev = (elInput.value ?? "").replace(/\s+$/g, "");
      elInput.value = `${prev}${prev ? " " : ""}${finalText}`;
      updateSendState();
      elInput.focus();
    });

    recognition.addEventListener("error", (event) => {
      const err = event?.error ? String(event.error) : "unknown";
      if (err === "not-allowed" || err === "service-not-allowed") {
        setHint("语音权限被拒绝");
      } else if (err === "no-speech") {
        setHint("未检测到语音");
      } else {
        setHint(`语音识别失败：${err}`);
      }
      updateSendState();
    });

    recognition.addEventListener("end", () => {
      recognizing = false;
      elBtnMic.classList.remove("recording");
      elBtnMic.setAttribute("aria-pressed", "false");
      updateSendState();
    });
  }

  if (recognizing) {
    recognition.stop();
    return;
  }

  try {
    const ok = await ensureMicPermission();
    if (!ok) return;
    recognizing = true;
    elBtnMic.classList.add("recording");
    elBtnMic.setAttribute("aria-pressed", "true");
    setHint("正在聆听…");
    updateSendState();
    recognition.start();
  } catch {
    recognizing = false;
    elBtnMic.classList.remove("recording");
    elBtnMic.setAttribute("aria-pressed", "false");
    updateSendState();
    setHint("语音输入启动失败");
  }
});

if (elBtnMemory && elMemoryPanel) {
  elBtnMemory.addEventListener("click", async () => {
    const nextOpen = elMemoryPanel.hidden;
    if (nextOpen) {
      openMemoryPanel();
      await refreshMemoryFromFile();
    } else {
      closeMemoryPanel();
    }
  });
}

if (elMemoryClose) {
  elMemoryClose.addEventListener("click", () => closeMemoryPanel());
}

if (elMemoryPanel) {
  elMemoryPanel.addEventListener("click", (e) => {
    if (e.target === elMemoryPanel) closeMemoryPanel();
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (elMemoryPanel && !elMemoryPanel.hidden) {
    e.preventDefault();
    closeMemoryPanel();
  }
});

updateSendState();
port.postMessage({ type: "ready" });

(async () => {
  const prefs = await getPreferences();
  setDjNameUI(prefs.djName || "Claudio");
  setAvatarUI(prefs.avatarDataUrl || "");
})();
