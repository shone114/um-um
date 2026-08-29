const WALL_IMG = '/assets/maze/wall.png';
const WALL_END_IMG = '/assets/maze/wall_end.png';
const FRAME_SIZE = 17;

function boundaryAsset(x: number, y: number) {
  const right = x === FRAME_SIZE - 1;
  const bottom = y === FRAME_SIZE - 1;

  if ((x === 0 || right) && (y === 0 || bottom)) {
    const rotation = x === 0 ? (y === 0 ? 0 : 270) : (y === 0 ? 90 : 180);
    return { src: WALL_END_IMG, transform: `rotate(${rotation}deg)` };
  }

  return {
    src: WALL_IMG,
    transform: (x === 0 || right) ? 'rotate(90deg)' : undefined,
  };
}

export default function MazeBoundary() {
  const cells = [];

  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      if (x !== 0 && x !== FRAME_SIZE - 1 && y !== 0 && y !== FRAME_SIZE - 1) continue;
      const asset = boundaryAsset(x, y);

      cells.push(
        <img
          key={`${x}-${y}`}
          className="maze-boundary-tile"
          src={asset.src}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{ gridColumn: x + 1, gridRow: y + 1, transform: asset.transform }}
        />,
      );
    }
  }

  return <div className="maze-boundary" aria-hidden="true">{cells}</div>;
}
