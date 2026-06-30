import { useState, useEffect, useCallback } from 'react';
import {
  getThresholdMode,
  setThresholdMode,
  getSavedCustomThresholds,
  saveCustomThresholds,
  deriveThresholdsFromProfile,
  getDefaultThresholds,
} from '../utils/thresholds';

function ThresholdInput({ label, unit, value, onChange, disabled }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs py-0.5">
      <span className={disabled ? 'text-gray-500' : 'text-gray-300'}>{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          disabled={disabled}
          className={`w-16 px-1.5 py-0.5 rounded text-right text-xs ${
            disabled
              ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed'
              : 'bg-gray-700 text-gray-100 border-gray-600'
          } border`}
        />
        <span className="text-gray-400 text-[10px] w-6">{unit}</span>
      </span>
    </label>
  );
}

function ThresholdGroup({ title, children }) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-semibold text-blue-400 border-b border-gray-700 pb-1 mb-1.5">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export default function SettingsPanel({ isOpen, onClose, systemProfile, onThresholdsChange }) {
  const [mode, setMode] = useState(getThresholdMode());
  const [thresholds, setThresholds] = useState(() => {
    if (mode === 'custom') {
      return getSavedCustomThresholds() || deriveThresholdsFromProfile(systemProfile);
    }
    return deriveThresholdsFromProfile(systemProfile);
  });

  useEffect(() => {
    if (mode === 'auto') {
      const derived = deriveThresholdsFromProfile(systemProfile);
      setThresholds(derived);
    }
  }, [systemProfile, mode]);

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    setThresholdMode(newMode);
    if (newMode === 'auto') {
      const derived = deriveThresholdsFromProfile(systemProfile);
      setThresholds(derived);
      onThresholdsChange(derived);
    } else {
      // Custom: start with auto-derived values
      const current = deriveThresholdsFromProfile(systemProfile);
      const saved = getSavedCustomThresholds();
      const customs = saved || current;
      setThresholds(customs);
      saveCustomThresholds(customs);
      onThresholdsChange(customs);
    }
  }, [systemProfile, onThresholdsChange]);

  const updateThreshold = useCallback((group, key, value) => {
    setThresholds(prev => {
      const next = { ...prev, [group]: { ...prev[group], [key]: value } };
      saveCustomThresholds(next);
      onThresholdsChange(next);
      return next;
    });
  }, [onThresholdsChange]);

  if (!isOpen) return null;

  const isAuto = mode === 'auto';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-96 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-blue-400">Threshold Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
        </div>

        <div className="px-4 py-3">
          {/* Mode Toggle */}
          <div className="mb-4">
            <div className="text-[10px] text-gray-400 mb-1.5">Threshold Mode:</div>
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="threshold-mode"
                  checked={isAuto}
                  onChange={() => handleModeChange('auto')}
                  className="accent-blue-500"
                />
                <span>Auto (detected hardware)</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="threshold-mode"
                  checked={!isAuto}
                  onChange={() => handleModeChange('custom')}
                  className="accent-blue-500"
                />
                <span>Custom</span>
              </label>
            </div>
            {isAuto && (
              <p className="text-[10px] text-gray-500 mt-1">
                Values are derived from detected hardware. Switch to Custom to edit.
              </p>
            )}
          </div>

          {/* CPU */}
          <ThresholdGroup title="CPU">
            <ThresholdInput label="Warning Temp" unit="\u00b0C" value={thresholds.cpu?.warnTemp ?? 80} onChange={(v) => updateThreshold('cpu', 'warnTemp', v)} disabled={isAuto} />
            <ThresholdInput label="Critical Temp" unit="\u00b0C" value={thresholds.cpu?.critTemp ?? 95} onChange={(v) => updateThreshold('cpu', 'critTemp', v)} disabled={isAuto} />
            <ThresholdInput label="Package Power Warning (sustained)" unit="W" value={thresholds.cpu?.packagePowerWarn ?? 200} onChange={(v) => updateThreshold('cpu', 'packagePowerWarn', v)} disabled={isAuto} />
          </ThresholdGroup>

          {/* GPU */}
          <ThresholdGroup title="GPU">
            <ThresholdInput label="Warning Temp" unit="\u00b0C" value={thresholds.gpu?.warnTemp ?? 80} onChange={(v) => updateThreshold('gpu', 'warnTemp', v)} disabled={isAuto} />
            <ThresholdInput label="Critical Temp" unit="\u00b0C" value={thresholds.gpu?.critTemp ?? 90} onChange={(v) => updateThreshold('gpu', 'critTemp', v)} disabled={isAuto} />
            <ThresholdInput label="Hot Spot Warning" unit="\u00b0C" value={thresholds.gpu?.hotSpotWarn ?? 85} onChange={(v) => updateThreshold('gpu', 'hotSpotWarn', v)} disabled={isAuto} />
            <ThresholdInput label="Hot Spot Critical" unit="\u00b0C" value={thresholds.gpu?.hotSpotCrit ?? 95} onChange={(v) => updateThreshold('gpu', 'hotSpotCrit', v)} disabled={isAuto} />
            <ThresholdInput label="Power % of TDP Warning" unit="%" value={thresholds.gpu?.powerPctWarn ?? 95} onChange={(v) => updateThreshold('gpu', 'powerPctWarn', v)} disabled={isAuto} />
          </ThresholdGroup>

          {/* VRM / Board */}
          <ThresholdGroup title="VRM / Board">
            <ThresholdInput label="VRM Warning" unit="\u00b0C" value={thresholds.vrm?.warnTemp ?? 90} onChange={(v) => updateThreshold('vrm', 'warnTemp', v)} disabled={isAuto} />
            <ThresholdInput label="VRM Critical" unit="\u00b0C" value={thresholds.vrm?.critTemp ?? 110} onChange={(v) => updateThreshold('vrm', 'critTemp', v)} disabled={isAuto} />
            <ThresholdInput label="PCH Warning" unit="\u00b0C" value={thresholds.vrm?.pchWarn ?? 80} onChange={(v) => updateThreshold('vrm', 'pchWarn', v)} disabled={isAuto} />
          </ThresholdGroup>

          {/* Drives */}
          <ThresholdGroup title="Drives">
            <ThresholdInput label="Temp Warning" unit="\u00b0C" value={thresholds.drives?.warnTemp ?? 55} onChange={(v) => updateThreshold('drives', 'warnTemp', v)} disabled={isAuto} />
            <ThresholdInput label="Temp Critical" unit="\u00b0C" value={thresholds.drives?.critTemp ?? 70} onChange={(v) => updateThreshold('drives', 'critTemp', v)} disabled={isAuto} />
            <ThresholdInput label="Life Warning" unit="%" value={thresholds.drives?.lifeWarn ?? 20} onChange={(v) => updateThreshold('drives', 'lifeWarn', v)} disabled={isAuto} />
            <ThresholdInput label="Life Info" unit="%" value={thresholds.drives?.lifeInfo ?? 50} onChange={(v) => updateThreshold('drives', 'lifeInfo', v)} disabled={isAuto} />
          </ThresholdGroup>

          {/* Voltages */}
          <ThresholdGroup title="Voltages">
            <ThresholdInput label="+12V Deviation Warning" unit="%" value={thresholds.voltages?.v12DeviationWarn ?? 5} onChange={(v) => updateThreshold('voltages', 'v12DeviationWarn', v)} disabled={isAuto} />
          </ThresholdGroup>
        </div>
      </div>
    </div>
  );
}
