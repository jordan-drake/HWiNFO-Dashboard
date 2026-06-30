// Centralized threshold configuration system.
// Auto mode derives thresholds from detected hardware specs.
// Custom mode lets the user override any value.
// The alert system reads from getActiveThresholds() instead of hardcoded constants.

import { GENERIC_CPU_SPECS, GENERIC_GPU_SPECS } from './hardware-specs';

const STORAGE_KEY = 'hwinfo-dashboard-thresholds';
const MODE_KEY = 'hwinfo-dashboard-threshold-mode';

const DEFAULT_THRESHOLDS = {
  cpu: {
    warnTemp: 80,
    critTemp: 95,
    packagePowerWarn: 200,
  },
  gpu: {
    warnTemp: 80,
    critTemp: 90,
    hotSpotWarn: 85,
    hotSpotCrit: 95,
    powerPctWarn: 95,
  },
  vrm: {
    warnTemp: 90,
    critTemp: 110,
    pchWarn: 80,
  },
  drives: {
    warnTemp: 55,
    critTemp: 70,
    lifeWarn: 20,
    lifeInfo: 50,
  },
  voltages: {
    v12DeviationWarn: 5,
  },
};

/**
 * Derive thresholds from a detected system profile.
 */
export function deriveThresholdsFromProfile(profile) {
  const cpuSpec = profile?.cpuSpec || GENERIC_CPU_SPECS;
  const gpuSpec = profile?.gpuSpec || GENERIC_GPU_SPECS;

  return {
    cpu: {
      warnTemp: cpuSpec.warnTemp || 80,
      critTemp: cpuSpec.safeTemp || 95,
      packagePowerWarn: cpuSpec.ppt || 200,
    },
    gpu: {
      warnTemp: gpuSpec.warnTemp || 80,
      critTemp: gpuSpec.critTemp || 90,
      hotSpotWarn: (gpuSpec.warnTemp || 80) + 5,
      hotSpotCrit: (gpuSpec.critTemp || 90) + 5,
      powerPctWarn: 95,
    },
    vrm: {
      warnTemp: 90,
      critTemp: 110,
      pchWarn: 80,
    },
    drives: {
      warnTemp: 55,
      critTemp: 70,
      lifeWarn: 20,
      lifeInfo: 50,
    },
    voltages: {
      v12DeviationWarn: 5,
    },
  };
}

/**
 * Get the current threshold mode ('auto' or 'custom').
 */
export function getThresholdMode() {
  try {
    return localStorage.getItem(MODE_KEY) || 'auto';
  } catch {
    return 'auto';
  }
}

export function setThresholdMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch { /* localStorage unavailable */ }
}

/**
 * Get saved custom thresholds from localStorage.
 */
export function getSavedCustomThresholds() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
}

export function saveCustomThresholds(thresholds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds));
  } catch { /* localStorage unavailable */ }
}

/**
 * Get the active thresholds based on current mode and detected profile.
 * This is the single source of truth that the alert system should use.
 *
 * @param {object|null} profile - Detected system profile from extractSystemProfile()
 * @returns {object} Active threshold values
 */
export function getActiveThresholds(profile) {
  const mode = getThresholdMode();
  if (mode === 'custom') {
    const custom = getSavedCustomThresholds();
    if (custom) return custom;
  }
  // Auto mode or no saved custom thresholds
  if (profile) {
    return deriveThresholdsFromProfile(profile);
  }
  return { ...DEFAULT_THRESHOLDS };
}

/**
 * Get default thresholds (for reset or initial custom values).
 */
export function getDefaultThresholds() {
  return JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
}
