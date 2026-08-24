# Hot Potato — Product Requirements & Technical Guide

## 1. Purpose

This document is the implementation guide for the coding agent building **Hot Potato**, a small 1v1 browser game.

The goal is not to build a general-purpose game engine. The goal is to ship a polished, understandable, hackathon-ready game with a very small technical surface area.

The game should feel like a digital evolution of the childhood "hot potato" / passing game:

> **Your turn → reach the opponent → pass the bomb → new maze → their turn → repeat.**

Neither developer is a professional game developer, so simplicity, determinism, debuggability, and a clear separation between game logic and rendering are higher priorities than technical sophistication.

---

# 2. Product Concept

## Core premise

Two players occupy fixed opposite corners of a square maze:

- Player A: top-left
- Player B: bottom-right

Only the player currently holding the bomb can move.

The active player must navigate the maze and reach the stationary opponent before the bomb explodes.

When the active player reaches the opponent:

1. The bomb transfers to the opponent.
2. A short transfer animation/freeze occurs.
3. A new procedural maze is generated.
4. Both players are returned to their fixed spawn corners.
5. The newly active player becomes the bomb holder.
6. The next turn begins.

The rhythm is deliberately asymmetric:

```text
PLAYER A MOVES
      ↓
A reaches B
      ↓
B receives bomb
      ↓
NEW MAZE
      ↓
PLAYER B MOVES
      ↓
B reaches A
      ↓
A receives bomb
      ↓
NEW MAZE
      ↓
...
```

If the bomb timer expires while a player is holding it, that player loses the round.

---

# 3. Product Goals

## Primary goals

- Make the core movement/passing loop immediately understandable.
- Make each turn feel tense and rewarding.
- Generate a new maze for every successful bomb transfer.
- Keep the game playable in a browser with no game engine.
- Support 1v1 multiplayer.
- Make the game visually distinctive enough for a hackathon submission.
- Keep the implementation simple enough for two non-game-dev students.

## Non-goals for MVP

Do NOT build:

- physics simulation
- continuous collision physics
- 3D
- camera systems
- complex enemy AI
- procedural world generation beyond the maze
- inventory systems
- matchmaking infrastructure
- accounts/authentication
- persistent databases
- advanced client prediction/rollback
- ECS architecture
- generic game-engine abstractions

---

# 4. Technology Stack

## Frontend

- React
- TypeScript
- Vite
- CSS
- CSS Grid for maze tiles
- DOM elements for the maze and characters

## Backend

- Python
- FastAPI
- WebSockets

## Rendering philosophy

Do NOT introduce a game engine for MVP.

Phaser and similar engines provide a game loop, scenes, input, rendering, tweens, and other systems, but this game does not require most of those systems. A conventional game engine is therefore an unnecessary dependency for the first implementation.

The game is primarily state-driven:

```text
GAME STATE
    ↓
React
    ↓
DOM / CSS
```

CSS can handle the short visual transition between logical grid positions.

If future visual requirements become substantially more complex, reassess the renderer. Do not introduce Canvas/Phaser merely because this is technically a "game."

---

# 5. High-Level Architecture

```text
                         FASTAPI
                      GAME SERVER
                           │
                       WebSocket
                    ┌──────┴──────┐
                    │             │
                Player A       Player B
                    │             │
                 React          React
                    │             │
               CSS Grid       CSS Grid
                    │             │
                 Renderer       Renderer
```

The backend is authoritative for all meaningful game state.

The frontend is responsible for:

- input capture
- rendering
- visual interpolation
- animations
- sound
- UI
- displaying state received from the server

The backend is responsible for:

- maze generation
- player logical positions
- active player
- bomb ownership
- bomb expiration
- movement validation
- bomb transfer
- scoring
- round lifecycle
- match lifecycle

---

# 6. Core Game State

Use explicit typed models.

Conceptually:

```ts
type Position = {
  x: number;
  y: number;
};

type PlayerState = {
  id: string;
  position: Position;
  score: number;
};

type GamePhase =
  | "WAITING"
  | "COUNTDOWN"
  | "PLAYING"
  | "BOMB_TRANSFER"
  | "ROUND_OVER"
  | "MATCH_OVER";

type GameState = {
  roomId: string;
  phase: GamePhase;
  round: number;

  maze: Maze;

  playerA: PlayerState;
  playerB: PlayerState;

  activePlayerId: string;
  bombHolderId: string;

  bombExpiresAt: number;

  maxRounds: number;
};
```

