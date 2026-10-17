import React, { useState } from 'react';
import { ArrowRight, Info, Eye, Layers, Maximize2 } from 'lucide-react';
import { CalculationSnapshot, EvaluatedRollOption } from '../types';

export interface RollDiagramProps {
  snapshot?: CalculationSnapshot | EvaluatedRollOption;
  rollWidthCm?: number;
  usableRollWidthCm?: number;
  finishedWidthCm?: number;
  finishedHeightCm?: number;
  productionWidthCm?: number;
  productionHeightCm?: number;
  orientation?: 'HORIZONTAL' | 'VERTICAL';
  quantity?: number;
  unitsAcross?: number;
  rowsNeeded?: number;
  linearMetersNeeded?: number;
  wastePercentage?: number;
  allowances?: {
    reinforcementCm?: number;
    hemCm?: number;
    rodPocketCm?: number;
    bleedCm?: number;
    edgeSafetyCm?: number;
    extraWidthCm?: number;
    extraHeightCm?: number;
  };
  materialName?: string;
  rollName?: string;
  showComparisonMode?: boolean;
}

export const RollDiagramSVG: React.FC<RollDiagramProps> = ({
  snapshot,
  rollWidthCm: propRollWidthCm,
  usableRollWidthCm: propUsableRollWidthCm,
  finishedWidthCm: propFinishedWidthCm,
  finishedHeightCm: propFinishedHeightCm,
  productionWidthCm: propProductionWidthCm,
  productionHeightCm: propProductionHeightCm,
  orientation: propOrientation,
  quantity: propQuantity,
  unitsAcross: propUnitsAcross,
  rowsNeeded: propRowsNeeded,
  linearMetersNeeded: propLinearMetersNeeded,
  wastePercentage: propWastePercentage,
  allowances,
  materialName: propMaterialName = 'Lona / Vinil',
  rollName: propRollName
}) => {
  const [unitMode, setUnitMode] = useState<'CM' | 'M'>('CM');
  const [showAllowancesDetail, setShowAllowancesDetail] = useState(true);

  // Safely extract dimensions from individual props or snapshot object
  const rollWidthCm = propRollWidthCm ?? snapshot?.billableWidthCm ?? (snapshot as EvaluatedRollOption)?.rollWidthCm ?? snapshot?.recommendedRollWidthCm ?? 100;
  const usableRollWidthCm = propUsableRollWidthCm ?? snapshot?.usableRollWidthCm ?? rollWidthCm;
  const finishedWidthCm = propFinishedWidthCm ?? 90;
  const finishedHeightCm = propFinishedHeightCm ?? 30;
  const productionWidthCm = propProductionWidthCm ?? snapshot?.productionWidthCm ?? finishedWidthCm;
  const productionHeightCm = propProductionHeightCm ?? snapshot?.productionHeightCm ?? finishedHeightCm;
  const orientation = propOrientation ?? snapshot?.orientation ?? 'HORIZONTAL';
  const quantity = propQuantity ?? 1;
  const unitsAcross = propUnitsAcross ?? snapshot?.unitsAcross ?? 1;
  const rowsNeeded = propRowsNeeded ?? snapshot?.rowsNeeded ?? 1;
  const linearMetersNeeded = propLinearMetersNeeded ?? snapshot?.linearMetersNeeded ?? 0.3;
  const wastePercentage = propWastePercentage ?? snapshot?.wastePercentage ?? 0;
  const materialName = propMaterialName || 'Lona / Vinil';
  const rollName = propRollName || snapshot?.rollName;

  // Convert linear meters to cm for consumed length
  const consumedLengthCm = (linearMetersNeeded || 0) * 100;

  // Formatting helpers - completely safe against undefined or NaN
  const formatDim = (valCm?: number) => {
    if (valCm === undefined || valCm === null || isNaN(valCm)) return '0 cm';
    if (unitMode === 'M') {
      return `${(valCm / 100).toFixed(2)} m`;
    }
    return `${valCm.toFixed(1).replace('.0', '')} cm`;
  };

  // Extra width and height calculations (per side)
  const extraWTotal = productionWidthCm - (orientation === 'HORIZONTAL' ? finishedWidthCm : finishedHeightCm);
  const extraHTotal = productionHeightCm - (orientation === 'HORIZONTAL' ? finishedHeightCm : finishedWidthCm);

  const extraWSide = Math.max(0, extraWTotal / 2);
  const extraHSide = Math.max(0, extraHTotal / 2);

  // Finished piece dimensions inside production piece
  const pieceProdW = productionWidthCm;
  const pieceProdH = productionHeightCm;
  const pieceFinW = orientation === 'HORIZONTAL' ? finishedWidthCm : finishedHeightCm;
  const pieceFinH = orientation === 'HORIZONTAL' ? finishedHeightCm : finishedWidthCm;

  // Determine side waste width
  const usedWidthTotal = unitsAcross * pieceProdW;
  const sideWasteCm = Math.max(0, usableRollWidthCm - usedWidthTotal);

  // ViewBox scale math for SVG
  const paddingX = 70;
  const paddingY = 70;
  const svgWidth = Math.max(rollWidthCm, 100) + paddingX * 2;
  const svgHeight = Math.max(consumedLengthCm, 80) + paddingY * 2;

  // Generate grid pieces
  const pieces = [];
  let currentCount = 0;
  for (let r = 0; r < rowsNeeded; r++) {
    for (let c = 0; c < unitsAcross; c++) {
      if (currentCount >= quantity) break;
      currentCount++;

      const px = paddingX + c * pieceProdW;
      const py = paddingY + r * pieceProdH;

      pieces.push({
        id: currentCount,
        row: r + 1,
        col: c + 1,
        prodX: px,
        prodY: py,
        prodW: pieceProdW,
        prodH: pieceProdH,
        finX: px + extraWSide,
        finY: py + extraHSide,
        finW: pieceFinW,
        finH: pieceFinH
      });
    }
  }

  return (
    <div className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-xl border border-slate-800 space-y-3">
      {/* HEADER & CONTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 text-xs">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <Maximize2 className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-slate-100 flex items-center space-x-1.5">
              <span>Diagrama Técnico de Encaixe na Bobina</span>
              <span className="px-2 py-0.5 bg-indigo-500/30 text-indigo-300 font-mono text-xxs rounded-full uppercase">
                {orientation}
              </span>
            </h4>
            <p className="text-slate-400 text-xxs">
              {materialName} {rollName ? `(${rollName})` : ''} • Bobina: {formatDim(rollWidthCm)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowAllowancesDetail(!showAllowancesDetail)}
            className={`px-2 py-1 rounded text-xxs font-semibold flex items-center space-x-1 transition ${
              showAllowancesDetail
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{showAllowancesDetail ? 'Ocultar Acabamentos' : 'Ver Acabamentos'}</span>
          </button>

          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg text-xxs font-mono">
            <button
              type="button"
              onClick={() => setUnitMode('CM')}
              className={`px-2 py-0.5 rounded ${
                unitMode === 'CM' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              cm
            </button>
            <button
              type="button"
              onClick={() => setUnitMode('M')}
              className={`px-2 py-0.5 rounded ${
                unitMode === 'M' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              m
            </button>
          </div>
        </div>
      </div>

      {/* SVG CANVAS CONTAINER */}
      <div className="relative overflow-x-auto bg-slate-950/80 rounded-lg p-2 border border-slate-800 flex justify-center">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="max-w-full h-auto min-h-[300px] max-h-[460px] select-none"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }}
        >
          <defs>
            {/* Pattern for unused roll waste */}
            <pattern
              id="wasteHatch"
              width="10"
              height="10"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="10" stroke="#f43f5e" strokeWidth="2" opacity="0.3" />
            </pattern>

            {/* Pattern for production allowance/margin */}
            <pattern
              id="allowanceHatch"
              width="8"
              height="8"
              patternTransform="rotate(-45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="8" stroke="#f59e0b" strokeWidth="1.5" opacity="0.4" />
            </pattern>

            {/* Arrowhead marker for dimensions */}
            <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* 1. ROLL CONTAINER (Outer Frame) */}
          <rect
            x={paddingX}
            y={paddingY}
            width={rollWidthCm}
            height={consumedLengthCm}
            fill="#1e293b"
            stroke="#475569"
            strokeWidth="1.5"
            rx="2"
          />

          {/* 2. SIDE WASTE AREA (Unused Width) */}
          {sideWasteCm > 0 && (
            <g>
              <rect
                x={paddingX + usedWidthTotal}
                y={paddingY}
                width={sideWasteCm}
                height={consumedLengthCm}
                fill="url(#wasteHatch)"
                stroke="#f43f5e"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <text
                x={paddingX + usedWidthTotal + sideWasteCm / 2}
                y={paddingY + consumedLengthCm / 2}
                fill="#fda4af"
                fontSize="10"
                fontFamily="monospace"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(-90 ${paddingX + usedWidthTotal + sideWasteCm / 2} ${paddingY + consumedLengthCm / 2})`}
              >
                Sobra Lateral ({formatDim(sideWasteCm)})
              </text>
            </g>
          )}

          {/* 3. ARTWORK PIECES */}
          {pieces.map((p) => (
            <g key={p.id}>
              {/* Outer Production Box (Including Reforço / Bainha / Sangria) */}
              <rect
                x={p.prodX}
                y={p.prodY}
                width={p.prodW}
                height={p.prodH}
                fill={showAllowancesDetail ? 'url(#allowanceHatch)' : '#334155'}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />

              {/* Inner Finished Artwork Box */}
              <rect
                x={p.finX}
                y={p.finY}
                width={p.finW}
                height={p.finH}
                fill="#0284c7"
                fillOpacity="0.85"
                stroke="#38bdf8"
                strokeWidth="1.5"
                rx="1"
              />

              {/* Artwork Text Details Inside Box */}
              <text
                x={p.finX + p.finW / 2}
                y={p.finY + p.finH / 2 - 6}
                fill="#ffffff"
                fontSize="11"
                fontWeight="bold"
                fontFamily="sans-serif"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {quantity > 1 ? `Peça #${p.id}` : 'Arte Final'}
              </text>
              <text
                x={p.finX + p.finW / 2}
                y={p.finY + p.finH / 2 + 8}
                fill="#e0f2fe"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {formatDim(p.finW)} × {formatDim(p.finH)}
              </text>

              {/* Allowance Annotations / Labels if enabled */}
              {showAllowancesDetail && (extraWSide > 0 || extraHSide > 0) && (
                <text
                  x={p.prodX + p.prodW / 2}
                  y={p.prodY + 8}
                  fill="#fbbf24"
                  fontSize="7"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  Acabamento: +{formatDim(extraWTotal)} lat / +{formatDim(extraHTotal)} vert
                </text>
              )}
            </g>
          ))}

          {/* 4. COTAS & DIMENSIONS (ARROWS AND LABELS) */}

          {/* TOP COTA: Total Roll Width */}
          <line
            x1={paddingX}
            y1={paddingY - 20}
            x2={paddingX + rollWidthCm}
            y2={paddingY - 20}
            stroke="#94a3b8"
            strokeWidth="1.2"
            markerStart="url(#arrow)"
            markerEnd="url(#arrow)"
          />
          <text
            x={paddingX + rollWidthCm / 2}
            y={paddingY - 26}
            fill="#e2e8f0"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
          >
            Largura da Bobina: {formatDim(rollWidthCm)}
          </text>

          {/* TOP SUB-COTA: Usable / Production Width */}
          <line
            x1={paddingX}
            y1={paddingY - 5}
            x2={paddingX + usedWidthTotal}
            y2={paddingY - 5}
            stroke="#f59e0b"
            strokeWidth="1"
            markerStart="url(#arrow)"
            markerEnd="url(#arrow)"
          />
          <text
            x={paddingX + usedWidthTotal / 2}
            y={paddingY - 8}
            fill="#fbbf24"
            fontSize="8"
            fontFamily="monospace"
            textAnchor="middle"
          >
            Largura Produção: {formatDim(usedWidthTotal)}
          </text>

          {/* LEFT COTA: Consumed Length */}
          <line
            x1={paddingX - 25}
            y1={paddingY}
            x2={paddingX - 25}
            y2={paddingY + consumedLengthCm}
            stroke="#94a3b8"
            strokeWidth="1.2"
            markerStart="url(#arrow)"
            markerEnd="url(#arrow)"
          />
          <text
            x={paddingX - 32}
            y={paddingY + consumedLengthCm / 2}
            fill="#e2e8f0"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(-90 ${paddingX - 32} ${paddingY + consumedLengthCm / 2})`}
          >
            Comprimento Consumido: {formatDim(consumedLengthCm)}
          </text>

          {/* RIGHT COTA: Roll Advance Direction */}
          <line
            x1={paddingX + rollWidthCm + 25}
            y1={paddingY}
            x2={paddingX + rollWidthCm + 25}
            y2={paddingY + consumedLengthCm}
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            markerEnd="url(#arrow)"
          />
          <text
            x={paddingX + rollWidthCm + 32}
            y={paddingY + consumedLengthCm / 2}
            fill="#38bdf8"
            fontSize="9"
            fontFamily="sans-serif"
            fontWeight="bold"
            textAnchor="middle"
            transform={`rotate(90 ${paddingX + rollWidthCm + 32} ${paddingY + consumedLengthCm / 2})`}
          >
            Sentido de Avanço da Impressão ↓
          </text>
        </svg>
      </div>

      {/* DIAGRAM LEGEND & METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xxs border-t border-slate-800 pt-3">
        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 bg-sky-600 rounded-sm border border-sky-400 shrink-0" />
          <span className="text-slate-300">Área da Arte Final</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 bg-amber-500/30 border border-amber-400 border-dashed rounded-sm shrink-0" />
          <span className="text-slate-300">Reforço / Acabamento</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 bg-slate-800 border border-slate-600 rounded-sm shrink-0" />
          <span className="text-slate-300">Bobina em Uso</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <div className="w-3 h-3 bg-rose-500/20 border border-rose-500 border-dashed rounded-sm shrink-0" />
          <span className="text-slate-300">Área Sobra / Desperdício</span>
        </div>
      </div>

      {/* SUMMARY TECHNICAL ROW */}
      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 font-mono text-xxs flex flex-wrap items-center justify-between gap-2 text-slate-300">
        <div>
          <span className="text-slate-400">Dimensão na Largura (Cross Roll):</span>{' '}
          <strong className="text-amber-400">{formatDim(pieceProdW)}</strong>
        </div>
        <div>
          <span className="text-slate-400">Dimensão no Comprimento (Along Roll):</span>{' '}
          <strong className="text-amber-400">{formatDim(pieceProdH)}</strong>
        </div>
        <div>
          <span className="text-slate-400">Encaixe:</span>{' '}
          <strong className="text-indigo-300">{unitsAcross} un. / fila</strong> ({rowsNeeded} fila{rowsNeeded > 1 ? 's' : ''})
        </div>
        <div>
          <span className="text-slate-400">Desperdício:</span>{' '}
          <strong className={wastePercentage > 20 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
            {wastePercentage.toFixed(1)}%
          </strong>
        </div>
      </div>
    </div>
  );
};
