/**
 * TEMPS D'AFFICHAGE — glossaire
 *
 * Chooses the temporal granularity shown by the chart cursor from the
 * resolution of the currently displayed history.
 */
export type ChartTimeResolution = "minute" | "hour" | "day" | "month";

export function chartTimeResolution(deltaMinutes: number): ChartTimeResolution {
  if (deltaMinutes < 60) return "minute";
  if (deltaMinutes < 1440) return "hour";
  if (deltaMinutes < 43200) return "day";
  return "month";
}

export function simulationTimeParts(minute: number) {
  const safe = Math.max(0, Math.floor(minute));
  const dayIndex = Math.floor(safe / 1440);
  const minuteOfDay = safe % 1440;
  return {
    day: dayIndex + 1,
    year: Math.floor(dayIndex / 365) + 1,
    month: Math.floor(dayIndex / 30) + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60
  };
}