The exact implementation may differ, but the conceptual state should remain this simple.

---

# 7. Player Positions

## Fixed spawn positions

Do NOT randomly choose spawn positions.

Player A always starts at the top-left playable cell.

Player B always starts at the bottom-right playable cell.

For example:

```text
A . . . # . . .
. # . . # . # .
. # . . . . # .
. . . # # . . .
. # . . . # . .
. # . # . . . .
. . . . . . # .
. . . # . . . B
```

The exact coordinates depend on the generated maze.

The maze generator must guarantee that these two spawn cells are traversable and connected.

If a generated maze does not satisfy the constraints, discard it and generate another.

## Why fixed spawns?

Fixed spawns provide:

- predictable player orientation
- simpler game rules
- easier UI
- easier debugging
- consistent visual identity
- clear "opposite corners" gameplay

The maze changes, not the spawn locations.

---

# 8. Maze Representation

## Recommended MVP representation

Do NOT over-engineer the grid with bitmasks initially.

A simple matrix is easier to understand and debug.

Recommended conceptual representation:

```python
grid[y][x]
```

Where:

```text
0 = traversable
1 = wall
```

Example:

```python
[
    [1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1],
]
```

Keep dynamic entities separate from the maze.

Do NOT encode:

- Player A
- Player B
- bomb
- power-ups

inside the base wall/floor matrix.

Instead:

```text
maze → static topology
players → positions
bomb → ownership
items → separate state
```

This prevents the maze representation from becoming difficult to reason about.

## Optional future optimization

Bitmasked integer cells are technically viable and compact, but they are not required for the MVP.

Only introduce bitmasks if a concrete future requirement justifies them.

---

# 9. Maze Generation

## Recommended algorithm

Use:

**Randomized Recursive Backtracking / DFS**

This is recommended because:

- simple to implement
- easy to debug
- produces fully connected perfect mazes
- naturally random
- good fit for small grids
- guarantees connectivity when implemented correctly

A perfect DFS maze has many dead ends and a single path between cells.

That is useful as a foundation but can be too restrictive for chase gameplay.

## Braiding

After generating the DFS maze, optionally perform a braiding pass.

Braiding means opening selected dead ends to create loops and alternate routes.

Suggested initial value:

```text
braid probability = 0.40
```

Do not hard-code this everywhere.

Make it a configuration value:

```python
BRAID_PROBABILITY = 0.40
```

This lets gameplay tuning happen without rewriting the generator.

---

# 10. Maze Generation Pipeline

The generator should conceptually be:

```text
generate_maze()
      ↓
DFS maze
      ↓
braid dead ends
      ↓
validate spawn cells
      ↓
BFS shortest path
      ↓
validate minimum path length
      ↓
validate basic fairness
      ↓
return maze
```

If validation fails:

```text
discard maze
      ↓
generate again
```

Do not attempt complicated repair logic for MVP.

Regeneration is simpler.

---

# 11. Maze Dimensions

Start small.

Recommended initial dimensions:

```text
15 × 15
```

or

```text
21 × 21
```

The grid should be configurable.

For example:

```python
MAZE_WIDTH = 21
MAZE_HEIGHT = 21
```

Do not start with a huge maze.

A smaller maze makes:

- movement easier
- debugging easier
- DOM rendering easy
- WebSocket state small
- gameplay faster

Tune the size after playtesting.

---

# 12. Maze Fairness

Random does not automatically mean fun.

The generator must reject obviously bad layouts.

At minimum:

### Requirement 1 — Spawn cells traversable

A and B must be on floor cells.

### Requirement 2 — Spawn cells connected

There must be a path from A to B.

### Requirement 3 — Minimum path distance

The shortest path should not be trivially short.

Use a configurable minimum.

Do NOT blindly hard-code the research formula as a universal rule.

Start with a tunable value such as:

```python
MIN_PATH_LENGTH = configurable
```

