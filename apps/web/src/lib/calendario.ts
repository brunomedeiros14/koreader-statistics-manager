import type { LeituraRegistro } from "@leitura/common";

import { pad } from "./format";

type Sessao = Pick<LeituraRegistro, "data_hora_1" | "data_hora_2">;

// Chave "YYYY-MM-DD" do dia local de um instante. Os registros chegam em UTC,
// então o dia precisa ser resolvido no fuso do navegador (o "meu fuso"), senão
// leituras da noite (depois das 21h em UTC-3) cairiam no dia seguinte.
export const chaveDiaLocal = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Minutos lidos por dia local. Uma sessão que atravessa a meia-noite é dividida
// entre os dias: o trecho antes dela conta no dia de início e o restante no dia
// seguinte (somando inclusive mais de um dia, se for o caso).
export const minutosPorDiaLocal = (sessoes: readonly Sessao[]): Map<string, number> => {
  const porDia = new Map<string, number>();
  for (const s of sessoes) {
    const inicio = new Date(s.data_hora_1);
    const fim = new Date(s.data_hora_2);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) continue;

    let cursor = inicio;
    while (cursor < fim) {
      const meiaNoite = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
      );
      const fimTrecho = meiaNoite < fim ? meiaNoite : fim;
      const minutos = (fimTrecho.getTime() - cursor.getTime()) / 60000;
      const chave = chaveDiaLocal(cursor);
      porDia.set(chave, (porDia.get(chave) ?? 0) + minutos);
      cursor = fimTrecho;
    }
  }
  return porDia;
};
