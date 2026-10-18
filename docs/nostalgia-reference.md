# Nostalgia background phases

Video reference: https://www.youtube.com/watch?v=T4NgpfyRj00 (3:06), inspected on 2026-10-13.

Current direction: three typography phases only, as clarified by the user:

1. Artist credits drift across the background (8–30% of duration).
2. Song title drifts across the background (38–65%).
3. Artist credits occupy the upper half and the song title the lower half, simultaneously (66–97%).

Short gaps and smooth fade envelopes leave breathing room. In the split phase the artist container is 50% tall, putting a single credit at 25% viewport height; multiple credits divide that upper half. The song title is centered at 75% height. Its horizontal direction opposes the first artist row. Backward seeking restores the solo phases' full-height artist layout and centered title automatically.

Text motion uses the playback clock at 1.8% viewport width per second. Pause freezes it and seeking reconstructs it without accumulated state. Reduced motion centers text without travel. Foreground .mp4 introduction, lyric crossfades, Vietnamese/Japanese fonts and cover-derived background color remain unchanged.

Ghost lettering uses #263d58 on light backgrounds and #c9e2fc on dark backgrounds. Solo-phase opacity is .16 and split-phase opacity is .12, multiplied by the fade envelope. No decorative images, random image selection, image-processing module or full-screen dark wash remain.

Verification preference: use the existing signed-in localhost account and music library when available. Do not create accounts or upload test tracks. A local rendering fixture can verify layout without modifying library data.

Validation: all 165 tests (15 Nostalgia) and the production build passed. A browser fixture using production background/raster modules verified solo artist, solo title and simultaneous upper/lower layouts, including seeking back to solo framing. Proof: nostalgia-three-phases-split.png in the chat visualization directory. No account or library changes were made.
