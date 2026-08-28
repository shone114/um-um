import React, { useCallback, useEffect, useRef, useState } from 'react';
import './index.css';

const DEFAULT_TILE_SIZE = 34;
const WS_URL = 'wss://um-um-production.up.railway.app/ws';
const INITIAL_DELAY = 140;
const REPEAT_DELAY = 105;

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

  // ──────────────────────────────────────────────────────────────
  // RESIZE
  // ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => {
      const avH = window.innerHeight - 280;
      const avW = window.innerWidth - 40;
      setTileSize(Math.max(16, Math.min(70, Math.floor(Math.min(avH, avW) / 15))));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      <div id="game-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', gap: 24, textAlign: 'center' }}>
        <div className="ambient-background"><div className="glow-orb orb-a" /><div className="glow-orb orb-b" /></div>
        <h1 className="glitch-text">HOT POTATO</h1>
        <p className="subtitle">Only the Bomb Holder can move. Tag to survive.</p>
        <div className="glass-panel" style={{ padding: 24, display: 'flex', gap: 12, marginTop: 40 }}>
          <button onClick={createRoom} style={{ padding: '12px 24px', background: 'var(--player-a)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 900 }}>CREATE ROOM</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="ROOM CODE" value={joinCodeInp} onChange={e => setJoinCodeInp(e.target.value.toUpperCase())} maxLength={5}
              style={{ padding: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--panel-border)', color: '#fff', borderRadius: 8, width: 120, textTransform: 'uppercase' }} />
            <button onClick={joinRoom} style={{ padding: '12px 24px', background: 'var(--player-b)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 900, color: '#fff' }}>JOIN</button>
          </div>
        </div>
      </div>
    );
  }

  const isPlaying = gameState.phase === 'PLAYING';
  const remainingBomb = Math.max(0, gameState.bomb_deadline_ms - tick);
  const remainingCount = Math.max(0, gameState.countdown_deadline_ms - tick);
  const currentDuration = (gameState.timer_duration_s || 20) * 1000;
  const pct = gameState.phase === 'WAITING' ? 100 : (remainingBomb / currentDuration) * 100;

  // Use client-predicted positions for the active player, server positions for the opponent
  const displayA = (mySlotDisplay === 'A' && localPos) ? localPos.a : gameState.player_a;
  const displayB = (mySlotDisplay === 'B' && localPos) ? localPos.b : gameState.player_b;

  const hudConfig = (() => {
    switch (gameState.phase) {
      case 'WAITING': return { text: `ROOM: ${gameState.room_code} — WAITING P2`, color: '#777', bg: 'rgba(0,0,0,0.5)', timerDisplay: 'WAITING' };
      case 'COUNTDOWN': return { text: 'PREPARE', color: '#FFD700', bg: 'rgba(255,215,0,0.15)', timerDisplay: (remainingCount / 1000).toFixed(1) + 's' };
      case 'PLAYING': return { text: 'RUN!', color: '#00FF7F', bg: 'rgba(0,255,127,0.15)', timerDisplay: (remainingBomb / 1000).toFixed(1) + 's' };
      case 'ROUND_OVER': return { text: 'ELIMINATED', color: '#FF0055', bg: 'rgba(255,0,85,0.15)', timerDisplay: '0.0s' };
      default: return { text: gameState.phase, color: '#fff', bg: '#000', timerDisplay: '' };
    }
  })();

  const dangerTimer = isPlaying && remainingBomb <= 5000;

  return (
    <>
      <div className="ambient-background"><div className="glow-orb orb-a" /><div className="glow-orb orb-b" /></div>
      <div id="game-container" style={{ '--tile-size': `${tileSize}px` } as React.CSSProperties}>
        <header>
          <h1 className="glitch-text">HOT POTATO</h1>
          <p className="subtitle">Only the Bomb Holder can move. Tag to survive.</p>
        </header>

        <div id="hud" className="glass-panel">
          <div className={`score-card player-a-theme ${gameState.active_player === 'A' ? 'active-card' : ''}`}>
            <div className="controls-label">PLAYER 1</div>
            <div className="player-name">{mySlotDisplay === 'A' ? 'YOU (WASD)' : 'PLAYER 1'}</div>
            <div className="score-val">{gameState.score_a}</div>
          </div>

          <div className="center-hud">
            <div id="phase-badge" style={{ color: hudConfig.color, background: hudConfig.bg }}>{hudConfig.text}</div>
            <div id="timer-display" style={{ color: dangerTimer ? '#FF0055' : (gameState.phase === 'COUNTDOWN' || gameState.phase === 'ROUND_OVER' ? 'inherit' : 'var(--bomb-color)') }}>
              {hudConfig.timerDisplay}
            </div>
            <div className="progress-track" style={{ opacity: gameState.phase === 'WAITING' ? 0.3 : 1 }}>
              <div id="timer-bar" style={{
                width: gameState.phase === 'COUNTDOWN' ? '100%' : gameState.phase === 'ROUND_OVER' ? '0%' : `${pct}%`,
                background: dangerTimer ? '#FF0055' : (gameState.phase === 'COUNTDOWN' ? 'var(--text-muted)' : 'var(--bomb-color)'),
                boxShadow: dangerTimer ? '0 0 15px #FF0055' : (gameState.phase === 'COUNTDOWN' ? 'none' : '0 0 10px var(--bomb-color)')
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
          <div className="board-wrapper glass-panel">
            <div id="game-board">
              {gameState.maze.map((row: number[], y: number) =>
                row.map((cell: number, x: number) => (
                  <div key={`${x}-${y}`} className={cell === 1 ? 'tile-wall' : 'tile-floor'} style={{ gridColumn: x + 1, gridRow: y + 1 }} />
                ))
              )}

              <div id="player-a"
                className={`player ${gameState.bomb_holder === 'A' ? 'bomb' : ''} ${gameState.active_player === 'A' && isPlaying ? 'active' : ''}`}
                style={{ transform: `translate(${displayA.x * tileSize}px, ${displayA.y * tileSize}px)`, transition: isPlaying ? 'transform 0.07s linear' : 'none' }}>
                A
              </div>

              <div id="player-b"
                className={`player ${gameState.bomb_holder === 'B' ? 'bomb' : ''} ${gameState.active_player === 'B' && isPlaying ? 'active' : ''}`}
                style={{ transform: `translate(${displayB.x * tileSize}px, ${displayB.y * tileSize}px)`, transition: isPlaying ? 'transform 0.07s linear' : 'none' }}>
                B
              </div>
            </div>

            <div id="game-overlay" className={gameState.phase === 'ROUND_OVER' ? '' : 'hidden'}>
              <h2 id="overlay-title">BOOM!</h2>
              <p id="overlay-subtitle">
                <span style={{ color: gameState.bomb_holder === 'A' ? 'var(--player-a)' : 'var(--player-b)' }}>
                  {gameState.bomb_holder === 'A' ? 'PLAYER 1' : 'PLAYER 2'}
                </span> was eliminated this round.
              </p>
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
