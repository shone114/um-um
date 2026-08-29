import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import WallTile from './WallTile';
import MazeBoundary from './MazeBoundary';
import { createFloorVariantMap } from './logic/floorVariants';
import './index.css';

const DEFAULT_TILE_SIZE = 34;
const WS_URL = 'wss://um-um-production.up.railway.app/ws';
const INITIAL_DELAY = 140;
const REPEAT_DELAY = 105;
const EMPTY_MAZE: number[][] = [];

// sessionStorage: unique per-tab, persists across refresh within same tab
function getSessionId() {
  let id = sessionStorage.getItem('hot_potato_session');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
    sessionStorage.setItem('hot_potato_session', id);
  }
  return id;
}

const SESSION_ID = getSessionId(); // stable, never changes

export default function App() {
  const ws = useRef<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const gameContainerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);

  // Use ref for slot — doesn't trigger reconnect effects
  const mySlotRef = useRef<'A' | 'B' | null>(null);
  const [mySlotDisplay, setMySlotDisplay] = useState<'A' | 'B' | null>(null);

  const [joinCodeInp, setJoinCodeInp] = useState('');
  const [tileSize, setTileSize] = useState(DEFAULT_TILE_SIZE);
  const [tick, setTick] = useState(Date.now());

  // Client-side prediction: local player positions (moves ahead of server)
  const localPosRef = useRef<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [localPos, setLocalPos] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);

  const keysDown = useRef<Set<string>>(new Set());
  const nextMoveTimeRef = useRef<number>(0);

  // Room code ref — read by WS handlers without closing over stale state
  const roomCodeRef = useRef<string | null>(null);
  const gameStateRef = useRef<any>(null);
  gameStateRef.current = gameState;
  const maze = gameState?.maze ?? EMPTY_MAZE;
  const hasGameState = Boolean(gameState);
  const floorVariants = useMemo(
    () => maze.length ? createFloorVariantMap(maze) : [],
    [maze],
  );

  // ──────────────────────────────────────────────────────────────
  // RESIZE
  // ──────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    if (!hasGameState) return;

    const updateTileSize = () => {
      const container = gameContainerRef.current;
      const header = headerRef.current;
      const hud = hudRef.current;
      if (!container || !header || !hud) return;

      const containerStyles = window.getComputedStyle(container);
      const verticalPadding = Number.parseFloat(containerStyles.paddingTop) + Number.parseFloat(containerStyles.paddingBottom);
      const gap = Number.parseFloat(containerStyles.rowGap || containerStyles.gap) || 0;
      const availableWidth = container.clientWidth;
      const occupiedHeight = header.offsetHeight + hud.offsetHeight + (gap * 2) + verticalPadding;
      const availableHeight = window.innerHeight - occupiedHeight;
      const frameCells = 17;
      const nextSize = Math.floor(Math.min(70, availableWidth / frameCells, availableHeight / frameCells));

      setTileSize(Math.max(8, nextSize));
    };

    const observer = new ResizeObserver(updateTileSize);
    observer.observe(gameContainerRef.current!);
    observer.observe(headerRef.current!);
    observer.observe(hudRef.current!);
    window.addEventListener('resize', updateTileSize);
    updateTileSize();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateTileSize);
    };
  }, [hasGameState]);

  // ──────────────────────────────────────────────────────────────
  // TICKER (for live timer countdown)
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let h: number;
    const loop = () => { setTick(Date.now()); h = requestAnimationFrame(loop); };
    h = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(h);
  }, []);

  // ──────────────────────────────────────────────────────────────
  // WEBSOCKET — stable, never reconnects due to state changes
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let reconnectTimer: any;
    let active = true;

    function connect() {
      if (!active) return;
      const socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (!active) { socket.close(); return; }
        ws.current = socket;
        console.log('[WS] Connected');
        // Auto-rejoin on reconnect IF we already had a room
        if (roomCodeRef.current && mySlotRef.current !== null) {
          socket.send(JSON.stringify({ type: 'join', session_id: SESSION_ID, room_code: roomCodeRef.current }));
        }
      };

      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleServerMessage(msg);
        } catch (err) {
          console.error('[WS] parse error', err);
        }
      };

      socket.onclose = () => {
        ws.current = null;
        if (active) reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => socket.close();
    }

    connect();
    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      ws.current?.close();
      ws.current = null;
    };
  }, []); // ← empty deps: WS lifecycle is completely isolated from React state

  // ──────────────────────────────────────────────────────────────
  // SERVER MESSAGE HANDLER
  // ──────────────────────────────────────────────────────────────
  const handleServerMessage = useCallback((msg: any) => {
    if (msg.type === 'room_joined') {
      const slot = msg.payload.slot as 'A' | 'B';
      mySlotRef.current = slot;
      setMySlotDisplay(slot);
      roomCodeRef.current = msg.payload.room_code;
    } else if (msg.type === 'state_sync') {
      const payload = msg.payload;
      setGameState(payload);
      // On state_sync, reset local prediction to authoritative server position
      const serverPos = { a: { ...payload.player_a }, b: { ...payload.player_b } };
      localPosRef.current = serverPos;
      setLocalPos(serverPos);
    } else if (msg.type === 'player_moved') {
      // Server confirmed a move — update only the moved player's authoritative pos
      setGameState((prev: any) => {
        if (!prev) return prev;
        const upd = { ...prev };
        if (msg.player === 'A') upd.player_a = { ...msg.pos };
        else if (msg.player === 'B') upd.player_b = { ...msg.pos };
        return upd;
      });
      // Reconcile local prediction: update the OTHER player (our own moves stay predicted)
      if (msg.player !== mySlotRef.current) {
        setLocalPos(prev => {
          if (!prev) return prev;
          const upd = { ...prev };
          if (msg.player === 'A') upd.a = { ...msg.pos };
          else upd.b = { ...msg.pos };
          return upd;
        });
        if (localPosRef.current) {
          const key = msg.player === 'A' ? 'a' : 'b';
          localPosRef.current = { ...localPosRef.current, [key]: { ...msg.pos } };
        }
      }
    } else if (msg.type === 'error') {
      console.warn('[WS] server error:', msg.message);
    }
  }, []);

  // ──────────────────────────────────────────────────────────────
  // MOVE SENDER with CLIENT-SIDE PREDICTION
  // ──────────────────────────────────────────────────────────────
  const sendMove = useCallback((direction: string) => {
    const gs = gameStateRef.current;
    if (!gs || gs.phase !== 'PLAYING') return;
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    if (!roomCodeRef.current || mySlotRef.current === null) return;
    if (gs.active_player !== mySlotRef.current) return;

    // Client-side prediction: move locally NOW, before server confirms
    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    const maze = gs.maze;
    const slot = mySlotRef.current;

    if (localPosRef.current && maze?.length) {
      const curr = slot === 'A' ? { ...localPosRef.current.a } : { ...localPosRef.current.b };
      const tx = curr.x + dx;
      const ty = curr.y + dy;
      const W = maze[0].length;
      const H = maze.length;

      if (tx >= 0 && tx < W && ty >= 0 && ty < H && maze[ty][tx] === 0) {
        curr.x = tx; curr.y = ty;
        const newPos = slot === 'A'
          ? { a: curr, b: { ...localPosRef.current.b } }
          : { a: { ...localPosRef.current.a }, b: curr };
        localPosRef.current = newPos;
        setLocalPos({ ...newPos });
      }
    }

    ws.current.send(JSON.stringify({
      type: 'move',
      session_id: SESSION_ID,
      room_code: roomCodeRef.current,
      payload: { direction }
    }));
  }, []);

  // ──────────────────────────────────────────────────────────────
  // KEY INPUT — keydown (immediate first press) + held repeat
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ([' '].includes(e.key)) e.preventDefault();
      const key = e.key.toLowerCase();
      if (!keysDown.current.has(key)) {
        keysDown.current.add(key);
        // Immediate first move on press
        const dir = keyToDirection(key, mySlotRef.current);
        if (dir) { sendMove(dir); nextMoveTimeRef.current = Date.now() + INITIAL_DELAY; }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysDown.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [sendMove]);

  // Held-key repeat loop
  useEffect(() => {
    let h: number;
    const loop = () => {
      const now = Date.now();
      if (now >= nextMoveTimeRef.current) {
        const keys = keysDown.current;
        let dir = '';
        const slot = mySlotRef.current;
        if (slot === 'A' || slot === 'B') {
          if (keys.has('w')) dir = 'up';
          else if (keys.has('s')) dir = 'down';
          else if (keys.has('a')) dir = 'left';
          else if (keys.has('d')) dir = 'right';
        }
        if (dir) { sendMove(dir); nextMoveTimeRef.current = now + REPEAT_DELAY; }
      }
      h = requestAnimationFrame(loop);
    };
    h = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(h);
  }, [sendMove]);

  // ──────────────────────────────────────────────────────────────
  // ACTIONS
  // ──────────────────────────────────────────────────────────────
  const createRoom = () => ws.current?.send(JSON.stringify({ type: 'create', session_id: SESSION_ID }));
  const joinRoom = () => {
    if (!joinCodeInp.trim()) return;
    ws.current?.send(JSON.stringify({ type: 'join', session_id: SESSION_ID, room_code: joinCodeInp.toUpperCase() }));
  };

  // ──────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────
  if (!gameState) {
    return (
      <div id="game-container" className="lobby-layout">
        <div className="ambient-background"><div className="glow-orb orb-a" /><div className="glow-orb orb-b" /></div>
        <h1 className="glitch-text">MIAMI MICE</h1>
        <p className="subtitle">Guide your mouse to the cheese before time runs out.</p>
        <div className="glass-panel lobby-panel">
          <button className="room-button create-button" onClick={createRoom}>CREATE ROOM</button>
          <div className="join-controls">
            <input type="text" placeholder="ROOM CODE" value={joinCodeInp} onChange={e => setJoinCodeInp(e.target.value.toUpperCase())} maxLength={5}
              className="room-code-input" />
            <button className="room-button join-button" onClick={joinRoom}>JOIN</button>
          </div>
        </div>
      </div>
    );
  }

  const isPlaying = gameState.phase === 'PLAYING';
  const remainingTime = Math.max(0, gameState.bomb_deadline_ms - tick);
  const remainingCount = Math.max(0, gameState.countdown_deadline_ms - tick);
  const currentDuration = (gameState.timer_duration_s || 20) * 1000;
  const pct = gameState.phase === 'WAITING' ? 100 : (remainingTime / currentDuration) * 100;

  // Use client-predicted positions for the active player, server positions for the opponent
  const displayA = (mySlotDisplay === 'A' && localPos) ? localPos.a : gameState.player_a;
  const displayB = (mySlotDisplay === 'B' && localPos) ? localPos.b : gameState.player_b;

  const hudConfig = (() => {
    switch (gameState.phase) {
      case 'WAITING': return { text: `ROOM: ${gameState.room_code} — WAITING P2`, color: '#777', bg: 'rgba(0,0,0,0.5)', timerDisplay: 'WAITING' };
      case 'COUNTDOWN': return { text: 'PREPARE', color: '#FFD700', bg: 'rgba(255,215,0,0.15)', timerDisplay: (remainingCount / 1000).toFixed(1) + 's' };
      case 'PLAYING': return { text: 'FIND THE CHEESE!', color: '#00FF7F', bg: 'rgba(0,255,127,0.15)', timerDisplay: (remainingTime / 1000).toFixed(1) + 's' };
      case 'ROUND_OVER': return { text: "TIME'S UP", color: '#FF0055', bg: 'rgba(255,0,85,0.15)', timerDisplay: '0.0s' };
      default: return { text: gameState.phase, color: '#fff', bg: '#000', timerDisplay: '' };
    }
  })();

  const dangerTimer = isPlaying && remainingTime <= 5000;

  return (
    <>
      <div className="ambient-background"><div className="glow-orb orb-a" /><div className="glow-orb orb-b" /></div>
      <div ref={gameContainerRef} id="game-container" className="game-layout" style={{ '--tile-size': `${tileSize}px` } as React.CSSProperties}>
        <header ref={headerRef}>
          <h1 className="glitch-text">MIAMI MICE</h1>
          <p className="subtitle">Race through the maze and reach the cheese.</p>
        </header>

        <div ref={hudRef} id="hud" className="glass-panel">
          <div className={`score-card player-a-theme ${gameState.active_player === 'A' ? 'active-card' : ''}`}>
            <div className="controls-label">PLAYER 1</div>
            <div className="player-name">{mySlotDisplay === 'A' ? 'YOU (WASD)' : 'PLAYER 1'}</div>
            <div className="score-val">{gameState.score_a}</div>
          </div>

          <div className="center-hud">
            <div id="phase-badge" style={{ color: hudConfig.color, background: hudConfig.bg }}>{hudConfig.text}</div>
            <div id="timer-display" style={{ color: dangerTimer ? '#FF0055' : (gameState.phase === 'COUNTDOWN' || gameState.phase === 'ROUND_OVER' ? 'inherit' : 'var(--timer-color)') }}>
              {hudConfig.timerDisplay}
            </div>
            <div className="progress-track" style={{ opacity: gameState.phase === 'WAITING' ? 0.3 : 1 }}>
              <div id="timer-bar" style={{
                width: gameState.phase === 'COUNTDOWN' ? '100%' : gameState.phase === 'ROUND_OVER' ? '0%' : `${pct}%`,
                background: dangerTimer ? '#FF0055' : (gameState.phase === 'COUNTDOWN' ? 'var(--text-muted)' : 'var(--timer-color)'),
                boxShadow: dangerTimer ? '0 0 15px #FF0055' : (gameState.phase === 'COUNTDOWN' ? 'none' : '0 0 10px var(--timer-color)')
              }} />
            </div>
          </div>

          <div className={`score-card player-b-theme text-right ${gameState.active_player === 'B' ? 'active-card' : ''}`}>
            <div className="controls-label">PLAYER 2</div>
            <div className="player-name">{mySlotDisplay === 'B' ? 'YOU (WASD)' : 'PLAYER 2'}</div>
            <div className="score-val">{gameState.score_b}</div>
          </div>
        </div>

        {gameState.maze && gameState.maze.length > 0 && (
          <div className="board-wrapper">
            <div className="maze-frame">
              <MazeBoundary />
            <div id="game-board">
              {gameState.maze.map((row: number[], y: number) =>
                row.map((cell: number, x: number) => (
                  cell === 1
                    ? <WallTile key={`${x}-${y}`} x={x} y={y} maze={gameState.maze} />
                    : <div key={`${x}-${y}`} className={`tile-floor floor-variant-${floorVariants[y]?.[x] ?? 0}`} style={{ gridColumn: x + 1, gridRow: y + 1 }} />
                ))
              )}

              <div id="player-a"
                className={`player ${gameState.active_player === 'A' ? 'mouse' : 'cheese-target'}`}
                aria-label={gameState.active_player === 'A' ? 'Player 1 mouse' : 'Player 1 cheese target'}
                style={{ transform: `translate(${displayA.x * tileSize}px, ${displayA.y * tileSize}px)`, transition: isPlaying ? 'transform 0.07s linear' : 'none' }}>
                {gameState.active_player === 'A' ? 'A' : ''}
              </div>

              <div id="player-b"
                className={`player ${gameState.active_player === 'B' ? 'mouse' : 'cheese-target'}`}
                aria-label={gameState.active_player === 'B' ? 'Player 2 mouse' : 'Player 2 cheese target'}
                style={{ transform: `translate(${displayB.x * tileSize}px, ${displayB.y * tileSize}px)`, transition: isPlaying ? 'transform 0.07s linear' : 'none' }}>
                {gameState.active_player === 'B' ? 'B' : ''}
              </div>

              <div id="game-overlay" className={gameState.phase === 'ROUND_OVER' ? '' : 'hidden'}>
                <h2 id="overlay-title">CHEESE GOT AWAY!</h2>
                <p id="overlay-subtitle">
                  <span style={{ color: gameState.bomb_holder === 'A' ? 'var(--player-a)' : 'var(--player-b)' }}>
                    {gameState.bomb_holder === 'A' ? 'PLAYER 1' : 'PLAYER 2'}
                  </span> ran out of time.
                </p>
              </div>
            </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function keyToDirection(key: string, slot: 'A' | 'B' | null): string {
  if (!slot) return '';
  if (key === 'w') return 'up';
  if (key === 's') return 'down';
  if (key === 'a') return 'left';
  if (key === 'd') return 'right';
  return '';
}
