export const pad = (n: number): string => String(n).padStart(2, "0");

export const agoraLocal = (): string => {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

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

export const fmtLocal = (v: string): string => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return (
    d.toLocaleDateString("pt-BR") +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

export const fmtTempo = (ms: number): string => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
};