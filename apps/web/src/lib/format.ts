export const pad = (n: number): string => String(n).padStart(2, "0");

export const agoraLocal = (): string => {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

// Instant -> canonical UTC string "YYYY-MM-DDTHH:MM:SSZ" (no milliseconds).
export const paraUtcData = (d: Date): string =>
  d.toISOString().replace(/\.\d{3}Z$/, "Z");

// Local wall-clock -> canonical UTC instant "YYYY-MM-DDTHH:MM:SSZ".
// Use for anything sent to the API (A.1/C.3).
export const paraUtc = (v: string): string => paraUtcData(new Date(v));

export const uid = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return (
      "web-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  }
};

// "YYYY-MM-DDTHH:MM" from any parseable string (for <input type="datetime-local">).
export const isoLocal = (v: string): string => {
  const d = new Date(v);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

// "YYYY-MM-DD" -> human-readable pt-BR date, no timezone shifting.
export const fmtDia = (dia: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return dia;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
  ).toLocaleDateString("pt-BR");
};

// Human-readable local "HH:MM" (empty string when unparseable).
export const fmtHora = (v: string): string => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Human-readable pt-BR "dd/mm/yyyy hh:mm".
export const fmtLocal = (v: string): string => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

// HH:MM:SS for elapsed time.
export const fmtTempo = (ms: number): string => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
};

// Minutes as "3h20min" / "45min" / "2h".
export const fmtDuracao = (min: number): string => {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}min`;
  if (r === 0) return `${h}h`;
  return `${h}h${String(r).padStart(2, "0")}min`;
};

export const fmtDec = (n: number): string =>
  n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtInt = (n: number): string => n.toLocaleString("pt-BR");

export const minutosEntre = (a: string, b: string): number =>
  Math.max(
    0,
    Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000),
  );