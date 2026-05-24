function cleanProviderValue(value) {
  return String(value ?? "")
    .replace(/^[\s`'"]+|[\s`'"]+$/g, "")
    .trim();
}

function normalizeForCompare(value) {
  return cleanProviderValue(value).toLowerCase().replace(/\s+/g, "");
}

function scoreResolvedTrack(query, candidate) {
  const queryName = normalizeForCompare(query?.name || "");
  const queryArtist = normalizeForCompare(query?.artist || "");
  const candidateName = normalizeForCompare(candidate?.name || "");
  const candidateArtist = normalizeForCompare(candidate?.artist || "");

  let score = 0;
  if (!candidateName) return score;
  if (queryName && candidateName === queryName) score += 10;
  else if (queryName && candidateName.includes(queryName)) score += 6;
  else if (queryName && queryName.includes(candidateName)) score += 4;

  if (queryArtist && candidateArtist === queryArtist) score += 8;
  else if (queryArtist && candidateArtist.includes(queryArtist)) score += 5;
  else if (queryArtist && queryArtist.includes(candidateArtist)) score += 3;

  return score;
}

async function resolveTrack(track) {
  const name = String(track?.name || track?.query || "").trim();
  const artist = String(track?.artist || "").trim();
  console.log("[ncm adapter] resolveTrack", { name, artist });
  if (!name) return null;

  try {
    const { preferences } = await chrome.storage.local.get("preferences");
    const ncmBase = (preferences?.ncmApiBase || "http://localhost:3000").replace(/\/+$/, "");

    const query = [name, artist].filter(Boolean).join(" ");
    const searchUrl = `${ncmBase}/cloudsearch?keywords=${encodeURIComponent(query)}&limit=10&type=1`;
    console.log("[ncm adapter] search URL", searchUrl);

    const resp = await fetch(searchUrl);
    if (!resp.ok) { console.log("[ncm adapter] search failed", resp.status); return null; }
    const data = await resp.json();
    const songs = data?.result?.songs;
    if (!songs?.length) { console.log("[ncm adapter] no results"); return null; }

    let bestResult = null;
    let bestScore = -1;
    let bestSongId = null;

    for (const s of songs) {
      const candidateName = s.name || "";
      const candidateArtist = (s.ar || []).map((a) => a.name).join(", ");
      const candidate = { name: candidateName, artist: candidateArtist };
      const score = scoreResolvedTrack({ name, artist }, candidate);
      console.log("[ncm adapter] match", {
        ncmId: s.id,
        score,
        resolvedName: candidateName,
        resolvedArtist: candidateArtist,
      });

      if (score > bestScore) {
        bestScore = score;
        bestSongId = s.id;
        bestResult = {
          provider: "netease",
          track: candidate,
          durationMs: s.dt || 0,
          cover: s.al?.picUrl || "",
        };
      }

      if (score >= 18) break;
    }

    if (!bestSongId) return null;

    const urlResp = await fetch(`${ncmBase}/song/url?id=${bestSongId}`);
    if (!urlResp.ok) { console.log("[ncm adapter] song url failed", urlResp.status); return null; }
    const urlData = await urlResp.json();
    const songUrl = urlData?.data?.[0]?.url;
    if (!songUrl) { console.warn("[ncm adapter] song url empty (may need login)", { bestSongId }); return null; }

    bestResult.streamUrl = songUrl;
    return bestResult;
  } catch (e) {
    console.error("[ncm adapter] error", e);
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "paojiao.resolveTrack") return undefined;

  resolveTrack(msg.track)
    .then((result) => sendResponse(result ?? null))
    .catch((error) => {
      console.error("[ncm adapter] message resolve failed", error);
      sendResponse(null);
    });

  return true;
});

window.resolveTrackFromPaojiao = resolveTrack;
