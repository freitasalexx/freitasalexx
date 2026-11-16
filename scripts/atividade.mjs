// Gera o painel de atividade do perfil (assets/atividade-claro.svg e assets/atividade-escuro.svg).
// Fonte: calendário de contribuições da API GraphQL do GitHub, na visão pública do perfil.
// Uso: GITHUB_TOKEN=... LOGIN=freitasalexx node scripts/atividade.mjs
// Roda todo dia pelo workflow .github/workflows/atividade.yml; sem dependência externa.

import { mkdirSync, writeFileSync } from 'node:fs';

const LOGIN = process.env.LOGIN || 'freitasalexx';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('falta GITHUB_TOKEN'); process.exitCode = 1; }

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // weekday da API: 0 = domingo

const TEMAS = {
  claro: { fundo: '#ffffff', borda: '#d1d9e0', grade: '#e6eaef', texto: '#1f2328', texto2: '#59636e', marca: '#C15F3C' },
  escuro: { fundo: '#0d1117', borda: '#3d444d', grade: '#262c36', texto: '#f0f6fc', texto2: '#9198a1', marca: '#D4774F' },
};
const FONTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

const fmt = (n) => n.toLocaleString('pt-BR');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function buscar() {
  const agora = new Date();
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 11, 1));
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){
    restrictedContributionsCount contributionCalendar{totalContributions weeks{contributionDays{date contributionCount weekday}}}}}}`;
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'perfil-atividade' },
    body: JSON.stringify({ query, variables: { login: LOGIN, from: inicio.toISOString(), to: agora.toISOString() } }),
  });
  const j = await r.json();
  if (!r.ok || j.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 300)}`);
  const c = j.data.user.contributionsCollection;
  const dias = c.contributionCalendar.weeks.flatMap((w) => w.contributionDays);
  return { total: c.contributionCalendar.totalContributions, privadas: c.restrictedContributionsCount, dias, inicio };
}

function calcular({ total, privadas, dias, inicio }) {
  const ativos = dias.filter((d) => d.contributionCount > 0).length;
  let maior = 0, corrida = 0;
  for (const d of dias) { corrida = d.contributionCount > 0 ? corrida + 1 : 0; maior = Math.max(maior, corrida); }
  let i = dias.length - 1;
  if (i >= 0 && dias[i].contributionCount === 0) i--; // hoje ainda sem contribuição não quebra a sequência
  let atual = 0;
  for (; i >= 0 && dias[i].contributionCount > 0; i--) atual++;

  const meses = [];
  for (let k = 0; k < 12; k++) {
    const dt = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + k, 1));
    const chave = dt.toISOString().slice(0, 7);
    const soma = dias.filter((d) => d.date.startsWith(chave)).reduce((a, d) => a + d.contributionCount, 0);
    meses.push({ rotulo: MESES[dt.getUTCMonth()], soma });
  }
  while (meses.length > 6 && meses[0].soma === 0) meses.shift(); // meses vazios do início saem do gráfico (o total segue de 12 meses)
  const porDia = ORDEM_DIAS.map((w, k) => ({
    rotulo: DIAS[k],
    soma: dias.filter((d) => d.weekday === w).reduce((a, d) => a + d.contributionCount, 0),
  }));
  const ultimo = dias.at(-1)?.date || new Date().toISOString().slice(0, 10);
  return { total, privadas, ativos, totalDias: dias.length, maior, atual, meses, porDia, ultimo };
}

