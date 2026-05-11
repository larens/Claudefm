# Overlay Transient Chat UI Design

## Background

The side panel currently appends temporary chat UI directly into the main chat stream:

- pending assistant messages created by `startPendingAssistant()`
- recommendation cards created by `showRecommendConfirm()` and `showRecommendPush()`

At the same time, the Soul, History, and Settings surfaces are rendered as full-screen overlay panels using:

- `#soulPanel`
- `#historyPanel`
- `#settingsPanel`

When one of these overlay panels is open, the temporary chat UI can remain visible behind or around the overlay, which is distracting and looks broken. The user wants these temporary chat elements to be suppressed whenever any of the three overlay panels is expanded.

## Goals

- Hide transient chat UI while Soul, History, or Settings overlay is open
- Apply one shared rule for all three overlays instead of per-panel special cases
- Limit the hidden scope to transient chat UI only
- Restore the hidden UI automatically when all overlays are closed

## Non-Goals

- Do not hide normal user or assistant chat history
- Do not change queue, player, or composer behavior
- Do not clear pending state or destroy recommendation cards
- Do not redesign overlay layout or z-index structure

## Chosen Approach

Use a shared overlay-active state on the root app container, then let CSS suppress transient chat UI while that state is active.

This approach is preferred because:

- it centralizes the rule in one place
- it avoids repeated DOM show/hide logic for each individual temporary node
- it scales to future overlay panels if they adopt the same state refresh helper
- it preserves transient node state so the UI can reappear after the overlay closes

## Behavior

### Overlay State

Add one small helper in `extension/sidepanel.js` that checks whether any of these panels is currently visible:

- `elSoulPanel`
- `elHistoryPanel`
- `elSettingsPanel`

If any panel is visible, the helper marks the root app container as overlay-active. If all are hidden, the helper removes that state.

### Hidden Elements

While overlay-active is set, only these transient chat UI elements are hidden:

- pending assistant bubble: `.msg.pending`
- recommendation cards: `.recommendCard`

No other chat message types are affected.

### Lifecycle

The overlay-active state must refresh whenever these actions happen:

- `openSoulPanel()`
- `closeSoulPanel()`
- `openHistoryPanel()`
- `closeHistoryPanel()`
- `openSettingsPanel()`
- `closeSettingsPanel()`

Because the existing button handlers already route through these open/close helpers, refreshing the shared overlay state inside those functions is sufficient.

## Implementation Notes

### JavaScript

In `extension/sidepanel.js`:

- capture the root app element once
- add `refreshOverlayTransientUiState()`
- call it from each overlay open/close helper after toggling `hidden`

The helper should only manage one CSS class and should not mutate `pendingAssistantEl` or `recommendCardEl` directly.

### CSS

In `extension/sidepanel.css`:

- add a rule scoped by the root overlay-active class
- hide `.msg.pending` and `.recommendCard` using `display: none`

This keeps the suppression declarative and avoids per-node inline style changes.

## Risks And Edge Cases

- If a new overlay panel is added later and does not use the shared refresh helper, transient chat UI may leak again
- If recommendation cards or pending messages are moved outside the chat area in the future, the selector contract must be updated
- Because nodes are hidden rather than removed, any timers or async work continue running as before, which matches the requested behavior

## Validation Plan

- Trigger a chat request and wait until `.msg.pending` appears
- Open Soul, verify the pending bubble disappears
- Close Soul before the reply returns, verify the pending bubble reappears
- Open History and Settings in the same way and verify the same behavior
- Trigger a recommendation card, open each overlay, verify the card is hidden and restored on close
- Confirm normal chat history remains visible before and after overlay toggles

## Acceptance Criteria

- Any open state of Soul, History, or Settings suppresses `.msg.pending`
- Any open state of Soul, History, or Settings suppresses `.recommendCard`
- Closing the last open overlay restores the suppressed transient chat UI
- Normal chat messages remain visible throughout
