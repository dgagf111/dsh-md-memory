import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
const DEFAULT = { project: 200, memory: 300 };
const LIMITS = { project: [160, 320], memory: [240, 480] } as const;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Keep the editor at least 320px wide; narrow layouts are arranged by CSS. */
export function fitPaneWidths(width: number, requested: typeof DEFAULT, editor: boolean) {
  const project = clamp(requested.project, 160, Math.min(320, width - (editor ? 580 : 250)));
  const memory = clamp(requested.memory, 240, Math.min(480, width - project - 340));
  return { project, memory };
}
interface Props { navigation: ReactNode; library: ReactNode; editor?: ReactNode; }
export function PaneLayout({ navigation, library, editor }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [requested, setRequested] = useState(DEFAULT);
  const [dragging, setDragging] = useState<string | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(entry.contentRect.width); });
    observer.observe(root.current!); return () => observer.disconnect();
  }, []);
  const sizes = fitPaneWidths(width, requested, !!editor);
  const separator = (key: keyof typeof DEFAULT, label: string) => {
    const [min, limit] = LIMITS[key];
    const max = width <= 850 ? limit : Math.min(limit, key === 'project' ? width - (editor ? sizes.memory + 340 : 250) : width - sizes.project - 340);
    const update = (value: number) => setRequested(current => ({ ...current, [key]: clamp(value, min, max) }));
    return <div className={`mm-divider${dragging === key ? ' is-dragging' : ''}`} role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={sizes[key]}
      title={`${label}：${min}–${max}px；拖动调整，方向键微调，双击恢复默认`}
      onDoubleClick={() => update(DEFAULT[key])}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); update(event.key === 'Home' ? min : event.key === 'End' ? max : sizes[key] + (event.key === 'ArrowLeft' ? -10 : 10));
      }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); const handle = event.currentTarget; const start = event.clientX, size = sizes[key];
        handle.setPointerCapture(event.pointerId); setDragging(key);
        handle.onpointermove = move => update(size + move.clientX - start);
      }}
      onLostPointerCapture={event => { event.currentTarget.onpointermove = null; setDragging(null); }}
      onPointerUp={event => { event.currentTarget.releasePointerCapture(event.pointerId); }}><span/></div>;
  };
  return <div ref={root} className={`mm-workspace${editor ? ' has-editor' : ''}${dragging ? ' is-resizing' : ''}`} style={{ '--mm-project-width': `${sizes.project}px`, '--mm-memory-width': `${sizes.memory}px` } as CSSProperties}>
    {navigation}{separator('project', '项目与记忆分界')}{library}{editor && <>{separator('memory', '记忆与编辑分界')}{editor}</>}
  </div>;
}
