# Player view and queue

The first song selected in a fresh page session opens the normal player. Back to Library (or Escape) minimizes it; subsequent selections keep the mini player. Clicking the mini player's artwork or metadata expands it again. Presentation does not depend on whether audio is playing or paused.

Queue is available from the normal player's toolbar and the mini player's transport bar. The drawer shows Now playing and the remaining Up next entries in playback order. It supports immediate playback, move up/down, removing upcoming entries, clearing the queue while retaining the current song, and searching the library to Play next or Add to queue. Duplicate songs are independent queue occurrences.

The library and playback queue are separate arrays. Selecting a library song or a song inside a vinyl box starts a new queue in that context. Repainting the library does not rebuild the queue. Shuffle permutes the selected queue; repeat changes do not replace or reshuffle it. Queue edits preserve the current song, its playback time and pause state. Deleting a library song removes its occurrences from the queue by song ID rather than library index.

The drawer uses a native dialog for focus containment, closes on Escape or an outside click, and does not add an animation or rendering loop. Queue changes render the list; playback state changes update only its status badge. All dialog subscriptions are released on disposal.

Run `npm test` and `npm run build`. Queue and navigation regressions are covered by `tools/verify-player-queue.mjs`.