function passoBonito(max, alvo = 3) {
  const bruto = max / alvo || 1;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const m = bruto / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// coluna com cantos de 4px só no topo (ponta do dado), base reta
const coluna = (x, yBase, w, h) => {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${yBase}V${yBase - h + r}Q${x},${yBase - h} ${x + r},${yBase - h}H${x + w - r}Q${x + w},${yBase - h} ${x + w},${yBase - h + r}V${yBase}Z`;
};
// barra horizontal com cantos de 4px só na ponta direita
const barra = (x, y, w, h) => {
  if (w <= 0) return '';
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
};

function svg(d, t) {
  const W = 880, H = 450, P = 32;
  const [a, m, dd] = d.ultimo.split('-');
  const nota = d.privadas > 0 ? 'inclui contribuições em repositórios privados · ' : '';
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">`);
  out.push(`<title id="t">Atividade no GitHub nos últimos 12 meses</title>`);
  out.push(`<desc id="d">${esc(`${fmt(d.total)} contribuições, ${d.ativos} dias ativos, sequência atual de ${d.atual} dias, maior sequência de ${d.maior} dias. Por mês: ${d.meses.map((x) => `${x.rotulo} ${x.soma}`).join(', ')}. Por dia da semana: ${d.porDia.map((x) => `${x.rotulo} ${x.soma}`).join(', ')}.`)}</desc>`);
  out.push(`<g font-family="${FONTE}">`);
  out.push(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.fundo}" stroke="${t.borda}"/>`);
  out.push(`<text x="${P}" y="${P + 14}" font-size="18" font-weight="600" fill="${t.texto}">Atividade nos últimos 12 meses</text>`);
  out.push(`<text x="${W - P}" y="${P + 14}" font-size="12" text-anchor="end" fill="${t.texto2}">${esc(nota)}atualizado em ${dd}/${m}/${a}</text>`);

  // números: um herói e três blocos
  const yNum = P + 86;
  out.push(`<text x="${P}" y="${yNum}" font-size="48" font-weight="600" fill="${t.texto}">${fmt(d.total)}</text>`);
  out.push(`<text x="${P}" y="${yNum + 24}" font-size="13" fill="${t.texto2}">contribuições</text>`);
  const blocos = [
    [fmt(d.ativos), `dias ativos de ${d.totalDias}`],
    [`${d.atual} ${d.atual === 1 ? 'dia' : 'dias'}`, 'sequência atual'],
    [`${d.maior} dias`, 'maior sequência'],
  ];
  blocos.forEach(([v, r], k) => {
    const x = 300 + k * 190;
    out.push(`<text x="${x}" y="${yNum}" font-size="28" font-weight="600" fill="${t.texto}">${esc(v)}</text>`);
    out.push(`<text x="${x}" y="${yNum + 24}" font-size="13" fill="${t.texto2}">${esc(r)}</text>`);
  });

  // por mês: colunas
  const yTit = 210, x0 = P + 34, larg = 470, yBase = H - 58, alt = yBase - (yTit + 26);
  out.push(`<text x="${P}" y="${yTit}" font-size="13" font-weight="600" fill="${t.texto2}">Por mês</text>`);
  const maxM = Math.max(1, ...d.meses.map((x) => x.soma));
  const passo = passoBonito(maxM);
  const topo = Math.ceil(maxM / passo) * passo;
  for (let v = 0; v <= topo; v += passo) {
    const y = yBase - (v / topo) * alt;
    out.push(`<line x1="${x0}" x2="${x0 + larg}" y1="${y}" y2="${y}" stroke="${t.grade}" stroke-width="1"/>`);
    out.push(`<text x="${x0 - 8}" y="${y + 4}" font-size="11" text-anchor="end" fill="${t.texto2}" style="font-variant-numeric:tabular-nums">${fmt(v)}</text>`);
  }
  const n = d.meses.length, ult = n - 1;
  const slot = larg / n, bw = Math.min(24, slot - 8);
  const iMax = d.meses.findIndex((x) => x.soma === maxM);
  d.meses.forEach((x, k) => {
    const cx = x0 + k * slot + slot / 2, h = (x.soma / topo) * alt;
    out.push(`<path d="${coluna(cx - bw / 2, yBase, bw, h)}" fill="${t.marca}"/>`);
    out.push(`<text x="${cx}" y="${yBase + 18}" font-size="11" text-anchor="middle" fill="${t.texto2}">${x.rotulo}${k === ult ? '*' : ''}</text>`);
    if (k === iMax || k === ult) out.push(`<text x="${cx}" y="${yBase - h - 6}" font-size="11" font-weight="600" text-anchor="middle" fill="${t.texto}">${fmt(x.soma)}</text>`);
  });
  out.push(`<text x="${x0}" y="${H - 16}" font-size="11" fill="${t.texto2}">* mês em curso</text>`);

  // por dia da semana: barras horizontais com o valor na ponta
  const xD = 580, xB = xD + 36, largB = W - P - xB - 44, alturaB = 16, gapB = 10;
  out.push(`<text x="${xD}" y="${yTit}" font-size="13" font-weight="600" fill="${t.texto2}">Por dia da semana</text>`);
  const maxD = Math.max(1, ...d.porDia.map((x) => x.soma));
  d.porDia.forEach((x, k) => {
    const y = yTit + 22 + k * (alturaB + gapB), w = (x.soma / maxD) * largB;
    out.push(`<text x="${xD}" y="${y + 12}" font-size="12" fill="${t.texto2}">${x.rotulo}</text>`);
    out.push(`<line x1="${xB}" x2="${xB}" y1="${y - 4}" y2="${y + alturaB + 4}" stroke="${t.grade}" stroke-width="1"/>`);
    out.push(`<path d="${barra(xB, y, w, alturaB)}" fill="${t.marca}"/>`);
    out.push(`<text x="${xB + w + 6}" y="${y + 12}" font-size="11" fill="${t.texto}" style="font-variant-numeric:tabular-nums">${fmt(x.soma)}</text>`);
  });

  out.push('</g></svg>');
  return out.join('\n');
}

if (TOKEN) {
  const dados = calcular(await buscar());
  mkdirSync('assets', { recursive: true });
  for (const [nome, tema] of Object.entries(TEMAS)) writeFileSync(`assets/atividade-${nome}.svg`, svg(dados, tema) + '\n');
  console.log(`ok: ${dados.total} contribuições (${dados.privadas} privadas na visão pública), ${dados.ativos} dias ativos, sequência ${dados.atual}/${dados.maior}`);
}