and playtest.

### Requirement 4 — Avoid excessive dead ends

Braiding should reduce frustrating dead-end density.

Do not optimize this mathematically before playtesting.

---

# 13. BFS Validation

Use BFS to determine the shortest traversable path between the two fixed spawn points.

Conceptually:

```text
BFS(start=A, target=B)
```

For each cell:

1. Check four cardinal neighbors.
2. Ignore walls.
3. Ignore already visited cells.
4. Continue until B is found.
5. Return shortest path length.

The BFS should be reusable as a utility:

```python
shortest_path_length(grid, start, target)
```

Potential future use:

- difficulty measurement
- maze validation
- debugging
- analytics

---

# 14. Player Movement Model

## Logical movement

Players move one grid cell at a time.

Allowed directions:

```text
UP
DOWN
LEFT
RIGHT
```

No diagonal movement.

Logical positions must always be integers.

Example:

```text
(4, 7)
    ↓ RIGHT
(5, 7)
```

## Only the active player moves

This is a core game rule.

If:

```text
activePlayer = A
```

then:

```text
A → can move
B → cannot move
```

B remains completely stationary.

When A reaches B:

```text
bombHolder = B
activePlayer = B
```

Now A is stationary and B can move.

This is intentional.

Do not implement simultaneous movement.

---

# 15. Input Handling

Frontend listens for:

- W
- A
- S
- D
- Arrow keys

Map them to:

```text
W / ArrowUp    → UP
S / ArrowDown  → DOWN
A / ArrowLeft  → LEFT
D / ArrowRight → RIGHT
```

Input should be interpreted as **movement intent**, not as a claimed position.

Send:

```json
{
  "type": "INPUT_MOVE",
  "direction": "RIGHT"
}
```

Do NOT send:

```json
{
  "type": "PLAYER_POSITION",
  "x": 999,
  "y": 999
}
```

Do NOT send:

```json
{
  "type": "I_TAGGED_OPPONENT"
}
```

The client is untrusted.

---

# 16. Movement Validation

The server validates every movement request.

Conceptually:

```python
validate_move(game, player_id, direction)
```

Pipeline:

```text
INPUT_MOVE
    ↓
Is game in PLAYING phase?
    ↓
Is sender the active player?
    ↓
Calculate target cell
    ↓
Is target inside bounds?
    ↓
Is target traversable?
    ↓
Move player
    ↓
Did player reach opponent?
    ↓
If yes → transfer bomb
```

The server must be the source of truth.

---

# 17. Collision With Walls

Given:

```text
current = (x, y)
direction = (dx, dy)
```

calculate:

```text
target = (x + dx, y + dy)
```

Then:

### Boundary check

```text
0 <= target.x < width
0 <= target.y < height
```

### Wall check

```text
grid[target.y][target.x] is traversable
```

If either fails:

```text
reject movement
```

Do not move the player.

No error needs to be sent for every invalid keypress unless useful for debugging.

---

# 18. Player-to-Player Collision

Because only one player moves, collision is extremely simple.

After every valid movement:

```python
if active_player.position == opponent.position:
    transfer_bomb()
```

Do NOT rely on the client to detect the collision.

The server detects it.

This prevents cheating and keeps both clients synchronized.

---

# 19. Visual Movement

Logical movement should remain discrete.

Visual movement can be smooth.

Example:

```text
logical:
(4, 7) → (5, 7)

visual:
CSS transition from cell 4 to cell 5
```

Use CSS transitions or transform interpolation.

The important separation is:

```text
GAME LOGIC
integer coordinates

        ↓

VISUAL LAYER
smooth animation
```

Do not introduce floating-point player positions into the authoritative game state.

---

# 20. Rendering

## Recommended MVP renderer

Use:

**React + CSS Grid + DOM elements**

The board can be:

```text
<div class="game-board">
    <div class="tile wall" />
    <div class="tile floor" />
    ...
</div>
```

The players and bomb should be rendered as overlays rather than becoming maze tiles.

Conceptually:

```text
GameBoard
├── MazeTiles
├── PlayerA
├── PlayerB
└── BombIndicator
```

The maze is the grid.

The characters are positioned above it.

