# BVTGVNG normal-player intro

Research date: 2026-10-07. This is a curated recognition list for Wavr, not a claim that an exhaustive official membership roster exists.

## Identity and artwork

The original `assets/images/bvtgvng-logo.jpg` is the unmodified 150×150 public profile picture from [BVTGVNG's Instagram](https://www.instagram.com/bvtgvng/). Public sources checked did not expose a larger downloadable master. The intro uses `assets/images/bvtgvng-original-traced.svg`: its inner silhouette is traced deterministically from the original pixels, not hand-drawn or AI-redesigned. The rejected hand-drawn SVG has been removed.

Trace provenance: threshold original RGB at mean 128, select its largest connected component (3,801 pixels), follow its pixel-boundary contour and simplify at 0.55 source-pixel tolerance. Nonacute contour corners receive quadratic rounding capped at 0.48 source pixels; sharp tips stay pointed. Browser rasterization at 150×150 still matches all 3,801 original foreground pixels with zero changed pixels (intersection-over-union 1.0). The circle is fitted to the source's outer ring; its clipped bottom is restored, and 10 px transparent margins prevent display clipping. This is a faithful trace of the available image, not a claim to possess the official vector master or unseen higher-resolution detail. No generative restoration is shipped.

## Artist recognition

| Artist | Evidence | Recognized aliases |
| --- | --- | --- |
| XOLITXO | [Artist bio](https://www.instagram.com/xolitxo/) directly links `@bvtgvng`. | XOLITXO, Xolit XO |
| Bloodring | [Artist bio](https://www.instagram.com/bloodring.1111/) directly links `@bvtgvng`; [SoundCloud](https://soundcloud.com/bloodring1111) identifies the artist as Đại Vương and credits DJ Đại Vương. | Bloodring, bloodring.1111, Đại Vương, DJ Đại Vương |
| wAvy | The group's “Cool Kids Club / freestyle1” post credits `@youngwavy182` alongside XOLITXO and Bloodring, preserved in [this indexed post mirror](https://www.picnob.com/de/profile/_rev.wav/tagged/). [Artist profile](https://www.instagram.com/youngwavy182/) identifies wAvy182; the artist also appears on the group's [Ghost Mode release](https://music.amazon.in/albums/B0DKJZ1NGF). Inclusion is based on these group associations, not a current self-declared membership bio. | wAvy, wAvy182, youngwavy182 |
| Rev | [Artist bio](https://www.instagram.com/_rev.wav/) directly links `@bvtgvng`; [official release credits](https://music.apple.com/us/album/lock-in/1798681734?i=1798682247) identify Rev. | Rev, _rev.wav |
| MINHPHAM | [Artist bio](https://www.instagram.com/minhphamprod/) directly links `@bvtgvng`. | MINHPHAM, Minh Pham, minhphamprod |
| Wwt Sauce | [Artist bio](https://www.instagram.com/saucebboix/) directly links `@bvtgvng`; [official release](https://music.amazon.com/albums/B0GYM1BV55) is credited to Wwt Sauce under Bvtgvng. | Wwt Sauce, saucebboix |

Bluebby, KYTE, sleepat6pm and VCC Left Hand appear on [CONDOI](https://open.spotify.com/album/3r8cvq89cfAd4PVBckNC8V), but guest credits alone do not establish membership. They are not automatically included as solo-artist triggers. A collaboration with a recognized artist still qualifies.

Woozy appears in production credits; those credits do not establish that Woozy and Wwt Sauce are the same person, so the names are not aliased.

Matching is case-insensitive, removes accents and understands separated artists and `feat.` credits. It matches whole credit names: “Rev Theory” or a song merely titled “Rev” does not qualify. Only explicit featured artists in the song title are inspected.

## Behavior

The intro starts when an eligible track is loaded while the normal player is visible, or on its first subsequent opening from the mini player. It does not open the player automatically or change audio playback, seeking, lyrics timing or the queue. Reopening the same loaded track does not replay the intro. Loading a new track replaces/cancels the previous intro; leaving the player, entering Cinematic/Angelic, hiding the page, playback errors and disposal cancel it.

Normal motion uses a 2,400 ms rupture of the live normal player. The sheets open in 300 ms, settle by 384 ms, hold open until 1,920 ms and close over the final 480 ms. The approved logo becomes fully opaque by 336 ms and stays fully opaque through 1,920 ms, giving it 1,584 ms of uninterrupted reading time. `RealityTearLogoIdle` adds finite perspective tilt, float and two stronger breathing pulses to the sharp inner SVG. `RealityTearLogoPresence` supplies a softly expanding light halo and two delayed optical afterimages of the same SVG. Echo blur is static (2.5 / 8 px); only cached-layer transforms and opacity animate. Every layer shares the reveal's clock and cancellation. The logo asset is unchanged.

The Atelier background and real 3D sleeve render into a bounded intermediate target in the existing Three.js context. A postprocess separates that source into two sheets along a continuous irregular curve, with a curled inner fold, source-colored shadows, a narrow ivory edge and fine fibers. This cuts and deforms the real rendered scene rather than placing a black polygon over it. The approved mark emerges from the resulting gap; it has no added wordmark, red wash or sound.

`RealityTearAnalogShader` confines signal diffusion to the render near the cut. It reconstructs 16 px desktop / 12 px portrait cells with broad soft borders, mixes in two directional source samples and restrained chroma lag, and adds a faint drifting pixel veil just inside the gap. The irregular band is about 100 / 72 px wide. Gentle color compression and scan modulation stay local to that band; the hard color-block chips and discrete random ticks have been removed. The source colors carry the effect, with no added red wash. Outside the band, an early return avoids the extra diffusion samples. Pixelation grows and fades with the opening envelope and adds no render target, context or fullscreen pass. The central SVG and DOM lyric text remain sharp. This is an authored analog-horror atmosphere, not a claim to reproduce physical tape or to detect music beats.

The original artwork/control pane, lyric pane and header/toolbar nodes are clipped along the same cut and displaced/rotated using native Web Animations. No UI nodes or enhanced-LRC spans are cloned or rebuilt. Desktop tears vertically between the panes; portrait screens tear horizontally between artwork and lyrics. The existing player entrance transition is completed before measuring, so screen and DOM cut coordinates agree.

`RealityTearSleeveAnchor` holds the sleeve's pre-tear artwork bounds while textures change. The source scene therefore does not measure the displaced DOM and apply the movement twice. Completion/cancellation releases that anchor and remeasures the restored layout.

`RealityTearLayout` measures once per entrance. `RealityTearGeometry` supplies the curve and sheet poses, and `RealityTearTiming` supplies a shared absolute-time opening envelope. DOM transforms and the GPU sample the same smoothstep easing and start clock. `RealityTearDomMotion` restores prior inline clipping/origins, including priorities, on every exit. `RealityTearStage` contains only the original SVG mark, whose motion lives in `RealityTearMotion`. There is no DOM opening overlay or decorative debris.

`RealityTearRenderEffect` composes the actual Atelier/sleeve output with `RealityTearShader`. Its reused depth target is capped at 1.2 million pixels, and its shader/target warm during idle time. There is one added fullscreen pass only during the intro, with no additional context or animation loop. The existing scheduler also drives it while music is paused, then returns to normal demand-driven rendering. Normal mode renders directly to the screen again after the intro. Audio, seeking, queue state and lyrics timing continue unchanged; playback controls remain interactive.

Escape or the English “Skip intro” button cancels every animation. Completion clears the timer and restores the player; a stalled-compositor deadline is 32 ms beyond the authored duration. Replaced tracks, mode exits, hidden pages, errors, viewport resize and disposal cancel it immediately. Reduced motion omits the tear. The original SVG is rendered directly as an image, with its transparent margins intact, and is preloaded before the first eligible player opening.

## Horrorcore direction and research

This is an interpretation for Wavr, not a claim that all BVTGVNG releases are horrorcore or that the genre has one official visual palette.

- [clipping.'s direct interview (2019)](https://www.yesplz.coffee/blog/interview-with-horrorcore-hip-hop-geniuses-clipping) connects horrorcore to film storytelling, early Three 6 Mafia and Brotha Lynch Hung; Jonathan Snipes discusses a John Carpenter-inspired film-score idea, while William Hutson discusses monsters and the uncanny. The Wavr sequence takes a familiar listening environment and briefly ruptures it.
- [DJ Paul's direct interview (2018)](https://www.thefader.com/2018/04/10/dj-paul-who-run-it-challenge-three-6-mafia-interview) describes an earlier “Who Run It” version with scary keys and music and stresses feeling in Three 6 Mafia's horror music. The timing here follows interruption, tension and release.
- [Sematary's direct interview (2025)](https://www.papermag.com/sematary-halloween-interview) describes drawing samples from David Lynch, Twin Peaks and Memphis rap. This informed the restrained graphite/ivory material treatment and the glimpse of something behind the familiar surface.

These references inform atmosphere and pacing rather than another artist's branding. The mark remains BVTGVNG's approved original trace. No horror sound sample is added over the selected song.
