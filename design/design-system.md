# Tomato Desktop Widget — Design System

## Product context

A Windows desktop Pomodoro widget for people doing focused knowledge work. It should live above or beside normal windows, be readable at a glance, and require one click for the primary action. The initial design artifact is a comparison board showing three credible visual directions for the same compact widget.

## Core jobs and states

- See remaining focus time instantly.
- Start or pause without opening a full application.
- Know the current task and edit it with low friction.
- Skip or reset a session deliberately.
- See today's completed Pomodoros without visual noise.
- States: ready, focusing, paused, short break, long break, completed.

## Widget architecture

- Compact desktop widget target size: approximately 320 x 210 px.
- One main countdown, one short current-task label, one dominant start/pause button.
- Secondary actions: reset, skip, expand/settings, drag handle.
- Session progress: four small indicators; completed indicators are filled.
- Window behavior to imply visually: rounded frameless surface, optional always-on-top pin, draggable top area, Windows-style minimize/close affordances only when expanded.
- The comparison board places three widgets side by side with equal size, identical content and a short label beneath each.

## Shared content

- Timer: 25:00.
- Mode: Focus.
- Current task: “整理项目方案”.
- Progress: 2 of 4 focus sessions completed.
- Primary action: Start.
- Secondary controls: reset, skip, settings, always-on-top pin.

## Typography

- Use Segoe UI Variable or Segoe UI only.
- Timer uses tabular numerals, 44–52 px, semibold.
- Labels 12–14 px; supporting metadata 11–12 px.
- Avoid decorative fonts and unnecessary all caps.

## Spacing and geometry

- 8 px base spacing grid.
- Widget outer radius 20 px; button radius 12–14 px; circular icon buttons 32–36 px.
- Minimum internal padding 16 px.
- Touch/click target minimum 32 px while preserving compact density.

## Comparison direction A — Windows 11 minimal translucent

- Fluent-inspired frosted acrylic surface, soft cool-gray/blue tint, very subtle noise and border highlight.
- Palette: #F7F9FC translucent base, #1F1F1F primary text, #5F6368 secondary text, #2563EB accent, #FFFFFF controls.
- Gentle blue timer progress ring; restrained shadows and crisp Windows iconography.
- Calm, neutral, native-feeling, suitable for professional desktop environments.

## Comparison direction B — Friendly tomato character

- Warm creamy card with tomato-red accents and one small expressive tomato mascot integrated near the timer, not a large illustration.
- Palette: #FFF7ED base, #D9483B tomato red, #2F3A2F leaf green, #3B2A24 text, #FFD8C7 soft highlight.
- Rounded, friendly controls and lightly playful microcopy; still legible and usable for adults.
- Avoid childish clutter, oversized cartoon decoration, emoji-based icons, and novelty fonts.

## Comparison direction C — Dark professional focus tool

- Near-black graphite surface with sharp hierarchy, thin separators, restrained red-orange focus accent.
- Palette: #111315 base, #F4F4F5 primary text, #9CA3AF secondary text, #FF5A3D accent, #25282C controls.
- Slightly denser information layout, precise progress arc, compact status chip, quiet technical feel.
- No neon gradients, cyberpunk glow, or gamer styling.

## Motion and feedback

- 160–220 ms ease-out transitions for hover, press and state changes.
- Timer progress ring advances smoothly but does not constantly pulse.
- Start button uses a subtle press scale; completion may use one short confetti-free success ripple.
- Respect Windows reduced-motion preferences.

## Accessibility and platform requirements

- Maintain at least WCAG AA contrast for text and controls.
- Do not rely on color alone for focus/break states.
- Keyboard focus ring must be visible.
- Use Windows-native visual expectations and compact desktop scale, not a mobile app card enlarged onto a page.
- Provide a clean neutral desktop background on the comparison board so translucency and shadows are visible.