## Why not Canvas?

Canvas is unnecessary for the MVP because:

- maze is small
- tiles are static between state changes
- only one player moves at a time
- there is no physics
- there are no hundreds of moving objects
- CSS transitions are sufficient for movement

## Fallback

If DOM/CSS rendering becomes difficult because of a specific visual requirement, evaluate Canvas.

Do not switch renderers merely because Canvas is common in browser games.

---

# 21. Game Loop

There are two different concepts here.

## Movement loop

There is no continuous movement loop.

Movement is event-driven:

```text
keypress
   ↓
INPUT_MOVE
   ↓
server validates
   ↓
state changes
   ↓
broadcast
   ↓
React renders
```

## Bomb timing

The bomb timer must be server-authoritative.

Prefer storing:

```python
bomb_expires_at = timestamp
```

rather than relying on a client-controlled countdown.

The frontend can render the remaining time locally using the server-provided expiration timestamp.

The server decides whether the bomb actually expired.

## Do not build a 20 Hz simulation unless required

The earlier research proposed a 20 Hz server tick. That is unnecessary for the MVP because movement is discrete.

Use event-driven movement and authoritative timestamps for the bomb.

If a later feature requires continuous server simulation, reassess.

---

# 22. Bomb Mechanics

## Initial bomb

At round start:

```text
Player A = bomb holder
Player B = stationary
```

The first active player may alternate by round if desired, but this is optional.

## Bomb timer

The server creates:

```python
bomb_expires_at
```

The client displays:

```text
remaining = bomb_expires_at - current_time
```

The client timer is visual only.

The server determines the actual result.

## Explosion

If the server determines:

```text
current_time >= bomb_expires_at
```

while in PLAYING:

```text
ROUND_OVER
```

Award the point to the player who did not hold the bomb.

---

# 23. Bomb Transfer

When the active player reaches the stationary player:

```text
A reaches B
      ↓
B receives bomb
      ↓
A becomes stationary
      ↓
B becomes active
```

Do not instantly start movement on the same input.

Use a short transition:

```text
PLAYING
   ↓
BOMB_TRANSFER
   ↓
short animation (~500–750ms)
   ↓
generate new maze
   ↓
reset positions
   ↓
COUNTDOWN
   ↓
PLAYING
```

---

# 24. New Maze After Every Successful Transfer

This is a core gameplay rule.

Do NOT keep the same maze after a successful transfer.

The intended rhythm is:

```text
A attacks
   ↓
A passes bomb
   ↓
new maze
   ↓
B attacks
   ↓
B passes bomb
   ↓
new maze
   ↓
A attacks
```

This prevents repetitive back-and-forth tagging inside the same corridor.

It also makes every turn feel like a fresh puzzle.

---

# 25. Round vs Turn

Be careful with terminology.

A **turn** is one player's attempt to pass the bomb.

A **round** can contain many turns.

Example:

```text
Round 1

Turn 1 → A gets bomb
Turn 2 → B gets bomb
Turn 3 → A gets bomb
Turn 4 → B gets bomb
...
Bomb explodes
```

The bomb explosion ends the round.

The successful transfer only ends the current turn.

This distinction should be reflected in the code.

---

# 26. Match Structure

Recommended MVP:

```text
First to 3 round wins
```

Example:

```text
A: 3
B: 1

A wins match
```

Make the winning score configurable.

```python
WINNING_SCORE = 3
```

Do not hard-code it across the codebase.

---

# 27. Finite State Machine

Use explicit game phases.

```text
WAITING
   ↓
COUNTDOWN
   ↓
PLAYING
   ↓
BOMB_TRANSFER
   ↓
COUNTDOWN
   ↓
PLAYING
   ↓
...
   ↓
ROUND_OVER
   ↓
COUNTDOWN
   ↓
...
   ↓
MATCH_OVER
```

## WAITING

Waiting for two players.

No movement.

## COUNTDOWN

Maze is ready.

Players are positioned.

Display:

```text
3
2
1
GO!
```

Movement disabled.

## PLAYING

Only the bomb holder can move.

Bomb timer active.

## BOMB_TRANSFER

Short freeze/animation.

No movement.

Prepare next turn and maze.

