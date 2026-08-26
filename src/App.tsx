import { useEffect, useRef, useState } from 'react';
import { GameEngine, TIMER_SEQUENCE } from './logic/GameEngine';
import './index.css';

const TILE_SIZE = 34;

export default function App() {
  const engineRef = useRef(new GameEngine());
  const [, setTick] = useState<number>(0);
  const [debugMode, setDebugMode] = useState(false);
  useEffect(() => {
    let handle: number;
    const loop = () => {
      engineRef.current.update(Date.now());
      setTick(Date.now());
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
      const key = e.key.toLowerCase();
      const eng = engineRef.current;
      
      if (key === 'w') eng.handleInput('A', 0, -1);
      else if (key === 's') eng.handleInput('A', 0, 1);
      else if (key === 'a') eng.handleInput('A', -1, 0);
      else if (key === 'd') eng.handleInput('A', 1, 0);
      
      else if (e.key === 'ArrowUp') eng.handleInput('B', 0, -1);
      else if (e.key === 'ArrowDown') eng.handleInput('B', 0, 1);
      else if (e.key === 'ArrowLeft') eng.handleInput('B', -1, 0);
      else if (e.key === 'ArrowRight') eng.handleInput('B', 1, 0);
      else if (e.key === '`') setDebugMode(d => !d);
      else if (key === 'b') eng.triggerBenchmark();
      else if (key === 'x') {
        const data = eng.sessionLog.map(x => JSON.stringify(x)).join('\n');
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hot-potato-telemetry-${eng.sessionId}.jsonl`;
        a.click();
        URL.revokeObjectURL(url);
      }
      else if (key === 's') {
        eng.printSessionSummary();
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const eng = engineRef.current;
  const isPlaying = eng.phase === 'PLAYING';
  const remainingRemaining = Math.max(0, eng.bombExpiresAt - Date.now());
  const currentDuration = TIMER_SEQUENCE[eng.timerIndex] * 1000;
  const pct = (remainingRemaining / currentDuration) * 100;
  
  const elapsedPlayMs = isPlaying ? Date.now() - eng.turnStartMs : 0;
  const currentLiveRate = elapsedPlayMs > 0 ? (eng.currentTurnValidMoves / (elapsedPlayMs / 1000)).toFixed(1) : "0.0";

  const getPhaseStyles = () => {
    switch (eng.phase) {
      case 'COUNTDOWN': return { text: "PREPARE", color: "#FFD700", bg: "rgba(255,215,0,0.15)", timerDisplay: "WAIT" };
      case 'PLAYING': return { text: "RUN!", color: "#00FF7F", bg: "rgba(0,255,127,0.15)", timerDisplay: (remainingRemaining / 1000).toFixed(1) + "s" };
      case 'ROUND_OVER': return { text: "ELIMINATED", color: "#FF0055", bg: "rgba(255,0,85,0.15)", timerDisplay: "0.0s" };
    }
  };

  const hudConfig = getPhaseStyles() || getPhaseStyles(); // Safe fallback
  const dangerTimer = eng.phase === 'PLAYING' && remainingRemaining <= 5000;
  
  const prevPosARef = useRef(eng.playerA);
  const prevPosBRef = useRef(eng.playerB);
  
  const distA = Math.abs(eng.playerA.x - prevPosARef.current.x) + Math.abs(eng.playerA.y - prevPosARef.current.y);
  const distB = Math.abs(eng.playerB.x - prevPosBRef.current.x) + Math.abs(eng.playerB.y - prevPosBRef.current.y);
  
  prevPosARef.current = { ...eng.playerA };
  prevPosBRef.current = { ...eng.playerB };

  const transitionStyleA = (!isPlaying || distA > 1) ? 'none' : 'transform 0.12s cubic-bezier(0.2, 0.8, 0.2, 1)';
  const transitionStyleB = (!isPlaying || distB > 1) ? 'none' : 'transform 0.12s cubic-bezier(0.2, 0.8, 0.2, 1)';

  return (
    <>
      <div className="ambient-background">
        <div className="glow-orb orb-a"></div>
        <div className="glow-orb orb-b"></div>
      </div>

      <div id="game-container">
        <header>
          <h1 className="glitch-text">HOT POTATO</h1>
          <p className="subtitle">Only the Bomb Holder can move. Tag to survive.</p>
        </header>

        <div id="hud" className="glass-panel">
          <div className={`score-card player-a-theme ${eng.activePlayer === 'A' ? 'active-card' : ''}`}>
            <div className="controls-label">WASD</div>
            <div className="player-name">PLAYER 1</div>
            <div className="score-val">{eng.scoreA}</div>
          </div>

          <div className="center-hud">
            <div id="phase-badge" style={{ color: hudConfig.color, background: hudConfig.bg }}>
              {hudConfig.text}
            </div>
            <div id="timer-display" style={{ color: dangerTimer ? '#FF0055' : (eng.phase === 'COUNTDOWN' || eng.phase === 'ROUND_OVER' ? 'inherit' : 'var(--bomb-color)') }}>
              {hudConfig.timerDisplay}
            </div>
            <div className="progress-track">
              <div id="timer-bar" style={{ 
                width: eng.phase === 'COUNTDOWN' ? '100%' : eng.phase === 'ROUND_OVER' ? '0%' : `${pct}%`,
                background: dangerTimer ? '#FF0055' : (eng.phase === 'COUNTDOWN' ? 'var(--text-muted)' : 'var(--bomb-color)'),
                boxShadow: dangerTimer ? '0 0 15px #FF0055' : (eng.phase === 'COUNTDOWN' ? 'none' : '0 0 10px var(--bomb-color)')
              }}></div>
            </div>
          </div>

          <div className={`score-card player-b-theme text-right ${eng.activePlayer === 'B' ? 'active-card' : ''}`}>
            <div className="controls-label">ARROWS</div>
            <div className="player-name">PLAYER 2</div>
            <div className="score-val">{eng.scoreB}</div>
          </div>
        </div>

        <div className="board-wrapper glass-panel">
          <div id="game-board">
            {eng.maze.map((row, y) => 
               row.map((cell, x) => (
                 <div key={`${x}-${y}`} className={cell === 1 ? "tile-wall" : "tile-floor"} style={{ gridColumn: x + 1, gridRow: y + 1 }} />
               ))
            )}
            
            {/* Player A */}
            <div id="player-a" 
                 className={`player ${eng.bombHolder === 'A' ? 'bomb' : ''} ${eng.activePlayer === 'A' && isPlaying ? 'active' : ''}`}
                 style={{ transform: `translate(${eng.playerA.x * TILE_SIZE}px, ${eng.playerA.y * TILE_SIZE}px)`, transition: transitionStyleA }}>
              A
            </div>
            
            {/* Player B */}
            <div id="player-b" 
                 className={`player ${eng.bombHolder === 'B' ? 'bomb' : ''} ${eng.activePlayer === 'B' && isPlaying ? 'active' : ''}`}
                 style={{ transform: `translate(${eng.playerB.x * TILE_SIZE}px, ${eng.playerB.y * TILE_SIZE}px)`, transition: transitionStyleB }}>
              B
            </div>
          </div>
          
          <div id="game-overlay" className={eng.phase === 'ROUND_OVER' ? '' : 'hidden'}>
            <h2 id="overlay-title">BOOM!</h2>
            <p id="overlay-subtitle">
              <span style={{ color: eng.bombHolder === 'A' ? 'var(--player-a)' : 'var(--player-b)' }}>
                {eng.bombHolder === 'A' ? 'PLAYER 1' : 'PLAYER 2'}
              </span> was eliminated this round.
            </p>
          </div>
          
          {debugMode && (
            <div style={{ position: 'absolute', top: 50, left: -280, height: '550px', width: '270px', background: 'rgba(0,0,0,0.85)', padding: '16px', borderRadius: '12px', border: '1px solid #444', color: '#0f0', overflowY: 'auto', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: 12, borderBottom: '1px solid #444', paddingBottom: 8 }}>
                <strong>[CMD] 'B' benchmark | 'X' export</strong><br/>
                CYCLE: {eng.cycleNumber} | TURN: {eng.turnNumber}<br/>
                TIMER PHASE: {TIMER_SEQUENCE[eng.timerIndex]}s<br/><br/>
                <strong>--- GENERATOR ---</strong><br/>
                TARGET: {eng.currentGenStats?.targetMin}-{eng.currentGenStats?.targetMax} (Strat {eng.currentGenStats?.strategy})<br/>
                WALLS REMOVED: {eng.currentGenStats?.wallsRemoved}<br/>
                BFS LOOPS: {eng.currentGenStats?.bfsCalls} | {eng.currentGenStats?.timeMs.toFixed(1)}ms<br/><br/>
                <strong>--- CURRENT RUN ---</strong><br/>
                OPTIMAL PATH: {eng.currentMetrics?.pathLength || 0} moves<br/>
                OPTIMAL TURNS: {eng.currentMetrics?.turns || 0}<br/>
                ACTUAL MOVES: {eng.currentTurnValidMoves} ({currentLiveRate} m/s)
              </div>
              <div style={{ opacity: 0.8 }}>
                <strong>--- SESSION LOG ---</strong>
                {eng.sessionLog.slice(0, 8).map((log, i) => (
                  <div key={i} style={{ borderBottom: '1px dashed #333', marginTop: '4px', paddingBottom: '4px', fontSize: '0.8rem' }}>
                    [C{log.cycle_number} T{log.turn_number}] {log.active_player} Obj: {log.optimal_path_length} | Act: {log.actual_moves} <br/>
                    {log.result} in {(log.elapsed_time_ms / 1000).toFixed(1)}s ({log.actual_moves_per_second.toFixed(1)} m/s)<br/>
                    <em style={{color: '#888'}}>[{log.timer_stage}s] W:{log.walls_opened} BFS:{log.bfs_evaluation_count} t:{log.generation_time_ms.toFixed(0)}</em>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
