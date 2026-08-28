import { useEffect, useRef } from 'react';
import type { GitCommit } from './types';

type Props = { commits: GitCommit[]; selectedHash: string; causalOnly: boolean; rowHeight: number; expandedHeight: number };

export function graphHeight(commits: GitCommit[], selectedHash: string, rowHeight: number, expandedHeight: number) {
  return commits.reduce((sum, commit) => sum + (commit.hash === selectedHash ? expandedHeight : rowHeight), 0);
}

function rowCenters(commits: GitCommit[], selectedHash: string, rowHeight: number, expandedHeight: number) {
  let cursor = 0;
  return commits.map((commit) => {
    const height = commit.hash === selectedHash ? expandedHeight : rowHeight;
    const center = cursor + (commit.hash === selectedHash ? 48 : height / 2);
    cursor += height;
    return center;
  });
}

export default function GraphCanvas({ commits, selectedHash, causalOnly, rowHeight, expandedHeight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const width = canvas.clientWidth; const height = graphHeight(commits, selectedHash, rowHeight, expandedHeight); const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio; context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const centers = rowCenters(commits, selectedHash, rowHeight, expandedHeight);
    const selectedIndex = commits.findIndex((commit) => commit.hash === selectedHash); const selectedY = centers[selectedIndex] || 0;
    const indexByHash = new Map(commits.map((commit, index) => [commit.hash, index]));
    const related = new Set([selectedHash]);
    const visitParents = (hash: string) => { const commit = commits.find((item) => item.hash === hash); commit?.parents.forEach((parent) => { if (!related.has(parent)) { related.add(parent); visitParents(parent) } }) };
    visitParents(selectedHash);
    commits.forEach((commit) => { if (commit.parents.some((parent) => related.has(parent))) related.add(commit.hash) });
    const laneX = (commit: GitCommit, index: number) => {
      const base = 34 + Math.min(commit.lane, 7) * 22;
      const distance = Math.abs(index - selectedIndex);
      if (selectedIndex < 0 || distance > 4) return base;
      if (distance === 0) return 112;
      if (distance === 1) return index < selectedIndex ? 42 : 182;
      if (distance === 2) return index < selectedIndex ? 54 : 168;
      if (distance === 3) return index < selectedIndex ? 66 : 148;
      return base + (index < selectedIndex ? -8 : 10);
    };

    if (selectedIndex >= 0) {
      const gradient = context.createRadialGradient(112, selectedY + 30, 4, 112, selectedY + 30, 132);
      gradient.addColorStop(0, 'rgba(73,194,255,.30)'); gradient.addColorStop(.34, 'rgba(51,108,178,.17)'); gradient.addColorStop(.72, 'rgba(91,77,183,.07)'); gradient.addColorStop(1, 'rgba(4,9,12,0)');
      context.fillStyle = gradient; context.beginPath(); context.ellipse(112, selectedY + 30, 124, 108, 0, 0, Math.PI * 2); context.fill();
      context.strokeStyle = 'rgba(125,212,255,.30)'; context.lineWidth = 1; context.beginPath(); context.ellipse(112, selectedY + 30, 98, 88, 0, 0, Math.PI * 2); context.stroke();
      const beam = context.createLinearGradient(0, selectedY, width, selectedY); beam.addColorStop(0, 'rgba(75,190,255,0)'); beam.addColorStop(.47, 'rgba(152,225,255,.48)'); beam.addColorStop(.53, 'rgba(152,225,255,.48)'); beam.addColorStop(1, 'rgba(75,190,255,0)');
      context.fillStyle = beam; context.fillRect(0, selectedY - .5, width, 1);
    }

    for (let index = commits.length - 1; index >= 0; index -= 1) {
      const commit = commits[index]; const startX = laneX(commit, index); const startY = centers[index];
      const parents = commit.parents.length ? commit.parents : index < commits.length - 1 ? [commits[index + 1].hash] : [];
      parents.forEach((parentHash, parentOffset) => {
        const parentIndex = indexByHash.get(parentHash) ?? Math.min(index + 1, commits.length - 1); if (parentIndex === index) return;
        const parent = commits[parentIndex]; const endX = laneX(parent, parentIndex) + parentOffset * 10; const endY = centers[parentIndex];
        const isRelated = related.has(commit.hash) || related.has(parentHash); context.globalAlpha = causalOnly && !isRelated ? .08 : .76;
        const pathColor = parentOffset > 0 ? parent.color : commit.color;
        context.strokeStyle = pathColor; context.lineWidth = commit.hash === selectedHash || parentHash === selectedHash ? 2.6 : 1.45;
        context.shadowColor = pathColor; context.shadowBlur = commit.hash === selectedHash || parentHash === selectedHash ? 18 : 0;
        context.beginPath(); context.moveTo(startX, startY); const bend = Math.max(22, Math.abs(endY - startY) * .42); context.bezierCurveTo(startX, startY + bend, endX, endY - bend, endX, endY); context.stroke(); context.shadowBlur = 0;
      });
    }

    commits.forEach((commit, index) => {
      const x = laneX(commit, index); const y = centers[index]; const isSelected = commit.hash === selectedHash; const isRelated = related.has(commit.hash);
      context.globalAlpha = causalOnly && !isRelated ? .12 : 1;
      if (isSelected) { context.fillStyle = 'rgba(70,184,255,.20)'; context.beginPath(); context.arc(x, y, 16, 0, Math.PI * 2); context.fill(); context.strokeStyle = '#6dcfff'; context.lineWidth = 1; context.stroke(); context.strokeStyle = 'rgba(120,215,255,.25)'; context.beginPath(); context.arc(x, y, 23, 0, Math.PI * 2); context.stroke() }
      context.fillStyle = isSelected ? '#55c8ff' : commit.color; context.beginPath(); context.arc(x, y, isSelected ? 6 : 4.2, 0, Math.PI * 2); context.fill();
      context.strokeStyle = '#141718'; context.lineWidth = 1.5; context.stroke();
    });
    context.globalAlpha = 1;
  }, [commits, selectedHash, causalOnly, rowHeight, expandedHeight]);

  return <canvas ref={canvasRef} className="graph-canvas" aria-label="Git 提交拓扑图" />;
}