## ROUND_OVER

Explosion and score presentation.

No movement.

## MATCH_OVER

Show winner.

No movement.

---

# 28. WebSocket Architecture

Use one WebSocket connection per player.

The server owns the game room.

## Client → Server

Minimal messages:

```text
JOIN_ROOM
READY
INPUT_MOVE
```

Potential future:

```text
REMATCH
LEAVE_ROOM
```

## Server → Client

Minimal messages:

```text
ROOM_STATE
ROUND_START
STATE_UPDATE
BOMB_TRANSFER
ROUND_OVER
MATCH_OVER
ERROR
```

The exact protocol can be simplified further during implementation.

---

# 29. WebSocket Movement Flow

Example:

```text
Player A
   │
   │ INPUT_MOVE RIGHT
   ▼
FastAPI
   │
   ├── Is A active?
   ├── Is game PLAYING?
   ├── Is RIGHT valid?
   ├── Update A position
   └── Did A reach B?
             │
        ┌────┴────┐
        NO        YES
        │           │
        ▼           ▼
 STATE_UPDATE   BOMB_TRANSFER
```

Never trust client claims about:

- position
- collision
- bomb ownership
- score
- timer expiration
- round result

---

# 30. State Synchronization

The server should broadcast authoritative state after meaningful state changes.

For example:

```json
{
  "type": "STATE_UPDATE",
  "payload": {
    "playerA": {"x": 4, "y": 7},
    "playerB": {"x": 19, "y": 19},
    "activePlayerId": "playerA",
    "bombHolderId": "playerA",
    "bombExpiresAt": 1780000000000
  }
}
```

Do not continuously broadcast the full maze on every movement.

The maze only changes when a new turn begins.

---

# 31. Maze Transmission

Send the maze:

- when a round/turn begins
- whenever a new maze is generated

Do not resend it for every movement.

Conceptually:

```text
NEW_MAZE
{
  maze: [...]
  playerA: spawn
  playerB: spawn
  activePlayer: ...
  bombExpiresAt: ...
}
```

---

# 32. Frontend State

React should hold the current server snapshot.

Suggested separation:

```text
Game state
    ↓
useGameState()

WebSocket
    ↓
useWebSocket()

Keyboard
    ↓
useInput()
```

Avoid putting WebSocket logic directly into every component.

---

# 33. Suggested Frontend Structure

```text
frontend/
└── src/
    ├── components/
    │   ├── GameBoard.tsx
    │   ├── MazeTile.tsx
    │   ├── Player.tsx
    │   ├── Bomb.tsx
    │   ├── GameHUD.tsx
    │   ├── Countdown.tsx
    │   ├── RoundResult.tsx
    │   └── Lobby.tsx
    │
    ├── hooks/
    │   ├── useWebSocket.ts
    │   ├── useKeyboardInput.ts
    │   └── useGameState.ts
    │
    ├── types/
    │   └── game.ts
    │
    ├── game/
    │   └── rendering.ts
    │
    ├── App.tsx
    └── main.tsx
```

Do not create files simply to satisfy this structure. Keep the project small.

---

# 34. Suggested Backend Structure

```text
backend/
├── main.py
├── requirements.txt
│
└── game/
    ├── models.py
    ├── room.py
    ├── engine.py
    ├── maze.py
    ├── validation.py
    └── websocket.py
```

Responsibilities:

### maze.py

- maze generation
- DFS
- braiding
- BFS
- maze validation

### validation.py

- movement validation
- bounds checks
- collision checks

### models.py

- game state
- player state
- positions
- enums

### engine.py

- game lifecycle
- turn transitions
- bomb
- scoring

### room.py

- room/player management

### websocket.py

- message handling
- WebSocket communication

---

# 35. Implementation Order

Do NOT start with multiplayer.

Build the smallest possible vertical slice first.

## Phase 1 — Maze

Implement:

1. Grid representation
2. DFS maze generation
3. Fixed spawn points
4. BFS validation
5. Braiding

Output:

```text
A valid maze with A and B connected.
```

## Phase 2 — Local movement

Implement:

1. Render maze
2. Render A and B
3. Keyboard input
4. Move one cell at a time
5. Wall collision

