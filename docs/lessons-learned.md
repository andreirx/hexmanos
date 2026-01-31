# Hexmanos Engineering: Lessons Learned & Architectural Decision Records (ADR)

This document captures the critical engineering challenges, the failures we encountered, and the architectural solutions we codified. It serves as a warning against regression.

---

## 1. AI-Assisted Development Governance

### The "Context Rot" Problem
**Observation:** In long chat sessions, the AI forgets the architectural "Big Picture," leading to circular refactoring or hallucinated features.
**Solution:**
*   **Beads (Long-Term Memory):** The chat window is RAM; `.beads/issues.jsonl` is the Hard Drive. We must use `bd create` to dump plans immediately.
*   **The Constitution (`CLAUDE.md`):** Critical rules (Naming conventions, Architecture layers) must be explicitly codified in a file the AI reads on startup.
*   **Self-Driving:** Instead of micro-managing tasks, we give the AI the *Plan* and ask it to generate the *Epics*.

---

## 2. Backend Architecture (Spring Boot)

### The "Clean Architecture" Implementation details
**Observation:** Standard Spring `@Service` annotations couple business logic to the framework, making it hard to test or swap implementations.
**Solution:** The "Hexmanos Pattern".
1.  **Core:** Pure Java. No Annotations.
2.  **App:** Configuration classes (`AssetConfig`) manually wire Core services using `@Bean`.
3.  **External:** Adapters implement Core interfaces.

### The Hibernate Naming Trap
**Failure:** We defined `s3KeyPrefix` in Java and `s3_key_prefix` in SQL. Hibernate failed validation because it maps CamelCase to snake_case unpredictably with numbers/acronyms.
**Solution:**
*   **Rule:** Never use `@Column(name="...")` manual mapping.
*   **Fix:** Rename fields to be semantically clear and unambiguous (`storageKeyPrefix` -> `storage_key_prefix`).
*   **Migrations:** SQL files must strictly follow the `snake_case` output of the Java naming strategy.

---

## 3. Frontend Rendering (Performance)

### The "Naive Canvas" Bottleneck
**Failure:** In the Map Editor, calling `ctx.fillRect` for 16,384 tiles (128x128 grid) every frame caused massive lag.
**Solution:** **The Offscreen Buffer Pattern.**
*   Render the terrain *once* to an offscreen canvas.
*   The main render loop draws that single image (`drawImage`) and overlays the cursor.
*   Only redraw the offscreen buffer when data changes.

### The "React State" Input Lag
**Failure:** Updating React State (`useState`) on every `mousemove` event triggered the Diffing Engine, causing "mushy" drawing input.
**Solution:** **Transient State (Ref-based).**
*   Mutate a `useRef` directly during drag operations.
*   Manually request an animation frame.
*   Only commit to React State on `mouseup`.

---

## 4. Game State Synchronization

### The "Visual State" Fallacy
**Failure:** The game client tried to determine if a character was walking by checking `sprite.anims.isPlaying`. When zooming out (switching Mipmaps), the sprite was destroyed, the animation stopped, and the logic assumed the character stopped moving.
**Solution:** **State Mirroring.**
*   The Frontend maintains a logical `Map<CharId, State>` separate from the Visuals.
*   When rendering (or zooming), we ask the *Map* what the state is, then force the Sprite to match it.

### The "Distributed Timing" Desync
**Failure:** The Backend calculated movement speed based on Tile Cost (e.g., 600ms for Water). The Frontend tweened at a fixed 150ms. Characters stuttered and teleported.
**Solution:** **Backend-Dictated Timing.**
*   The Backend calculates the duration.
*   The Backend sends `duration` in the WebSocket event.
*   The Frontend uses that *exact* duration for the Tween and scales animation speed accordingly (`timeScale`).

---

## 5. Graphics Technology

### The "WebGPU/EDR" Pivot
**Decision:** We considered switching to PixiJS v8 or Raw WebGPU to support Extended Dynamic Range (HDR).
**Verdict:** **Rejected for MVP.**
*   Browser support for EDR is experimental.
*   Phaser 3 is robust for the *Gameplay Loop* (Input, Physics, Tilemaps).
*   **Strategy:** Finish the Game Mechanics (Economy, Combat) on Phaser. Build a separate "High Fidelity" renderer later if needed, consuming the same Backend API.

---

## 6. Asset Pipeline

### The "Floating Skirt" Bug
**Failure:** Auto-generated transition tiles (alpha blending) were generated upside down because "North" in the Generator (Image Top) meant "North Neighbor" (Canvas Top) in the renderer, creating a gap.
**Solution:** Invert generation logic. A "North Transition" connects to the neighbor *Above*, so it must be solid at the *Bottom*.
