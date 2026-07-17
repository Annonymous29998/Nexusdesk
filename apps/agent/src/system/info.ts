import { hostname, platform, release, totalmem, freemem, cpus, uptime } from 'node:os';
import { DevicePlatform } from '@nexusdesk/types';

export interface MonitorInfo {
  id: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface SystemInfo {
  hostname: string;
  platform: DevicePlatform;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemoryMb: number;
}

export interface RuntimeSample {
  uptimeSeconds: number;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
}

export function detectPlatform(): DevicePlatform {
  switch (platform()) {
    case 'win32':
      return DevicePlatform.Windows;
    case 'darwin':
      return DevicePlatform.MacOS;
    case 'linux':
      return DevicePlatform.Linux;
    default:
      return DevicePlatform.Unknown;
  }
}

export function getStaticSystemInfo(): SystemInfo {
  const cpuList = cpus();
  const firstCpu = cpuList[0];

  return {
    hostname: hostname(),
    platform: detectPlatform(),
    osVersion: release(),
    arch: process.arch,
    cpuModel: firstCpu?.model ?? 'unknown',
    cpuCount: cpuList.length,
    totalMemoryMb: Math.round(totalmem() / (1024 * 1024)),
  };
}

let previousCpuSample: { idle: number; total: number } | null = null;

function sampleCpuTotals(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;

  for (const cpu of cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }

  return { idle, total };
}

/** Approximate CPU utilization percentage since the last call (0-100). */
function computeCpuPercent(): number {
  const current = sampleCpuTotals();

  if (!previousCpuSample) {
    previousCpuSample = current;
    return 0;
  }

  const idleDelta = current.idle - previousCpuSample.idle;
  const totalDelta = current.total - previousCpuSample.total;
  previousCpuSample = current;

  if (totalDelta <= 0) return 0;
  const usage = 1 - idleDelta / totalDelta;
  return Math.max(0, Math.min(100, Math.round(usage * 100)));
}

export function sampleRuntime(): RuntimeSample {
  const totalMb = Math.round(totalmem() / (1024 * 1024));
  const freeMb = Math.round(freemem() / (1024 * 1024));

  return {
    uptimeSeconds: Math.floor(uptime()),
    cpuPercent: computeCpuPercent(),
    memoryUsedMb: Math.max(0, totalMb - freeMb),
    memoryTotalMb: totalMb,
  };
}

/**
 * Enumerate attached monitors. Uses the optional `systeminformation` package
 * when available for real display geometry; otherwise reports a single
 * synthetic 1920x1080 primary display so downstream capture code always has
 * at least one target to reference.
 */
export async function listMonitors(): Promise<MonitorInfo[]> {
  try {
    const si = await import('systeminformation');
    const displays = await si.default.graphics().then((g) => g.displays);

    if (displays.length > 0) {
      return displays.map((display, index) => ({
        id: display.deviceName || display.connection || `display-${index}`,
        width: display.resolutionX || display.currentResX || 1920,
        height: display.resolutionY || display.currentResY || 1080,
        isPrimary: display.main ?? index === 0,
      }));
    }
  } catch {
    // systeminformation not available or failed to query graphics — fall back below.
  }

  return [{ id: 'display-0', width: 1920, height: 1080, isPrimary: true }];
}

/** Local (non-public) IPv4/IPv6 addresses across all network interfaces. */
export async function listLocalIpAddresses(): Promise<string[]> {
  const { networkInterfaces } = await import('node:os');
  const nets = networkInterfaces();
  const addresses: string[] = [];

  for (const entries of Object.values(nets)) {
    for (const entry of entries ?? []) {
      if (!entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}
