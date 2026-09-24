/** Categorisers (guarantees, clauses, sector, term kind) and the per-category count.
 *  Inputs are Portuguese phrases because that is the language of the source documents. */
import { categoriseClause, categoriseGuarantee, categoriseSector, countByCategory, termKindOf } from "../lib/categories.ts";
import { check, done, section } from "./harness.mts";

section("guarantees: free text -> category");
check("real estate", categoriseGuarantee("Imóvel matrícula n. 1234 do Cartório") === "Real estate / mortgage");
check("bond insurance", categoriseGuarantee("Apólice de seguro garantia judicial") === "Bond insurance");
check("bank guarantee", categoriseGuarantee("Carta de fiança bancária do Banco X") === "Bank guarantee");
check("fiduciary lien", categoriseGuarantee("Alienação fiduciária de bens móveis") === "Fiduciary lien / assignment");
check("court deposit", categoriseGuarantee("Depósito em juízo do valor integral") === "Attachment / court deposit");
check("vehicle", categoriseGuarantee("Veículos e maquinário da empresa") === "Movable asset / vehicle");
check("unknown -> Other", categoriseGuarantee("algo totalmente atípico xyz") === "Other guarantees");

section("clauses: free text -> category");
check("tax-loss offset", categoriseClause("Utilização de prejuízo fiscal e base de cálculo negativa da CSLL") === "Tax-loss offset (CSLL)");
check("no new settlement / termination", categoriseClause("Vedação de nova transação por 2 anos em caso de rescisão") === "No new settlement / termination");
check("70 % balance cap", categoriseClause("desconto limitado a 70% do saldo da dívida") === "70 % balance cap");
check("credit confirmation", categoriseClause("confirmação dos créditos pela autoridade competente em cinco anos") === "Credit confirmation (legal term)");
check("unknown -> Other", categoriseClause("cláusula sui generis qualquer") === "Other clauses");

section("sector: free text -> canonical category");
check("plain agribusiness", categoriseSector("Agronegócio") === "Agribusiness");
check("sugar and ethanol", categoriseSector("Agronegócio (usina de açúcar/etanol)") === "Agribusiness");
check("construction", categoriseSector("Construção civil/incorporação imobiliária") === "Construction and real estate");
check("charity hospital", categoriseSector("Saúde/Hospitalar (entidade filantrópica)") === "Healthcare");
check("primary segment wins: healthcare over construction", categoriseSector("Saúde/Construção civil e incorporação imobiliária") === "Healthcare");
check("urban transport", categoriseSector("Transporte coletivo urbano (ônibus)") === "Transport and logistics");
check("textiles -> manufacturing", categoriseSector("Têxtil") === "Manufacturing");
check("municipal administration", categoriseSector("Administração pública municipal") === "Public sector and pensions");
check("football", categoriseSector("futebol/entretenimento") === "Sports and entertainment");
check("lowercase education", categoriseSector("educação") === "Education");
check("retail / e-commerce", categoriseSector("Varejo/E-commerce") === "Retail and wholesale");
check("English sentinel preserved", categoriseSector("Not identified") === "Not identified");
check("legacy Portuguese sentinel preserved", categoriseSector("Não identificado") === "Not identified");
check("unknown -> Other", categoriseSector("Atividade totalmente atípica xyz") === "Other sectors");

section("term kind: modality/title -> original vs amendment");
check("full TI = original", termKindOf("Transação Individual") === "Original term");
check("different casing = original", termKindOf("Transação individual (recuperação judicial)") === "Original term");
check("amendment detected", termKindOf("Transação Individual (3º Termo Aditivo)") === "Amendment / renegotiation");
check("renegotiation detected", termKindOf("Termo Aditivo de Transação Individual (repactuação)") === "Amendment / renegotiation");
check("amendment only in the title", termKindOf("Transação Individual", "Primeiro Termo Aditivo — Empresa X") === "Amendment / renegotiation");
check("guarantee substitution = amendment", termKindOf("Transação individual - Termo de Revisão (Substituição de Garantia)") === "Amendment / renegotiation");
check("sentinel preserved", termKindOf("Not identified") === "Not identified");
check("empty = not identified", termKindOf("") === "Not identified");

section("count: distinct per term");
const terms = [
  { g: ["Imóvel matrícula 1", "Imóvel matrícula 2"] }, // two properties in one term count once
  { g: ["Seguro garantia"] },
  { g: [] },
];
const c = countByCategory(terms, (x) => x.g, categoriseGuarantee);
const estate = c.find((x) => x.label === "Real estate / mortgage");
check("real estate counts 1 (distinct per term, not 2)", estate?.value === 1);
check("empty category never enters", !c.some((x) => x.value === 0));

done();
