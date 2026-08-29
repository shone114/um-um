import React from 'react';
import { resolveWallAsset, type WallAssetResult } from './logic/wallResolver';

interface WallTileProps {
  x: number;
  y: number;
  maze: number[][];
}

const WallTile: React.FC<WallTileProps> = React.memo(({ x, y, maze }) => {
  const asset: WallAssetResult = resolveWallAsset(x, y, maze);

  return (
    <div
      className="tile-wall"
      style={{
        gridColumn: x + 1,
        gridRow: y + 1,
        position: 'relative',
      }}
    >
      <img
        src={asset.src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          transform: asset.transform || undefined,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

export default WallTile;
