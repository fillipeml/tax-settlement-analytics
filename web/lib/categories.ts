/** Categorisation of FREE-TEXT fields of the extraction into canonical groups.
 *
 *  The extraction returns guarantees, clauses, sector and modality as free text (the literal
 *  phrase from the term), so counting exact strings produces hundreds of near-unique labels:
 *  the sector had 699 distinct values for 1,202 terms, 583 of them seen once. Each phrase is
 *  reduced to a category by keyword so charts and filters are readable again. Heuristic, and
 *  order matters (the first matching rule wins); an "Other" category guarantees nothing is lost.
 *
 *  Keywords stay in Portuguese: they match the language of the source documents.
 */

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

interface Rule {
  category: string;
  keywords: string[];
}

const GUARANTEE_RULES: Rule[] = [
  { category: "Fiduciary lien / assignment", keywords: ["fiduciar"] },
  { category: "Bond insurance", keywords: ["seguro"] },
  { category: "Bank guarantee", keywords: ["fianc", "carta de fianc"] },
  { category: "Real estate / mortgage", keywords: ["imovel", "hipotec", "matricula", "terreno", "predio", "imob"] },
  { category: "Attachment / court deposit", keywords: ["penhora", "deposito", "arrolamento", "constric", "bloqueio", "juizo"] },
  { category: "Movable asset / vehicle", keywords: ["veiculo", "maquin", "equipamento", "bem movel", "movei"] },
  { category: "Personal guarantee", keywords: ["aval", "fiador", "pessoal"] },
  { category: "Receivables", keywords: ["credito", "recebiv", "creditor", "precatorio"] },
];

const CLAUSE_RULES: Rule[] = [
  { category: "Tax-loss offset (CSLL)", keywords: ["prejuizo fiscal", "base de calculo negativa", "bcn", "csll"] },
  { category: "No new settlement / termination", keywords: ["vedacao", "nova transacao", "rescis"] },
  { category: "Guarantees and liens kept", keywords: ["gravame", "manutencao de garantia", "manutencao das garantia"] },
  { category: "Debt acknowledgement", keywords: ["confissao", "confesso", "reconhec", "irrevogavel", "irretratavel"] },
  { category: "70 % balance cap", keywords: ["70% do saldo", "limitado a 70", "setenta por cento"] },
  { category: "Credit confirmation (legal term)", keywords: ["autoridade competente", "confirmacao dos credito", "cinco anos"] },
  { category: "Waiver of defences / lawsuits", keywords: ["renuncia", "desistenc", "abdica", "desiste"] },
  { category: "Ongoing tax compliance", keywords: ["regularidade", "em dia", "tempestiv", "obrigacoes correntes", "parcelas vincendas"] },
];

function categorise(text: string, rules: Rule[], fallback: string): string {
  const t = norm(text);
  for (const r of rules) if (r.keywords.some((k) => t.includes(k))) return r.category;
  return fallback;
}

export const categoriseGuarantee = (g: string) => categorise(g, GUARANTEE_RULES, "Other guarantees");

export const categoriseClause = (c: string) => categorise(c, CLAUSE_RULES, "Other clauses");

/* ----- Sector ----- */

/** The extraction writes the MAIN sector first ("Saúde/Construção civil" is a healthcare
 *  company, not a builder), so the first segment (before "/", "(", "-" or ",") is matched
 *  first and the whole text only afterwards. */
