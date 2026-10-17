import React, { useLayoutEffect, useRef, useState } from 'react';

/** Fits the complete document into one physical sheet, without removing any content. */
export function FittedPrintPage({ size, children, className = '', label }: { size: 'A4' | 'A5'; children: React.ReactNode; className?: string; label: string }) {
  const area = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => {
      if (!area.current || !content.current) return;
      const height = content.current.scrollHeight;
      setScale(height ? Math.min(1, (area.current.clientHeight - 2) / height) : 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (area.current) observer.observe(area.current);
    if (content.current) observer.observe(content.current);
    let active = true;
    void document.fonts.ready.then(() => { if (active) fit(); });
    const imgs: HTMLImageElement[] = Array.from(content.current?.querySelectorAll<HTMLImageElement>('img') ?? []);
    imgs.forEach(img => img.addEventListener('load', fit));
    window.addEventListener('beforeprint', fit);
    return () => { active = false; observer.disconnect(); imgs.forEach(img => img.removeEventListener('load', fit)); window.removeEventListener('beforeprint', fit); };
  }, [children]);
  return <article aria-label={label} data-paper={size} data-print-scale={scale.toFixed(4)} className={`fitted-print-page ${className}`} style={{ width: size === 'A4' ? '210mm' : '148mm', height: size === 'A4' ? '297mm' : '210mm' }}>
    <style>{`
      .fitted-print-page { box-sizing:border-box; padding:8mm; background:white; margin:auto; max-width:100%; color:#202737; box-shadow:0 16px 55px #0003; }
      .fitted-print-area { height:100%; position:relative; overflow:hidden; }
      .fitted-print-content { transform-origin:top center; width:100%; display:flow-root; }
      @media print { @page { size:${size}; margin:0; } .fitted-print-page { max-width:none !important; margin:0 !important; padding:8mm !important; box-shadow:none !important; break-inside:avoid; break-after:avoid; print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
    `}</style>
    <div className="fitted-print-area" ref={area}><div className="fitted-print-content" ref={content} style={{ transform: `scale(${scale})` }}>{children}</div></div>
  </article>;
}