At this stage:

**A is the only controllable player.**

## Phase 3 — Local game loop

Implement:

1. Bomb ownership
2. Active player
3. Bomb timer
4. A reaches B
5. Transfer
6. New maze
7. B becomes active
8. B reaches A

At this point the game should already be playable by two people taking turns manually on one machine.

## Phase 4 — WebSocket multiplayer

Implement:

1. WebSocket connection
2. Room
3. Two players
4. Input messages
5. Server movement validation
6. State broadcast
7. Synchronization

## Phase 5 — Match system

Implement:

1. Round score
2. Explosion
3. Round reset
4. Match win condition
5. Rematch

## Phase 6 — Visual polish

Only after the game works:

- character art
- bomb art
- animations
- sound
- screen shake
- countdown
- transitions
- particles
- typography
- responsive layout

---

# 36. Critical Fallbacks

The coding agent must prioritize shipping over architectural perfection.

## Fallback 1 — CSS movement is difficult

If smooth CSS positioning becomes problematic:

Use instant cell movement first.

Do not block core gameplay on animation.

Add interpolation later.

## Fallback 2 — WebSocket synchronization becomes difficult

First implement the entire game locally.

Then add a single WebSocket room.

Do not attempt sophisticated client prediction.

## Fallback 3 — Maze generation produces bad layouts

Reduce complexity:

```text
DFS
+
BFS validation
```

Temporarily remove braiding.

Get the game working first.

Then re-enable braiding.

## Fallback 4 — Braiding makes gameplay worse

Set:

```text
BRAID_PROBABILITY = 0
```

and playtest.

Maze generation is a gameplay parameter, not an architectural requirement.

## Fallback 5 — React DOM rendering becomes slow

For MVP:

- reduce maze size
- reduce visual effects
- keep players as overlays

Only then consider Canvas.

## Fallback 6 — Backend timer causes complexity

Use an expiration timestamp rather than a continuously decremented timer.

The server checks expiration when handling events and via a lightweight timer task if necessary.

## Fallback 7 — Multiplayer is not ready near submission

The game must remain playable locally.

Structure game logic so the same engine can accept local inputs first and WebSocket inputs later.

---

# 37. Important Engineering Rule: Separate Game Logic From Rendering

This is one of the most important requirements.

Do not put rules inside React components.

Bad:

```text
GameBoard.tsx
    ├── movement rules
    ├── collision rules
    ├── bomb rules
    └── rendering
```

Prefer:

```text
Game Engine
    ↓
Game State
    ↓
React Renderer
```

The renderer should not decide whether a move is legal.

The server/game engine decides.

---

# 38. Testing Strategy

Before visual polish, test these cases.

## Maze

- maze is generated
- all required cells are valid
- A can reach B
- BFS returns a path
- regeneration works

## Movement

- player cannot leave board
- player cannot enter wall
- player can move through floor
- diagonal movement is impossible
- inactive player cannot move

## Bomb

- correct player starts with bomb
- timer starts correctly
- timer expires
- correct player loses
- transfer changes bomb holder

## Turn

- A can move when active
- B cannot move when A is active
- after transfer, B can move
- A becomes stationary
- new maze is generated
- positions reset to opposite corners

## Multiplayer

- both clients receive same maze
- both clients see same positions
- invalid moves are rejected
- clients cannot claim a collision
- clients cannot change bomb ownership
- disconnect does not crash the server

---

# 39. Gameplay Tuning Parameters

Keep gameplay values configurable.

Example:

```python
MAZE_WIDTH = 15
MAZE_HEIGHT = 15

BRAID_PROBABILITY = 0.40

BOMB_DURATION_SECONDS = 20

TRANSFER_FREEZE_MS = 750

COUNTDOWN_SECONDS = 3

WINNING_SCORE = 3
```

Do not scatter these numbers throughout the code.

This will make playtesting much faster.

---

# 40. Future Features — Do Not Implement Yet

Potential extensions:

- speed boost
- temporary freeze
- teleport
- one-way doors
- risky shortcuts
- changing maze sections
- multiple bomb types
- special tiles
- sound-based tension
- shrinking timer
- fake power-ups

The base architecture should allow future additions without requiring a rewrite.