const SECTOR_RULES: Rule[] = [
  { category: "Agribusiness", keywords: ["agroneg", "agroind", "sucroalco", "usina", "frigorif", "cerealis", "avicult", "pecuar", "acucar", "etanol", "florest", "vinicola", "pesca", "aquicult", "cafe", "graos", "sementes", "agricola", "agropecuar", "rural", "madeire", "serraria", "curtume", "couro"] },
  { category: "Food and beverages", keywords: ["aliment", "bebida", "cervej", "aguardente", "laticin", "panifica", "doces", "refeic", "food", "restaurante", "supermerc", "moagem", "carnes", "pescado", "frios", "torrone", "nutric"] },
  { category: "Construction and real estate", keywords: ["constru", "imobiliar", "incorpora", "engenharia", "habitacion", "premolda", "pavimenta", "empreendimento", "urbaniz", "arquitet", "imoveis", "infraestrutura", "montage", "instalac", "climatiza", "shopping", "estacionamento", "locac"] },
  { category: "Transport and logistics", keywords: ["transport", "logistic", "viacao", "onibus", "rodovi", "aereo", "aviacao", "naval", "portuar", "armazen", "aduaneir", "navega", "estaleiro", "offshore", "guincho", "frete", "mobilidade", "riocard", "vale-transporte"] },
  { category: "Healthcare", keywords: ["saude", "hospital", "medic", "clinic", "santa casa", "farmac", "drogaria", "laborator", "diagnostic", "odonto", "psiquiatr", "maternidade", "ortoped", "fitness", "academia", "estetic", "beleza"] },
  { category: "Manufacturing", keywords: ["industri", "metalurg", "metalmec", "siderurg", "fundic", "usinagem", "caldeiraria", "plastic", "quimic", "embalag", "papel", "celulose", "textil", "confecc", "vestuario", "calcad", "moveleir", "moveis", "vidro", "ceramic", "borracha", "autopec", "automotiv", "automobilist", "aco ", "inox", "aluminio", "cutelaria", "eletroeletron", "eletrodomestic", "brinquedo", "cosmetic", "grafica", "editora", "manufatur", "fabrica", "refratari", "elastomer", "espuma", "compensado", "manometro", "extrusao", "cimento", "sal", "gelo", "tintas", "adesivo", "acrilic", "otic", "talheres", "botoes", "evaporador", "aeroespacial", "defesa"] },
  { category: "Retail and wholesale", keywords: ["comerci", "varej", "atacad", "distribui", "importa", "exporta", "concession", "veiculo", "pneus", "loja", "boutique", "joias", "decorac", "tapete", "ferragen", "e-commerce", "franquia", "utilidades", "auto posto", "combustive", "posto"] },
  { category: "Education", keywords: ["educa", "ensino", "escola", "universi", "faculdade", "cursos", "treinament"] },
  { category: "Public sector and pensions", keywords: ["administracao publica", "municipal", "autarquia", "previdencia", "rpps", "consorcio intermunicipal", "empresa publica", "servidores publicos", "estadual", "setor publico"] },
  { category: "Services", keywords: ["servic", "terceiriza", "mao de obra", "consultor", "advocacia", "advogad", "juridic", "seguranca", "vigilancia", "limpeza", "conservacao", "hotel", "turismo", "eventos", "buffet", "teleatend", "contact center", "call center", "corretag", "seguros", "recursos humanos", "bpo", "associac", "sindic", "religios", "filantrop", "beneficen", "assistencia social", "organizacao da sociedade", "administracao de bens", "participac"] },
  { category: "Technology and media", keywords: ["tecnolog", "informatica", "software", "sistemas", "telecom", "eletronic", "midia", "televisao", "radiodifus", "jornal", "editorial", "comunicac", "publicidade", "marketing", "fintech", "pagament", "impressao"] },
  { category: "Energy, mining and sanitation", keywords: ["energia", "eletric", "mineracao", "minerad", "carvao", "marmore", "granito", "rochas", "gesso", "saneamento", "residuo", "ambiental", "agua", "esgoto", "petroleo", "gas", "oleo"] },
  { category: "Financial", keywords: ["financeir", "banc", "credito e financ", "corretora", "cambio", "valores mobiliarios"] },
  { category: "Sports and entertainment", keywords: ["futebol", "esporte", "entreten", "clube", "canoagem", "olimpic", "parques tematic", "shows", "producao artistica"] },
];

/** First segment of the text (before the first separator): the main sector. */
const primarySegment = (s: string) => s.split(/[/(,–—-]/)[0];

export const NOT_IDENTIFIED_LABEL = "Not identified";

export function categoriseSector(sector: string): string {
  if (!sector || norm(sector).startsWith("not identified") || norm(sector).startsWith("nao identificado")) return NOT_IDENTIFIED_LABEL;
  const head = categorise(primarySegment(sector), SECTOR_RULES, "");
  return head || categorise(sector, SECTOR_RULES, "Other sectors");
}

/* ----- Modality -> term kind ----- */

/** The extracted modality has 241 text variants, nearly all "Transação Individual" worded
 *  differently. What matters analytically is separating ORIGINAL terms from AMENDMENTS and
 *  renegotiations, whose "discount" is not a new concession and distorts medians. */
export type TermKind = "Original term" | "Amendment / renegotiation" | "Not identified";

export function termKindOf(modality: string, title = ""): TermKind {
  const m = norm(modality || "");
  const t = norm(title || "");
  if (/aditiv|repactua|revisao|substituicao de garantia/.test(m) || /aditiv|repactua/.test(t))
    return "Amendment / renegotiation";
  if (!m || m.startsWith("not identified") || m.startsWith("nao identificado")) return "Not identified";
  return "Original term";
}

/** Counts in how many TERMS each category appears (distinct per term, so a term listing two
 *  guarantees of the same kind counts once). */
export function countByCategory<T>(
  terms: T[],
  extract: (t: T) => string[] | undefined,
  categoriser: (s: string) => string,
): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const t of terms) {
    const cats = new Set((extract(t) ?? []).map(categoriser));
    for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
