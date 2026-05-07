# PROJECT_NAME — Product Requirements Document
*v0.1 · draft · for [friend's name] and [your name]*

---

## 1. Vision

A web-based **luminance synthesizer**. You drop in a video, image, or webcam feed. You play with knobs, ramps, and effects like you're playing a synth. You export a clip, a still, or a live VJ feed.

It's the tool we wished existed for making things that don't look like everyone else's. Not a filter app. Not an AI generator. An instrument.

> "If Ableton and an analog synth had a baby and it processed video instead of sound."

---

## 2. Positioning

| | |
|---|---|
| **Who it's for** | Visual artists, VJs, content creators, designers who scroll TouchDesigner reels and wish they could do that without learning a node editor. |
| **What it replaces** | Photoshop filters (too static), AI video tools (too generic, too slow), TouchDesigner (too hard for most). |
| **What it's not** | Not an AI tool. Not a filter pack. Not a clone of any existing app. |
| **The pitch** | "Real-time visual synthesis in your browser. No AI. No setup." |
| **Tagline candidates** | *"Play your video like an instrument."* / *"Light, shaped."* / *"Synthesize the visual."* |

---

## 3. The Synth Model — How It Works

The product mirrors the signal flow of an analog synth. Three sections, in order:

```
INPUT → [ OSC ] → [ FILTER ] → [ FX ] → OUTPUT
       Structure    Color       Mutate
                                + Decay
```

### 3.1 OSC (Source + Structure)
**Job:** Take incoming pixels, output a 0–1 luminance signal.

The "oscillator" of the synth — it produces the raw waveform. Structure effects reshape that waveform: erode it, quantize it, dither it, ASCII it.

**Input adapters (3 of them, switchable):**
- **Video file** — drag/drop mp4, mov, webm
- **Webcam** — getUserMedia, no recording in v1
- **Still image** — drag/drop png, jpg

**Structure effects (12 in v1):**
1. Off (passthrough luminance)
2. Erosion
3. Dilation
4. ASCII Luma
5. Halftone
6. 8-bit (posterize)
7. Edge detect
8. Threshold (hard cutoff)
9. Skeleton
10. Watershed
11. Voronoi cells
12. Pixelate

Each effect has **2-4 knobs**. No more. We are deliberately cutting from the 21 in TD.

**The signal between OSC and FILTER is single-channel luminance** (0.0 to 1.0). This is the most important architectural commitment in the whole spec — it means Color is a pure function of luminance and the engineer can reason about each stage independently.

### 3.2 FILTER (Color)
**Job:** Take the 0–1 luminance signal, paint it as RGB.

**This stage is a ramp editor.** Not a preset list. Not a dropdown of 49 palettes. A literal interactive gradient that the user shapes.

**The interface:**

A horizontal gradient strip. The X-axis is luminance (0 on the left, 1 on the right). The Y-axis is implicit — it's the RGB color at that luminance. Users:
- Click anywhere on the strip to add a color stop
- Drag stops left/right to reposition
- Click a stop to open a color picker
- Right-click a stop to delete
- Double-click empty space to add a stop with auto-interpolated color

Above the strip: a **preset dropdown** with curated ramps. Picking a preset loads stops into the editor — it does NOT lock them. Users always have full control after loading.

**Preset ramps in v1 (12 of them, ported from TD's best):**
- Nebula
- Aurora
- Event Horizon
- Solar
- Bioluminescence
- Cyanotype
- Tokamak
- Mineral
- Deep Field
- Thermal
- Mono
- Inverted

**Why this matters more than anything:** The ramp editor is what makes this product feel like an instrument and not a filter app. If only one thing in this PRD ships polished, it's this.

### 3.3 FX (Mutate + Decay)
**Job:** Post-process the colored RGB signal.

**Stack-style interface.** Like Ableton's effect rack. User adds 0-3 effects from a library. Each is a card. Drag to reorder. Toggle on/off per card. Each card has 2-3 knobs.

**FX library (10 in v1):**
1. RGB Split
2. Feedback Warp
3. Echo / Trail
4. Mirror
5. Datamosh
6. Scanline
7. CRT
8. Vignette
9. Grain
10. Bloom

Mutate effects (warps, splits, drift) and Decay effects (surface texture, vignette, scanlines) live in the same library. Users don't need to know the distinction.

---

## 4. UI — The Mixing Console

Desktop-only in v1. Single-window app, no scrolling. 1440×900 minimum, scales up. A desktop browser tab.

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────┐
│  PROJECT_NAME                                    [export]  │ ← top bar (40px)
├──────────────┬──────────────────────────────┬──────────────┤
│              │                              │              │
│   OSC        │                              │   FX RACK    │
│              │      PREVIEW WINDOW          │              │
│  [source ▾]  │      (16:9 or 9:16)          │  [+ add fx]  │
│              │                              │              │
│  [effect ▾]  │                              │  ┌────────┐ │
│              │                              │  │ rgbsplit│ │
│  ◉ ◉ ◉ ◉    │                              │  │ ◉ ◉    │ │
│   knobs      │                              │  └────────┘ │
│              │                              │             │
│              │   ┌─────────────────────┐    │             │
│              │   │   FILTER (ramp)     │    │             │
│              │   │  ▮▮▮▮▮▮▮▮▮▮▮▮▮▮  │    │             │
│              │   │  ●     ●      ●    │    │             │
│              │   └─────────────────────┘    │             │
│              │                              │             │
└──────────────┴──────────────────────────────┴─────────────┘
   left rail (280px)    center (flex)              right rail (280px)
```

**Left rail (OSC):**
- Source picker dropdown at top
- Structure effect picker with **animated waveform thumbnails** (see 4.4 below)
- 4 knob slots beneath, labeled with the effect's parameter names

**Center (Preview + Filter):**
- Big preview window, top 65% of center column
- Ramp editor, bottom 35% of center column, full width
- Preset dropdown above the ramp

**Right rail (FX Rack):**
- "+ Add FX" button at top
- Stack of effect cards beneath
- Each card collapsible to just its name (when 3 stacked + low screen height)

### 4.2 Visual style — pin this down

- **Background:** Deep purple-black (`#0a0418`), radial gradients in violets and pinks (steal from the Patreon guide PDF — same palette).
- **Panels:** Translucent purple over the gradient (`bg-purple-500/8`, `border-purple-300/25`). Glassmorphism.
- **Text:** Inter, white headers, lavender body (`#d8d0f0`).
- **Accent gradients:** Pink-to-purple-to-indigo on focus states, hover states, active knobs.
- **No emoji. No icons unless functional.**

shadcn/ui's dark mode + a custom theme.json with the purple values. Don't fight the framework.

### 4.3 Knobs

**These are the soul of the product. Get them right.**

- Circular SVG, 56px diameter
- Drag up to increase, drag down to decrease (vertical drag, NOT rotational — vertical is the standard for music software)
- Shift+drag = fine control (10x slower)
- Double-click = reset to default
- Hover shows the current value as a tooltip
- A faint arc behind the knob shows current position (0 = bottom, max = top)
- Subtle glow on the active knob (pink-purple gradient)
- Label below the knob in 10pt lavender uppercase

Build these as one shared `<Knob>` component. Reuse across OSC and FX. Do not let your friend hand-roll knobs per stage.

### 4.4 Waveform thumbnails (the visual cue you asked for)

Every Structure effect in the OSC picker dropdown has a **live 32×32 thumbnail** showing what that effect does to a test pattern. The thumbnails are generated by running the actual shader on a hardcoded gradient ramp + checkerboard test image.

This means:
- Erosion shows a square wave being eaten
- ASCII Luma shows the test pattern quantizing into character chunks
- Halftone shows it dotting
- Edge detect shows the outline

Users see the thumbnails update live with their current knob values. **This is the killer UX detail.** It's how the product feels alive instead of menu-driven. It's also content gold for the build-in-public reels.

Same trick for FX cards — each one has a tiny live preview of itself running on a test pattern, so users know what each effect does before they add it.

### 4.5 Preview window

- Aspect ratio matches the source
- Big "play/pause" button only visible on hover
- Scrub bar at the bottom (when source is video)
- Toggle in the corner: 16:9 vs 9:16 vs 1:1 framing crop (for Reels/TikTok export presets)
- A tiny FPS counter in the bottom corner — visible only in a hidden "dev mode" toggle

### 4.6 Top bar

- Logo / project name on the left (text only for now, no logo)
- Project file controls in the middle: New, Save (download .json), Load (upload .json)
- Export button on the right

### 4.7 Export modal

When you click Export:

```
┌───────────────────────────────────────┐
│  Export                          [×]  │
├───────────────────────────────────────┤
│                                       │
│  Format:    ◉ Video (mp4)            │
│             ○ Image (png)            │
│             ○ GIF                    │
│                                       │
│  Resolution: [1080×1920 ▾]           │
│              · 1080×1920 (Reels)     │
│              · 1920×1080 (Landscape) │
│              · 1080×1080 (Square)    │
│              · Match source          │
│                                       │
│  Duration:  [as source]               │
│             [progress bar]            │
│                                       │
│              [ Cancel ]   [ Export ]  │
└───────────────────────────────────────┘
```

---

## 5. System Architecture

### 5.1 Where rendering happens

**v1: 100% in-browser.** WebGL2 (or WebGPU if your friend wants to bet on it). All shaders run client-side. Export uses MediaRecorder API for mp4, canvas-to-blob for png.

Reasoning: no server costs at launch, instant feedback, no upload wait. The price is that long videos and 4K are gated by the user's GPU. That's fine for v1 because the killer use case is short Reels.

**v1.5+: Hybrid.** Add a server render path for users who want to export 4K or 60s+ at high quality. This is a Patreon-tier feature. Users pay for cloud render minutes.

### 5.2 Data model

A "project" is a JSON object:

```json
{
  "version": 1,
  "source": {
    "type": "video" | "image" | "webcam",
    "ref": "blob-uuid-or-url"
  },
  "osc": {
    "structure": "ascii_luma",
    "params": [0.5, 0.3, 0.0, 0.0]
  },
  "filter": {
    "stops": [
      { "luma": 0.0, "color": "#000000" },
      { "luma": 0.4, "color": "#3a0ca3" },
      { "luma": 1.0, "color": "#f72585" }
    ]
  },
  "fx": [
    { "type": "rgb_split", "params": [0.3, 0.0, 0.0], "enabled": true },
    { "type": "vignette", "params": [0.6, 0.4, 0.0], "enabled": true }
  ]
}
```

Save = download this as `.json`. Load = upload it back. No accounts in v1, no cloud sync. This is enough.

### 5.3 Shader pipeline

The render loop, per frame:

```
1. Sample source frame → texture A
2. Pass A through Structure shader → texture B (single-channel luma)
3. Pass B through Filter shader (ramp lookup) → texture C (RGB)
4. For each enabled FX card: pass C through that shader → C
5. Draw C to canvas
```

The ramp gets uploaded to the GPU as a 256-pixel 1D texture every time stops change. Fast lookup in the filter shader.

### 5.4 Stack recommendation

**Locked-in:**
- **Next.js 14 (App Router)** — Vercel hosts free, your friend already knows Node
- **TypeScript** — non-negotiable for a 6-week sprint, catches bugs your friend doesn't have time to find
- **Tailwind CSS** — fast styling, friend can paste from docs
- **shadcn/ui** — Radix primitives wrapped, beautiful by default, copy-paste components. This is what carries the UI for a non-UI engineer.
- **Framer Motion** — only for knob feel, ramp drag, modal transitions. No globally-applied animations.

**Pick one, don't argue:**
- **ogl** for WebGL — small, modern, fewer footguns than three.js. ([https://github.com/oframe/ogl](https://github.com/oframe/ogl)) If your friend prefers three.js because they've used it, that's fine too. Don't introduce both.

**Storage:**
- v1: localStorage for "last open project" auto-save
- v1.5: Vercel Blob or Cloudflare R2 for cloud projects (when accounts exist)

**Auth:**
- v1: none
- v1.5: Clerk (cheapest, fastest) or Supabase auth

**Payments:**
- Stripe Checkout for one-time
- Stripe Subscriptions for monthly
- Pricing logic: see section 8

### 5.5 What lives where (file structure suggestion)

```
/app
  /page.tsx              ← the whole app, single page
  /api/render/route.ts   ← v1.5 server render
/components
  /Knob.tsx
  /RampEditor.tsx
  /OscPanel.tsx
  /FxRack.tsx
  /Preview.tsx
  /ExportModal.tsx
/lib
  /shaders/
    /structure/
      erosion.glsl
      ascii_luma.glsl
      ...
    /fx/
      rgb_split.glsl
      ...
    /filter.glsl
  /pipeline.ts           ← the render loop
  /project.ts            ← save/load logic
/public
  /presets/              ← preset ramps as JSON
```

---

## 6. Effect Taxonomy — What Ships, What's Cut

This section is the most-likely-to-cause-fights section. Holding the line on small numbers.

### 6.1 What ships in v1

| Stage | Count | List |
|---|---|---|
| OSC sources | 3 | Video, Image, Webcam |
| Structure | 12 | Off, Erosion, Dilation, ASCII Luma, Halftone, 8-bit, Edge, Threshold, Skeleton, Watershed, Voronoi, Pixelate |
| Filter presets | 12 | Nebula, Aurora, Event Horizon, Solar, Bioluminescence, Cyanotype, Tokamak, Mineral, Deep Field, Thermal, Mono, Inverted |
| FX | 10 | RGB Split, Feedback Warp, Echo, Mirror, Datamosh, Scanline, CRT, Vignette, Grain, Bloom |

**Total: 34 shader files.** Manageable in 6 weeks.

### 6.2 What's cut from the TD version (and why)

- **Most of Stage 2 in TD** — 49 → 12 because the ramp editor replaces the rest. Users build their own.
- **Crystal, Cellular, Wave, Voronoi Diff, Rivers** — feedback shaders that take 30+ frames to develop. Bad UX in a "drag and see instantly" app. Defer to v2 as a separate "generative" mode.
- **Slit-Scan** — has the cacheselect TD-specific bug, isn't worth porting.
- **Caustic Lensing, Anisotropic Smear, Contour Wrap, Flow Erosion, Waveform FM, Melt, Grain Extract, Emboss, Skeleton variants** — overlap with simpler effects, cut to reduce decision fatigue.
- **All motion-extraction channels (BlobTracking)** — separate product. Don't ship in v1.

### 6.3 What's added that TD doesn't have

- **Live shader thumbnails** in pickers
- **Ramp editor** for color (vs. preset-only)
- **FX rack stacking** with reorder + toggle (vs. one-effect-per-slot in TD)
- **Project save/load as JSON**

---

## 7. Pricing

### 7.1 The plan

- **Free tier:** Full app. All effects unlocked. 720p export max. Watermark on exported videos.
- **Paid tier:** Watermark removed. 4K export. Cloud render (when v1.5 ships).

### 7.2 Pricing structure

- **One-time purchase:** $39 (matches your Patreon Gumroad pricing for TD version)
- **Monthly subscription:** $5/mo
- **Annual subscription:** $39/yr (same as one-time, hides as a discount)

The one-time and monthly coexist in checkout. Customers pick. Drop the one-time option if monthly revenue exceeds 3x one-time revenue per month for 2 months running.

### 7.3 Why both

- One-time captures hesitant buyers ("I'll buy it once, never again")
- Monthly captures recurring users ("It's $5, sure")
- Annual is the best deal and what most fans will pick if presented well

### 7.4 What's NOT gated

- The product itself, all features, all effects, the ramp editor, save/load, all sources. Everything. The only thing the watermark gates is **clean exports**. This is critical for build-in-public — viewers should be able to use the free tier and post results, just with the watermark visible. The watermark itself becomes marketing.

### 7.5 Watermark design

Bottom-right corner, small (~80px wide), the word "PROJECT_NAME" in the gradient text style from the Patreon guide cover. Clickable in the export → links back to the site. Don't make it ugly or aggressive — make it a logo people recognize.

---

## 8. Roadmap — 6-Week Build-in-Public Plan

Each week ships **a posted thing** + **a thing the friend coded**. The posted thing drives marketing. The coded thing drives product.

### Week 0 — Setup & Spec
- Friend reads this PRD, asks questions, agrees on stack
- Repo set up, Next.js + shadcn scaffold, Vercel deploy
- One Hello World shader running in-browser
- **Posted:** Reel #1 — face-to-camera "I'm building a thing in 6 weeks, here's the idea"

### Week 1 — Skeleton
- Three-panel layout, knobs render (don't all work yet), preview window plays a video
- One Structure shader (Erosion) wired end-to-end
- One Filter ramp (hardcoded preset, not editable yet)
- **Posted:** Reel #2 — "first frame rendered, here's what it looks like" + screen recording

### Week 2 — OSC complete
- All 12 Structure shaders working
- Live waveform thumbnails in the picker
- Source switcher (video/image/webcam)
- Knob component fully functional
- **Posted:** Reel #3 — "12 ways to break a video. tap each one." Quick-cuts of all 12 effects on the same source

### Week 3 — FILTER (the ramp editor)
- Full ramp editor: add/move/delete stops, color picker, live preview
- 12 preset ramps loadable
- **This is the make-or-break week.** If the ramp editor isn't great by end of week 3, push timeline by a week. Don't ship a half-broken ramp editor.
- **Posted:** Reel #4 — "watch me paint with light" — record yourself dragging stops around the ramp, video updates live. This is the "wow" reel.

### Week 4 — FX Rack
- All 10 FX shaders
- Stack/reorder/toggle UI
- Per-card live thumbnails
- **Posted:** Reel #5 — "stacking effects. RGB split → CRT → vignette." The compositional power reel.

### Week 5 — Export + Save/Load + Polish
- mp4 export (MediaRecorder)
- png export
- Project save/load as JSON
- All 4 export resolutions (Reels, landscape, square, source)
- Watermark on free exports
- **Posted:** Reel #6 — "ship date in 7 days, here's how it sounds when it's done" — full demo video, no voiceover, just the tool

### Week 6 — Stripe + Public Launch
- Stripe Checkout integrated (one-time + monthly)
- Watermark gating wired
- Landing page (single scroll, hero video, pricing, footer)
- Domain pointed
- **Posted:** Reel #7 (LAUNCH) — "it's live. link in bio." 30s of best moments + URL on screen at the end

### v1.5 (post-launch, weeks 7-10)
- Accounts (Clerk)
- Cloud sync for projects
- Server render for 4K + long videos (paid feature)
- Webcam recording (live VJ killer feature)
- Mobile responsive

### v2 (3+ months out)
- Generative mode (the cut feedback shaders, Crystal/Wave/Cellular as a separate "synth oscillator")
- BlobTracking integration
- MIDI controller mapping (the OP-1/Push moment)
- Audio-reactive (FFT input drives params)

---

## 9. Naming Brief

**Lock the name by end of Week 3.** Cannot ship without one.

### 9.1 Criteria the name must hit

- ☐ **2 syllables ideal, 3 max.** No long names.
- ☐ **Not a real English word.** Inventable, ownable, googleable.
- ☐ **The .com or .app should be available** (or a clean variant)
- ☐ **Sounds like an instrument, not software.** Korg, Moog, Arturia, Teenage Engineering — that energy. Not "VideoTransformAI."
- ☐ **No "AI," "Studio," "FX," "Lab," "Tool" anywhere in the name.** Generic killers.
- ☐ **Pronounceable on first read.** No ambiguous spellings.
- ☐ **Works as a verb if possible.** "I [name]ed this clip" should sound natural.
- ☐ **Visually clean as a wordmark.** Mostly lowercase letters with no descenders is best for logo design.

### 9.2 Direction options to brainstorm against

- **Synth-flavored:** Lumi-, -wave, -tron, -oid, -osc
- **Optical/light-flavored:** -lux, -ray, -prism, -opt
- **Made-up:** Pure invention, like Oklch, Ableton, Linear

### 9.3 Anti-patterns

- Anything starting with "Visual"
- Anything ending in "Lab" or "FX"
- Anything that sounds like a SaaS company
- Anything that's a real word (lawsuits, SEO hell)

---

## 10. Out of Scope for v1 — The "No" List

This list exists to prevent scope creep. Every "wouldn't it be cool if" goes here, and the answer is "yes, in v2."

- ❌ User accounts / login
- ❌ Cloud project sync
- ❌ Mobile responsive layout
- ❌ Tablet / iPad
- ❌ Multiplayer / real-time collab
- ❌ MIDI input
- ❌ Audio reactivity
- ❌ Custom shader upload
- ❌ Plugin system / API
- ❌ Tutorials / interactive onboarding (v1 ships with a 2-min YouTube link, that's it)
- ❌ Light mode
- ❌ Multilingual
- ❌ Image-to-image AI integrations
- ❌ Webcam recording (preview only in v1)
- ❌ Animated parameter automation / keyframes
- ❌ Layer / multi-track compositing
- ❌ Mask painting / region exclusion
- ❌ Custom resolution beyond the 4 presets
- ❌ Chromecast / external display

If a feature is on this list and your friend says "but it's easy" — tell them "v2."

---

## 11. Open Questions

Things [you] and [friend] need to decide together:

1. **Final stack confirmation** — Next.js + ogl + shadcn? Or does friend want SvelteKit / Solid / something else?
2. **Hosting** — Vercel default? Or Cloudflare Pages for cheaper free tier?
3. **Stripe vs. Lemon Squeezy vs. Paddle** for payments — Stripe = most flexible, LS/Paddle = handle EU VAT for you. Pick by Week 4.
4. **Domain budget** — willing to spend $20-100 on a one-word `.com`? Or fine with `.app` / `.fm` / `.cc`?
5. **Analytics** — PostHog (free tier great)? Plausible? Vercel built-in?
6. **Error tracking** — Sentry free tier?
7. **Build-in-public posting cadence** — 1 reel/week minimum, but could you do 2? More content = more compounding.
8. **Beta tester list** — who are the 10 people who get early access in Week 5? Start collecting now.

---

## 12. Success Metrics

What does "v1 worked" mean?

**Week 6 (launch day):**
- 1,000 unique visitors to landing page
- 50 free signups (or just "tried the tool" if no auth)
- 5 paying customers

**Month 1:**
- 50 paying customers (mix of one-time + monthly)
- $1,500 revenue
- 1 reel >100K views

**Month 3:**
- 200 paying customers
- $3,000 MRR-equivalent (mix of one-time + monthly)
- One feature shipped from v1.5 list
- One creator with >100K followers using/posting it organically

If we miss Month 1, we don't panic — we look at the funnel and fix the biggest leak (probably hook reel or onboarding).

If we miss Month 3, we revisit positioning. Either the audience isn't there or the product isn't them.

---

## Appendix A — Build-in-public content engine

Every week, your friend's Git commits + your face = content. The format that works:

**60-second face-to-camera reel structure:**
- [0-3s] Face hook: "week N of building [PROJECT_NAME]. here's what's new."
- [3-10s] Screen recording of the new feature, voiceover continues
- [10-25s] Demo of the feature being used to make something cool
- [25-35s] Best output result, full screen
- [35-50s] What's next week / why this matters
- [50-60s] "Link in bio if you want to follow." End frame with handle.

Post Wednesdays or Saturdays (highest reach windows for creative content).

**Don't break the streak.** 6 weeks of weekly posts = the algorithm learns you = the launch reel hits much harder. Missing a week is worse than posting something mediocre.

---

## Appendix B — Things to figure out as we go (not blocking v1)

- Logo / brand mark
- Onboarding (probably a 90-second skippable demo on first load)
- Email capture for "notify me when 4K export ships"
- Affiliate / referral program
- Documentation site (or just a really good landing page FAQ)

---

*End of v0.1. Iterate this doc. Track changes in git. Don't treat it as gospel — treat it as the current best guess. If something here is wrong by Week 3, edit it. The PRD's job is to keep you and your friend aligned, not to be a museum piece.*
