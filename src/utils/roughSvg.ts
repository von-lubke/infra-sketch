import rough from 'roughjs';
import type { Drawable, Options } from 'roughjs/bin/core';
import { EdgeGeometry, getArrowheadPoints } from './geometry';

export interface RoughPathInfo {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill: string;
  strokeLineDash?: number[];
}

const generator = rough.generator();

function drawableToPaths(drawable: Drawable, dash?: number[]): RoughPathInfo[] {
  const infos = generator.toPaths(drawable);
  return infos.map((info) => ({
    d: info.d,
    stroke: info.stroke ?? 'none',
    strokeWidth: info.strokeWidth ?? 1.5,
    fill: info.fill ?? 'none',
    strokeLineDash: dash,
  }));
}

export function buildRoundedRectPath(x: number, y: number, w: number, h: number, r = 10): string {
  const cr = Math.min(r, w / 2, h / 2);
  return [
    `M ${x + cr} ${y}`,
    `L ${x + w - cr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + cr}`,
    `L ${x + w} ${y + h - cr}`,
    `Q ${x + w} ${y + h} ${x + w - cr} ${y + h}`,
    `L ${x + cr} ${y + h}`,
    `Q ${x} ${y + h} ${x} ${y + h - cr}`,
    `L ${x} ${y + cr}`,
    `Q ${x} ${y} ${x + cr} ${y}`,
    'Z',
  ].join(' ');
}

export function generateNodeSketchPaths(
  width: number,
  height: number,
  fill: string,
  stroke: string,
  seed: number
): RoughPathInfo[] {
  const pathD = buildRoundedRectPath(0, 0, width, height, 12);
  const options: Options = {
    seed,
    roughness: 1.05,
    bowing: 0.9,
    stroke,
    strokeWidth: 1.75,
    fill,
    fillStyle: 'solid',
    disableMultiStroke: false,
  };
  const drawable = generator.path(pathD, options);
  return drawableToPaths(drawable);
}

export function generateGroupSketchPaths(
  width: number,
  height: number,
  fill: string,
  stroke: string,
  seed: number,
  dashed: boolean
): RoughPathInfo[] {
  const pathD = buildRoundedRectPath(0, 0, width, height, 14);
  const options: Options = {
    seed,
    roughness: 1.15,
    bowing: 0.85,
    stroke,
    strokeWidth: 1.65,
    fill,
    fillStyle: 'solid',
    strokeLineDash: dashed ? [8, 6] : undefined,
  };
  const drawable = generator.path(pathD, options);
  return drawableToPaths(drawable, dashed ? [8, 6] : undefined);
}

export function generateEdgeSketchPaths(
  geom: EdgeGeometry,
  stroke: string,
  seed: number,
  dashed: boolean,
  bidirectional: boolean
): RoughPathInfo[] {
  const dash = dashed ? [7, 5] : undefined;
  const lineOptions: Options = {
    seed,
    roughness: 0.95,
    bowing: 0.9,
    stroke,
    strokeWidth: 1.85,
    strokeLineDash: dash,
  };

  const mainDrawable = generator.path(geom.svgPath, lineOptions);
  const paths = drawableToPaths(mainDrawable, dash);

  const arrowOptions: Options = {
    seed: seed + 17,
    roughness: 0.8,
    bowing: 0.6,
    stroke,
    strokeWidth: 1.85,
  };

  // End arrowhead
  const [ep1, ep2] = getArrowheadPoints(geom.end, geom.endAngle, 12, 0.45);
  const endArrowPath = `M ${ep1.x} ${ep1.y} L ${geom.end.x} ${geom.end.y} L ${ep2.x} ${ep2.y}`;
  paths.push(...drawableToPaths(generator.path(endArrowPath, arrowOptions)));

  // Optional start arrowhead for bidirectional edges
  if (bidirectional) {
    const [sp1, sp2] = getArrowheadPoints(geom.start, geom.startAngle, 12, 0.45);
    const startArrowPath = `M ${sp1.x} ${sp1.y} L ${geom.start.x} ${geom.start.y} L ${sp2.x} ${sp2.y}`;
    paths.push(...drawableToPaths(generator.path(startArrowPath, { ...arrowOptions, seed: seed + 31 })));
  }

  return paths;
}
