Hot Potato --- Current Implementation Context

Maze Asset Rendering --- Current State

Completed

Maze wall asset orientation support has been fixed.

wall.png and wall_end.png are currently being used as the maze
wall assets.

Both assets are 128×128 PNGs.

The renderer can now orient the existing wall assets correctly for
the required wall directions.

Current Asset Limitations

We do not currently have dedicated assets for: - Wall corners -
T-junctions

Required Corner Behavior

Do not create or require new corner assets yet.

Corners must be rendered using the existing wall.png asset.

Rotate/reuse wall.png as necessary so corner cells visually
display instead of disappearing.

Preserve the existing hand-painted maze visual style while working
only with the assets currently available.

T-Junction Behavior

No dedicated T-junction asset exists yet.

Do not introduce a new asset requirement unless explicitly requested
later.

Continue using the available wall assets wherever possible.

Important Constraint

Future maze-rendering changes must not break the already-fixed wall
orientation behavior.

Game Concept Pivot — Hot Potato → Miami Mice

Core Concept Change

The game has pivoted away from the Hot Potato / bomb concept.

The game is now called Miami Mice.

Players are represented as mice.

There is no bomb mechanic and no trap mechanic.

The existing gameplay mechanics (maze generation, movement, timer/cycle behavior, multiplayer architecture, etc.) should remain unchanged unless explicitly requested. This pivot is primarily a presentation, terminology, and visual-state change.

Turn / Target Concept

When Player A is the active player, Player A is the mouse.

Player B's current position is represented visually as the cheese / target.

When Player B is the active player, Player B is the mouse.

Player A's current position is represented visually as the cheese / target.

The active player's character should therefore no longer have any bomb-related visual effect.

Required Text / UI Terminology Changes

Remove or replace all remaining bomb/Hot Potato terminology throughout the frontend UI, menus, status text, instructions, game-over text, and other player-facing copy.

Examples of the conceptual replacements:

Bomb → Cheese

Bomb holder / bomb carrier → Mouse / active mouse

Bomb passed → Cheese stolen / cheese reached (choose wording that fits the existing UI context)

Bomb exploded / detonation → Time's up / cheese got away

Any references to Hot Potato → Miami Mice

Any bomb-specific instructions or menu descriptions → rewrite around the mouse hunting the cheese

Active Player Visual State

Remove the existing bomb-glowing / bomb-carrying visual effect from the active player.

The active player should simply be rendered as their mouse character.

Do not introduce a replacement glow/effect unless explicitly requested later.

Important Scope Constraint

Do not invent new gameplay mechanics, lore, world-building, trap systems, or additional creative direction as part of this pivot.

The creative/art direction is being handled separately.

For implementation, focus only on:

Replacing outdated player-facing text and menu terminology.

Removing bomb-related UI references.

Removing the active-player bomb glow/effect.

Representing the inactive player's position as the cheese target where the existing game state already supports this.

Preserve all existing gameplay behavior and architecture unless a change is strictly required to remove bomb-specific presentation.

Maze Container / Responsive Layout — Current Issue & Required Direction

Current Problem

The maze/game-board layout is technically responsive, but the responsiveness is currently poor.

On some device sizes/aspect ratios, parts of the 15×15 maze are cut off or fall outside the usable viewport.

The maze should always remain fully visible and usable across supported desktop and mobile viewport sizes.

The current sizing/layout logic should be audited rather than assuming the existing responsive calculation is sufficient.

Avoid solutions that simply allow the board to overflow off-screen or crop portions of the maze.

Maze Boundary Visual Pivot

The current game has a faint HTML/CSS visual boundary/container surrounding the maze.

This should eventually stop looking like a generic CSS container around the board.

The maze boundary itself should visually feel like part of the hand-painted maze environment.

Reuse the existing wall.png and wall_end.png assets to construct the visible outer/boundary walls around the maze.

The goal is for the entire playable area to feel enclosed inside the same physical maze structure, rather than having a CSS/card-like border around a separate maze.

Important Rendering Requirements

wall.png and wall_end.png are the currently available maze wall assets.

Do not introduce new boundary-specific assets unless explicitly requested.

The boundary implementation must account for the transparent/rounded portions of the PNG assets so the resulting enclosure looks intentional and connected.

The existing correct wall orientations must remain intact.

Boundary walls should scale with the maze and remain aligned with the 15×15 logical grid.

The boundary must not interfere with player movement, collision detection, maze coordinates, WebSocket state, or game logic; it is a visual/environmental layer unless the existing architecture explicitly treats the boundary as collision geometry.

Scope for Future Implementation

When implementing this:

First audit the current board/container sizing and identify why portions of the maze are cut off on certain viewport sizes.

Make the board/container responsive so the complete maze remains visible without undesirable cropping.

Replace the faint generic CSS boundary with a visual wall enclosure using the existing wall.png / wall_end.png assets.

Keep the maze's logical 15×15 coordinate system unchanged.

Do not alter gameplay, timers, movement, multiplayer synchronization, or maze generation as part of this visual/layout change.


## Phase — Maze Floor Tile Variants

We are introducing a dedicated maze floor asset.

### Current Assets

There are 3 visually similar floor tile variants:

- `tile1.png`
- `tile2.png`
- `tile3.png`

All three represent the same logical maze floor tile, with only subtle visual differences intended to add texture/variety.

### Requirements

- The logical maze/grid structure must remain completely unchanged.
- Floor tiles must occupy the existing 15×15 logical grid cells.
- The three variants should be distributed across floor/open cells to avoid the entire maze looking like a repeated single texture.
- Do NOT change maze generation, movement, collision, player positions, timing, or WebSocket/gameplay logic.
- The visual variation should be deterministic per maze/round where practical, rather than changing every React render.
- Avoid obvious repetitive patterns or large clusters of the same tile.
- The implementation should preserve the existing responsive board sizing and scaling.
- The agent should decide the best distribution strategy based on the existing rendering architecture. A seeded/randomized selection is acceptable, but it should remain stable for the lifetime of a maze.

### Important

These assets are only for the visual floor/background of OPEN maze cells.

Wall cells continue to use the existing wall asset system:

- `wall.png`
- `wall_end.png`


The goal is simply to make the open areas of the maze feel less repetitive and more hand-painted/natural while preserving the current gameplay exactly.