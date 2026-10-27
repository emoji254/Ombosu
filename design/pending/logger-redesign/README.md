# Set logger redesign (PENDING, not in the app yet)

Status: **pending**. Approved look, not built into `index.html` yet. Nothing here is loaded by the app.

Preview (private to the owner): https://claude.ai/artifact/VBrUA6qCYygVm8a224PwSD
Screenshot: `preview.png`

## What it changes (look only, no features)
- Flat layout: no card around each exercise, a thin line between exercises
- Column headings in small capitals (SET · PREVIOUS · KG · REPS · ✓), all centred
- "Previous" as plain text ("40 kg × 10")
- White kg / reps boxes with the app's soft border, numbers centred; all boxes in a row the same height
  ("Total: 60 kg" inside the kg box on bar exercises, only once there is a weight)
- ✓ box shows a faint check; ticked sets turn the app's green with the light green row tint
- Text buttons: ADD SET, ADD EXERCISE, CANCEL WORKOUT (red); full-width SAVE SESSION
- Bottom section (conditioning, notes, save) lined up with the exercises

Decided against: rest-time lines between sets (the floating SESSION/REST pill covers rest), the reference app's top bar,
and blue (the app's own colours are kept).

## To build it in
Move the rules in `logger-redesign.css` into the app's styles (they are scoped to `body.in-session`), put the
"40 kg × 10" spacing into `exBlock()` instead of `logger-redesign.js`, run `node tools/update-hashes.js`, then the tests.
