import React from 'react';
import { Layers, CheckCircle2, XCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import { calculateProductionDimensions, formatOverflowSidesText } from '../utils/calculationEngine';

interface OverflowSideSelectorProps {
  overflowValueCm: number;
  overflowTop: boolean;
  overflowBottom: boolean;
  overflowLeft: boolean;
  overflowRight: boolean;
  onChangeValue: (val: number) => void;
  onChangeTop: (val: boolean) => void;
  onChangeBottom: (val: boolean) => void;
  onChangeLeft: (val: boolean) => void;
  onChangeRight: (val: boolean) => void;
  widthCm: number;
  heightCm: number;
}

export const OverflowSideSelector: React.FC<OverflowSideSelectorProps> = ({
  overflowValueCm,
  overflowTop,
  overflowBottom,
  overflowLeft,
  overflowRight,
  onChangeValue,
  onChangeTop,
  onChangeBottom,
  onChangeLeft,
  onChangeRight,
  widthCm,
  heightCm
}) => {
  const allowConfig = {
    overflowValueCm,
    overflowTop,
    overflowBottom,
    overflowLeft,
    overflowRight
  };

  const { productionWidthCm, productionHeightCm, extraWidthCm, extraHeightCm } = calculateProductionDimensions(
    widthCm,
    heightCm,
    allowConfig
  );

  const overflowText = formatOverflowSidesText(allowConfig);
  const allSidesActive = overflowTop && overflowBottom && overflowLeft && overflowRight;
  const noSidesActive = !overflowTop && !overflowBottom && !overflowLeft && !overflowRight;

  const handleSelectAll = () => {
    onChangeTop(true);
    onChangeBottom(true);
    onChangeLeft(true);
    onChangeRight(true);
  };

  const handleClearAll = () => {
    onChangeTop(false);
    onChangeBottom(false);
    onChangeLeft(false);
    onChangeRight(false);
  };

  const handleSelectSidesOnly = () => {
    onChangeLeft(true);
    onChangeRight(true);
    onChangeTop(false);
    onChangeBottom(false);
  };

  const handleSelectTopBottomOnly = () => {
    onChangeTop(true);
    onChangeBottom(true);
    onChangeLeft(false);
    onChangeRight(false);
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h4 className="text-xs font-bold uppercase text-slate-800 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-600" />
            2. Estouro por Lado (Material Adicional)
          </h4>
          <p className="text-xxs text-slate-500 mt-0.5">
            Configure o valor do estouro (cm) e selecione individualmente em quais lados aplicar.
          </p>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 flex-wrap text-xxs">
          <button
            type="button"
            onClick={handleSelectAll}
            className={`px-2.5 py-1 rounded font-semibold transition ${
              allSidesActive
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Todos os Lados
          </button>
          <button
            type="button"
            onClick={handleSelectSidesOnly}
            className={`px-2.5 py-1 rounded font-semibold transition ${
              overflowLeft && overflowRight && !overflowTop && !overflowBottom
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Apenas Laterais
          </button>
          <button
            type="button"
            onClick={handleSelectTopBottomOnly}
            className={`px-2.5 py-1 rounded font-semibold transition ${
              overflowTop && overflowBottom && !overflowLeft && !overflowRight
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Apenas Topo/Base
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className={`px-2.5 py-1 rounded font-semibold transition ${
              noSidesActive
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            Sem Estouro
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Overflow Input Value */}
        <div className="md:col-span-4 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
          <label className="block text-xs font-semibold text-slate-700">
            Medida do Estouro (cm)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.5"
              value={overflowValueCm}
              onChange={(e) => onChangeValue(Math.max(0, Number(e.target.value)))}
              className="w-full px-3 py-2 border border-slate-300 rounded font-mono font-bold text-sm bg-white text-indigo-950 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <span className="text-xs font-bold text-slate-500">cm</span>
          </div>
          <p className="text-xxs text-slate-500">
            Aplica-se aos lados selecionados no diagrama ao lado.
          </p>
        </div>

        {/* Interactive Side Selector Diagram */}
        <div className="md:col-span-8 bg-slate-50 p-3 rounded-lg border border-slate-200 flex flex-col items-center justify-center relative">
          <span className="text-xxs font-bold uppercase text-slate-400 mb-2">
            Selecione os lados ativados para o estouro
          </span>

          <div className="flex flex-col items-center gap-2 w-full max-w-sm">
            {/* Top Side Toggle */}
            <button
              type="button"
              onClick={() => onChangeTop(!overflowTop)}
              className={`w-40 py-1 px-2 rounded-md text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                overflowTop
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {overflowTop ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-40" />}
              Superior {overflowTop ? `(+${overflowValueCm}cm)` : ''}
            </button>

            {/* Middle Row (Left, Center Artwork Box, Right) */}
            <div className="flex items-center justify-center gap-2 w-full">
              {/* Left Side Toggle */}
              <button
                type="button"
                onClick={() => onChangeLeft(!overflowLeft)}
                className={`py-3 px-2 rounded-md text-xs font-bold transition flex flex-col items-center justify-center gap-1 border min-w-[80px] ${
                  overflowLeft
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {overflowLeft ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-40" />}
                <span>Esquerdo</span>
                <span className="text-xxs opacity-80">{overflowLeft ? `+${overflowValueCm}cm` : '0cm'}</span>
              </button>

              {/* Artwork Core Representation */}
              <div className="flex-1 bg-indigo-900/90 text-white p-3 rounded-lg text-center shadow-inner flex flex-col justify-center items-center border border-indigo-950">
                <span className="text-xxs uppercase tracking-wider text-indigo-300 font-bold">Medida Arte</span>
                <span className="text-sm font-mono font-bold">{widthCm} × {heightCm} cm</span>
              </div>

              {/* Right Side Toggle */}
              <button
                type="button"
                onClick={() => onChangeRight(!overflowRight)}
                className={`py-3 px-2 rounded-md text-xs font-bold transition flex flex-col items-center justify-center gap-1 border min-w-[80px] ${
                  overflowRight
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {overflowRight ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-40" />}
                <span>Direito</span>
                <span className="text-xxs opacity-80">{overflowRight ? `+${overflowValueCm}cm` : '0cm'}</span>
              </button>
            </div>

            {/* Bottom Side Toggle */}
            <button
              type="button"
              onClick={() => onChangeBottom(!overflowBottom)}
              className={`w-40 py-1 px-2 rounded-md text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                overflowBottom
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {overflowBottom ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5 opacity-40" />}
              Inferior {overflowBottom ? `(+${overflowValueCm}cm)` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Production Dimensions Summary Banner */}
      <div className="bg-indigo-950 text-white p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-indigo-300 text-xxs font-bold uppercase tracking-wider">Resultado Final de Produção</span>
            <span className="bg-indigo-800 text-indigo-100 text-xxs px-2 py-0.5 rounded-full font-mono">
              {overflowText}
            </span>
          </div>
          <div className="text-xxs text-indigo-200">
            {extraWidthCm > 0 || extraHeightCm > 0 ? (
              <span>Adicionado: +{extraWidthCm} cm na largura / +{extraHeightCm} cm na altura</span>
            ) : (
              <span>Nenhum acréscimo de material adicionado às dimensões.</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 bg-indigo-900/80 px-3 py-1.5 rounded-lg border border-indigo-800">
          <div>
            <div className="text-xxs text-indigo-300">Arte Original</div>
            <div className="font-mono font-bold text-slate-200 text-xs">{widthCm} × {heightCm} cm</div>
          </div>
          <ArrowRight className="w-4 h-4 text-indigo-400" />
          <div>
            <div className="text-xxs text-amber-300 font-bold">Medida Produção</div>
            <div className="font-mono font-bold text-amber-400 text-sm">{productionWidthCm} × {productionHeightCm} cm</div>
          </div>
        </div>
      </div>
    </div>
  );
};
