import { GameEngine } from './src/logic/GameEngine.ts';
const e = new GameEngine();
console.log('Phase before:', e.phase);
e.update(Date.now() + 3000); // Trigger PLAYING
console.log('Phase after:', e.phase);
console.log('Active:', e.activePlayer);
console.log('PA pos:', e.playerA);
console.log('Maze [0,1], [1,0]:', e.maze[0]?.[1], e.maze[1]?.[0]);
e.handleInput('A', 1, 0); // D
console.log('PA pos after D:', e.playerA);
e.handleInput('A', 0, 1); // S
console.log('PA pos after S:', e.playerA);
