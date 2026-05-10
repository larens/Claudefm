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

function extractSongIds(searchHtml) {
  const ids = [];
  const seen = new Set();
  const matches = searchHtml.matchAll(/song\.php\?id=(\d+)/g);
  for (const match of matches) {
    const id = match?.[1] ? String(match[1]).trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= 5) break;
  }
  return ids;
}

function parseSongPage(songHtml, fallbackTrack) {
  const urlMatch = songHtml.match(/url\s*:\s*[`'"]([^`'"]+)[`'"]/i);
  const nameMatch = songHtml.match(/(?:name|title)\s*:\s*[`'"]([^`'"]+)[`'"]/i);
  const artistMatch = songHtml.match(/artist\s*:\s*[`'"]([^`'"]+)[`'"]/i);
  const coverMatch = songHtml.match(/cover\s*:\s*[`'"]([^`'"]+)[`'"]/i);

  const streamUrl = cleanProviderValue(urlMatch?.[1] || "");
  const name = cleanProviderValue(nameMatch?.[1] || fallbackTrack?.name || "");
  const artist = cleanProviderValue(artistMatch?.[1] || fallbackTrack?.artist || "");
  const cover = cleanProviderValue(coverMatch?.[1] || "");

  if (!streamUrl) return null;

  return {
    provider: "paojiao",
    track: { name, artist },
    streamUrl,
    cover,
    durationMs: 0,
  };
}

async function resolveTrack(track) {
  const name = String(track?.name || track?.query || "").trim();
  const artist = String(track?.artist || "").trim();
  console.log("[paojiao adapter] resolveTrack", { name, artist, track });
  if (!name) return null;

  try {
    const searchQuery = encodeURIComponent([name, artist].filter(Boolean).join(" "));
    console.log("[paojiao adapter] search URL", `https://music.pjmp3.com/search.php?keyword=${searchQuery}&n=1`);
    const searchResp = await fetch(`https://music.pjmp3.com/search.php?keyword=${searchQuery}&n=1`);
    if (!searchResp.ok) { console.log("[paojiao adapter] search failed", searchResp.status); return null; }
    const searchHtml = await searchResp.text();

    const songIds = extractSongIds(searchHtml);
    if (!songIds.length) { console.log("[paojiao adapter] no song ID found"); return null; }

    let bestResult = null;
    let bestScore = -1;

    for (const songId of songIds) {
      console.log("[paojiao adapter] songId:", songId);
      const songResp = await fetch(`https://music.pjmp3.com/song.php?id=${songId}`);
      if (!songResp.ok) { console.log("[paojiao adapter] song fetch failed", songId); continue; }
      const songHtml = await songResp.text();
      const parsed = parseSongPage(songHtml, { name, artist });
      if (!parsed?.streamUrl) continue;

      const score = scoreResolvedTrack({ name, artist }, parsed.track);
      console.log("[paojiao adapter] matches", {
        songId,
        score,
        url: parsed.streamUrl,
        name: parsed.track.name,
        artist: parsed.track.artist,
        cover: parsed.cover,
      });

      if (score > bestScore) {
        bestScore = score;
        bestResult = parsed;
      }

      if (score >= 18) break;
    }

    return bestResult ? {
      provider: bestResult.provider,
      track: bestResult.track,
      streamUrl: bestResult.streamUrl,
      cover: bestResult.cover,
      durationMs: bestResult.durationMs,
    } : null;
  } catch (e) {
    console.error("[paojiao adapter] error", e);
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "paojiao.resolveTrack") return undefined;

  resolveTrack(msg.track)
    .then((result) => sendResponse(result ?? null))
    .catch((error) => {
      console.error("[paojiao adapter] message resolve failed", error);
      sendResponse(null);
    });

  return true;
});

window.resolveTrackFromPaojiao = resolveTrack;
