import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type Point = { x: number; y: number };

interface Props {
  /** 换词时清空笔迹，面板保持展开状态 */
  resetKey: string;
}

export function WordSketchPad({ resetKey }: Props) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);

  function paint() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.strokeStyle = '#c4693c';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of strokes.current) {
      if (stroke.length === 1) {
        const [point] = stroke;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = '#c4693c';
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      stroke.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }
  }

  function resize() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }

  useEffect(() => {
    strokes.current = [];
    if (!open) return;
    resize();
    const onResize = () => {
      strokes.current = [];
      resize();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // resetKey 变化时也要清空；open 变化时初始化画布
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resetKey]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current.push([point(event)]);
    paint();
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const stroke = strokes.current[strokes.current.length - 1];
    if (!stroke) return;
    stroke.push(point(event));
    paint();
  }

  function end(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function undo() {
    strokes.current.pop();
    paint();
  }

  function clear() {
    strokes.current = [];
    paint();
  }

  return (
    <div className="sketch-block">
      {open ? (
        <>
          <canvas
            ref={canvasRef}
            className="sketch-canvas"
            aria-label="手写草稿"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onPointerLeave={end}
          />
          <div className="sketch-actions">
            <button type="button" className="sketch-button" onClick={undo}>撤销</button>
            <button type="button" className="sketch-button" onClick={clear}>清空</button>
            <button type="button" className="sketch-button" onClick={() => setOpen(false)}>收起</button>
          </div>
        </>
      ) : (
        <button type="button" className="sketch-toggle" onClick={() => setOpen(true)}>
          手写草稿
        </button>
      )}
    </div>
  );
}