However:

**Do not implement future features until the core loop is fun.**

---

# 41. Design Principle: Rewarding the Active Turn

The game should not feel like:

> "Walk through a maze until you eventually reach the other guy."

The active player's turn should involve decisions.

Potential future mechanics should support:

- risk/reward shortcuts
- temporary information
- movement advantages
- dangerous but faster paths
- optional pickups

But the first playable version should remain:

```text
navigate
→ reach opponent
→ transfer
→ new maze
```

Do not add mechanics merely to make the feature list longer.

---

# 42. Visual Direction

The artist should have meaningful ownership of the visual layer.

The game should feel like a quirky physical toy rather than a generic cyberpunk multiplayer game.

Important visual states:

### Idle

Character waits in corner.

### Active

Character clearly indicates:

> "YOUR TURN"

### Bomb

Bomb should visibly communicate urgency.

### Low timer

Visual intensity increases as the timer approaches zero.

Example progression:

```text
20s → calm
10s → nervous
5s  → frantic
2s  → panic
0s  → explosion
```

### Transfer

Make successful bomb transfers feel rewarding.

Possible effects:

- brief freeze
- screen shake
- sound
- bomb handoff animation
- character reaction
- new maze transition

The visual layer is where the artist can make the game memorable.

---

# 43. Technical Decision Summary

The implementation should follow these decisions unless a concrete blocker appears.

### Board

Simple `grid[y][x]` matrix.

### Maze

Randomized DFS / Recursive Backtracking.

### Maze variety

Optional configurable braiding.

### Maze validation

BFS.

### Spawn positions

Fixed opposite corners.

### Movement

Discrete integer grid movement.

### Active player

Only bomb holder can move.

### Collision

Server-side cell equality.

### Rendering

React + CSS Grid + DOM.

### Character animation

CSS transition / transform.

### Multiplayer

FastAPI WebSockets.

### Authority

Server authoritative.

### Client input

Movement intent only.

### Bomb timer

Server-authoritative expiration timestamp.

### Game loop

Event-driven movement; no continuous 20 Hz simulation required for MVP.

### Turn transition

Bomb transfer → short freeze → new maze → reset positions → new active player.

### Round transition

Bomb explosion → score → round result → next round.

---

# 44. Final Acceptance Criteria

The MVP is considered technically complete when:

1. Two browser clients can join the same room.
2. Both see the same generated maze.
3. Player A starts in the top-left.
4. Player B starts in the bottom-right.
5. Only the bomb holder can move.
6. Movement is grid-based.
7. Walls block movement.
8. The server validates movement.
9. The bomb has a server-authoritative timer.
10. The active player can reach the opponent.
11. Reaching the opponent transfers the bomb.
12. A short transfer state occurs.
13. A new maze is generated.
14. Players return to fixed opposite corners.
15. The new bomb holder becomes the active player.
16. The cycle repeats.
17. Bomb expiration ends the round.
18. Score is tracked.
19. A match winner can be determined.
20. The game can be restarted/rematched.
21. The game remains playable without visual polish.
22. No core gameplay rule depends on client trust.

---

# 45. Agent Instructions

When implementing this project:

1. **Read this PRD completely before coding.**
2. Inspect the existing repository before creating files.
3. Do not introduce a game engine unless a concrete blocker requires it.
4. Do not over-engineer the architecture.
5. Implement one vertical slice at a time.
6. Keep game logic separate from rendering.
7. Keep the server authoritative.
8. Do not trust client-provided positions or outcomes.
9. Prefer simple readable data structures over clever optimizations.
10. Make gameplay constants configurable.
11. Test each phase before moving to the next.
12. Do not add future mechanics before the base loop works.
13. If a proposed architecture conflicts with this PRD, explain the tradeoff before changing it.
14. If something is uncertain, choose the simplest implementation consistent with the game rules.
15. The priority order is:

```text
FUN CORE LOOP
    ↓
CORRECTNESS
    ↓
MULTIPLAYER RELIABILITY
    ↓
VISUAL POLISH
    ↓
OPTIONAL FEATURES
```

The final product should feel like a **small, polished, quirky browser game**, not like an over-engineered software project.
