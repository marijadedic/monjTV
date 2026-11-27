// A YouTube video is one watch link. A playlist link is stored as the playlist, not a generated id.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalPlaylistUrl,
  isYoutubeLink,
  parseYoutubePlaylist,
  parseYoutubeUrl,
  playlistStartIndex,
} from "./youtube.ts";

const video = "dQw4w9WgXcQ";
const list = "PLmonjtvtest";

describe("a YouTube link", () => {
  it("stores one video as its watch link", () => {
    const watch = `https://www.youtube.com/watch?v=${video}`;
    assert.equal(parseYoutubeUrl(`https://youtu.be/${video}`), watch);
    assert.equal(parseYoutubeUrl(`${watch}&list=${list}`), watch);
    assert.equal(
      parseYoutubeUrl(`https://www.youtube.com/playlist?list=${list}`),
      null,
    );
  });

  it("stores a playlist page as that playlist", () => {
    assert.equal(
      canonicalPlaylistUrl(
        `https://www.youtube.com/watch?v=${video}&list=${list}`,
      ),
      `https://www.youtube.com/playlist?list=${list}`,
    );
  });

  it("stores a video-ids link as itself", () => {
    const queued = `https://www.youtube.com/watch_videos?video_ids=${video},abcdefghijk`;
    assert.equal(canonicalPlaylistUrl(queued), queued);
    assert.equal(isYoutubeLink(queued), true);
  });

  it("rejects a link that is not YouTube", () => {
    assert.equal(isYoutubeLink("/films/Night.mkv"), false);
    assert.equal(
      isYoutubeLink("https://example.com/watch?v=dQw4w9WgXcQ"),
      false,
    );
  });

  it("keeps a playlist's start video ahead of a stale index", () => {
    const pasted = `https://www.youtube.com/watch?v=${video}&list=${list}&index=5`;
    const ref = parseYoutubePlaylist(pasted);
    assert.ok(ref);
    assert.equal(ref.startIndex, 4);
    assert.equal(
      canonicalPlaylistUrl(pasted),
      `https://www.youtube.com/playlist?list=${list}`,
    );
    const ids = ["aaaaaaaaaaa", video, "bbbbbbbbbbb"];
    assert.equal(playlistStartIndex(ids, ref), 1);
    const byIndex = [
      "aaaaaaaaaaa",
      "bbbbbbbbbbb",
      "ccccccccccc",
      "ddddddddddd",
      "eeeeeeeeeee",
    ];
    assert.equal(
      playlistStartIndex(byIndex, { ...ref, startVideoId: null }),
      4,
    );
  });
});
