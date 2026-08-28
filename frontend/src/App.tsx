import React, { useEffect, useRef, useState } from 'react';
import './index.css';

const DEFAULT_TILE_SIZE = 34;
const WS_URL = 'wss://um-um-production.up.railway.app/ws';

function generateSessionId() {
  if (!localStorage.getItem('hot_potato_session')) {
    localStorage.setItem('hot_potato_session', crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
  }
  return localStorage.getItem('hot_potato_session')!;
}

export default function App() {
  const [session_id] = useState(generateSessionId());
  const ws = useRef<WebSocket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [mySlot, setMySlot] = useState<'A' | 'B' | null>(null);
  const [joinCodeInp, setJoinCodeInp] = useState('');

  const [tileSize, setTileSize] = useState(DEFAULT_TILE_SIZE);
  const keysDown = useRef<Set<string>>(new Set());
  const nextMoveTimeRef = useRef<number>(0);
  const INITIAL_DELAY = 140;
  const REPEAT_DELAY = 105;

  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const handleResize = () => {
      const availableHeight = window.innerHeight - 280;
      const availableWidth = window.innerWidth - 40;
      const targetSize = Math.max(16, Math.min(70, Math.floor(Math.min(availableHeight, availableWidth) / 15)));
      setTileSize(targetSize);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let reconnectTimeout: any;
    const connect = () => {
      console.log('Connecting to', WS_URL);
      const socket = new WebSocket(WS_URL);
      socket.onopen = () => {
        ws.current = socket;
        // Auto-rejoin if we already have a state
        if (gameState?.room_code) {
          socket.send(JSON.stringify({ type: 'join', session_id, room_code: gameState.room_code }));
        }
      };
      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'room_joined') {
            setMySlot(msg.payload.slot);
          } else if (msg.type === 'state_sync') {
            setGameState(msg.payload);
          } else if (msg.type === 'player_moved') {
            setGameState((prev: any) => {
              if (!prev) return prev;
              const upd = { ...prev };
              if (msg.player === 'A') upd.player_a = msg.pos;
              if (msg.player === 'B') upd.player_b = msg.pos;
              return upd;
            });
          }
        } catch (err) {
          console.error('WS Parse Error', err);
        }
      };
      socket.onclose = () => {
        ws.current = null;
        reconnectTimeout = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => { clearTimeout(reconnectTimeout); ws.current?.close(); };
  }, [session_id, gameState?.room_code]); // Added dependency to allow auto-rejoin on hot reload

  useEffect(() => {
    let handle: number;
    const loop = () => {
      setTick(Date.now());
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    let handle: number;
    const loop = () => {
      const now = Date.now();
      const keys = keysDown.current;

      if (ws.current && ws.current.readyState === WebSocket.OPEN && gameState && gameState.phase === 'PLAYING') {
        if (now >= nextMoveTimeRef.current) {
          let direction = '';
          if (mySlot === 'A') {
            if (keys.has('w')) direction = 'up';
            else if (keys.has('s')) direction = 'down';
            else if (keys.has('a')) direction = 'left';
            else if (keys.has('d')) direction = 'right';
          } else if (mySlot === 'B') {
            if (keys.has('arrowup')) direction = 'up';
            else if (keys.has('arrowdown')) direction = 'down';
            else if (keys.has('arrowleft')) direction = 'left';
            else if (keys.has('arrowright')) direction = 'right';
          }
          if (direction) {
            ws.current.send(JSON.stringify({ type: 'move', session_id, room_code: gameState.room_code, payload: { direction } }));
            nextMoveTimeRef.current = now + REPEAT_DELAY;
          }
        }
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [gameState, mySlot, session_id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      const key = e.key.toLowerCase();
      if (!keysDown.current.has(key)) {
        keysDown.current.add(key);
        let direction = '';
        if (mySlot === 'A') {
          if (key === 'w') direction = 'up';
          else if (key === 's') direction = 'down';
          else if (key === 'a') direction = 'left';
          else if (key === 'd') direction = 'right';
        } else if (mySlot === 'B') {
          if (key === 'arrowup') direction = 'up';
          else if (key === 'arrowdown') direction = 'down';
          else if (key === 'arrowleft') direction = 'left';
          else if (key === 'arrowright') direction = 'right';
        }
        if (direction && ws.current?.readyState === WebSocket.OPEN && gameState?.phase === 'PLAYING') {
          ws.current.send(JSON.stringify({ type: 'move', session_id, room_code: gameState.room_code, payload: { direction } }));
          nextMoveTimeRef.current = Date.now() + INITIAL_DELAY;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysDown.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [gameState, mySlot, session_id]);

  if (!gameState) {
    return (
      <div id="game-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100vh', gap: 24, textAlign: 'center' }}>
        <div className="ambient-background">
          <div className="glow-orb orb-a"></div>
          <div className="glow-orb orb-b"></div>
        </div>
        <h1 className="glitch-text">HOT POTATO</h1>
        <p className="subtitle">Only the Bomb Holder can move. Tag to survive.</p>
        <div className="glass-panel" style={{ padding: 24, display: 'flex', gap: 12, marginTop: 40 }}>
          <button onClick={() => ws.current?.send(JSON.stringify({ type: 'create', session_id }))} style={{ padding: '12px 24px', background: 'var(--player-a)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 900 }}>CREATE ROOM</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="text" placeholder="ROOM CODE" value={joinCodeInp} onChange={e => setJoinCodeInp(e.target.value.toUpperCase())} maxLength={5} style={{ padding: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--panel-border)', color: '#fff', borderRadius: 8, width: 120, textTransform: 'uppercase' }} />
            <button onClick={() => ws.current?.send(JSON.stringify({ type: 'join', session_id, room_code: joinCodeInp }))} style={{ padding: '12px 24px', background: 'var(--player-b)', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 900, color: '#fff' }}>JOIN</button>
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

  const getPhaseStyles = () => {
    switch (gameState.phase) {
      case 'WAITING': return { text: `ROOM: ${gameState.room_code} (WAITING FOR P2)`, color: "#777", bg: "rgba(0,0,0,0.5)", timerDisplay: "WAITING" };
      case 'COUNTDOWN': return { text: "PREPARE", color: "#FFD700", bg: "rgba(255,215,0,0.15)", timerDisplay: (remainingCount / 1000).toFixed(1) + "s" };
      case 'PLAYING': return { text: "RUN!", color: "#00FF7F", bg: "rgba(0,255,127,0.15)", timerDisplay: (remainingBomb / 1000).toFixed(1) + "s" };
      case 'ROUND_OVER': return { text: "ELIMINATED", color: "#FF0055", bg: "rgba(255,0,85,0.15)", timerDisplay: "0.0s" };
      default: return { text: gameState.phase, color: "#fff", bg: "#000", timerDisplay: "" };
    }
  };

  const hudConfig = getPhaseStyles();
  const dangerTimer = isPlaying && remainingBomb <= 5000;

  const transitionStyleA = (!isPlaying) ? 'none' : 'transform 0.09s linear';
  const transitionStyleB = (!isPlaying) ? 'none' : 'transform 0.09s linear';

  return (
    <>
      <div className="ambient-background">
        <div className="glow-orb orb-a"></div>
        <div className="glow-orb orb-b"></div>
      </div>

      <div id="game-container" style={{ '--tile-size': `${tileSize}px` } as React.CSSProperties}>
        <header>
          <h1 className="glitch-text">HOT POTATO</h1>
          <p className="subtitle">Only the Bomb Holder can move. Tag to survive.</p>
        </header>

        <div id="hud" className="glass-panel">
          <div className={`score-card player-a-theme ${gameState.active_player === 'A' ? 'active-card' : ''}`}>
            <div className="controls-label">PLAYER 1</div>
            <div className="player-name">{mySlot === 'A' ? 'YOU (WASD)' : 'PLAYER 1'}</div>
            <div className="score-val">{gameState.score_a}</div>
          </div>

          <div className="center-hud">
            <div id="phase-badge" style={{ color: hudConfig.color, background: hudConfig.bg }}>
              {hudConfig.text}
            </div>
            <div id="timer-display" style={{ color: dangerTimer ? '#FF0055' : (gameState.phase === 'COUNTDOWN' || gameState.phase === 'ROUND_OVER' ? 'inherit' : 'var(--bomb-color)') }}>
              {hudConfig.timerDisplay}
            </div>
            <div className="progress-track" style={{ opacity: gameState.phase === 'WAITING' ? 0.3 : 1 }}>
              <div id="timer-bar" style={{
                width: gameState.phase === 'COUNTDOWN' ? '100%' : gameState.phase === 'ROUND_OVER' ? '0%' : `${pct}%`,
                background: dangerTimer ? '#FF0055' : (gameState.phase === 'COUNTDOWN' ? 'var(--text-muted)' : 'var(--bomb-color)'),
                boxShadow: dangerTimer ? '0 0 15px #FF0055' : (gameState.phase === 'COUNTDOWN' ? 'none' : '0 0 10px var(--bomb-color)')
              }}></div>
            </div>
          </div>

          <div className={`score-card player-b-theme text-right ${gameState.active_player === 'B' ? 'active-card' : ''}`}>
            <div className="controls-label">PLAYER 2</div>
            <div className="player-name">{mySlot === 'B' ? 'YOU (ARROWS)' : 'PLAYER 2'}</div>
            <div className="score-val">{gameState.score_b}</div>
          </div>
        </div>

        {gameState.maze && gameState.maze.length > 0 && (
          <div className="board-wrapper glass-panel">
            <div id="game-board">
              {gameState.maze.map((row: number[], y: number) =>
                row.map((cell: number, x: number) => (
                  <div key={`${x}-${y}`} className={cell === 1 ? "tile-wall" : "tile-floor"} style={{ gridColumn: x + 1, gridRow: y + 1 }} />
                ))
              )}

              {/* Player A */}
              <div id="player-a"
                className={`player ${gameState.bomb_holder === 'A' ? 'bomb' : ''} ${gameState.active_player === 'A' && isPlaying ? 'active' : ''}`}
                style={{ transform: `translate(${gameState.player_a.x * tileSize}px, ${gameState.player_a.y * tileSize}px)`, transition: transitionStyleA }}>
                A
              </div>

              {/* Player B */}
              <div id="player-b"
                className={`player ${gameState.bomb_holder === 'B' ? 'bomb' : ''} ${gameState.active_player === 'B' && isPlaying ? 'active' : ''}`}
                style={{ transform: `translate(${gameState.player_b.x * tileSize}px, ${gameState.player_b.y * tileSize}px)`, transition: transitionStyleB }}>
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
