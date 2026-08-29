const WALL_IMG = '/assets/maze/wall.png';

export default function MazeBoundary() {
  return (
    <div className="maze-boundary" aria-hidden="true">
      <div className="maze-boundary-rail maze-boundary-top" style={{ backgroundImage: `url(${WALL_IMG})` }} />
      <div className="maze-boundary-rail maze-boundary-bottom" style={{ backgroundImage: `url(${WALL_IMG})` }} />
      <div className="maze-boundary-rail maze-boundary-left" style={{ backgroundImage: `url(${WALL_IMG})` }} />
      <div className="maze-boundary-rail maze-boundary-right" style={{ backgroundImage: `url(${WALL_IMG})` }} />
    </div>
  );
}
