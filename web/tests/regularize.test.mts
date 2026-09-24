/** Regularize (PGFN) parsers: spreadsheet and detailed PDF text. Synthetic inputs only; the
 *  labels are Portuguese because that is what the documents print. Identifiers are placeholders
 *  with invalid check digits. */
import { parsePdfText, parseRegularizeTable } from "../lib/regularize.ts";
import { check, done, near, section } from "./harness.mts";

section("1. spreadsheet parser: synthetic cases");
{
  const csv = [
    "Relatório Consolidado da Dívida;;;",
    "Você possui 3 inscrições em Dívida Ativa da União e do FGTS, totalizando R$ 600,00.;;;",
    "Inscrição;Valor Total Consolidado;Natureza da Inscrição;Situação;Data;Nome Devedor Principal;CPF/CNPJ Devedor Principal",
    "11 1 11 111111-11;100,50;Tributária;ATIVA;01/01/2026;EMPRESA X;00.000.000/0001-00",
    "11 2 22 222222-22;199,50;Previdenciária;ATIVA;01/01/2026;EMPRESA X;00.000.000/0001-00",
    "11 3 33 333333-33;300,00;Simples Nacional;ATIVA;01/01/2026;EMPRESA X;00.000.000/0001-00",
    ";;;;;;",
  ].join("\r\n");
  const r = parseRegularizeTable(csv);
  check("general = Tributária + Simples Nacional (400.50)", near(r.general.principal, 400.5));
  check("social security = Previdenciária (199.50)", near(r.socialSecurity.principal, 199.5));
  check("3 registrations counted", r.entries === 3);
  check("debtor name and tax id extracted", r.name === "EMPRESA X" && r.taxId === "00.000.000/0001-00");
  check("components NOT itemised (everything goes to principal)", r.componentsItemised === false);
  check("empty / amount-less rows ignored", r.totalFound === 600);
}

section("2. spreadsheet parser: BOM and missing header");
{
  const withBom = "﻿Inscrição;Valor Total Consolidado;Natureza da Inscrição\n1;10,00;Tributária\n";
  check("UTF-8 BOM is stripped before the header match", parseRegularizeTable(withBom).entries === 1);
  const noHeader = "some;random;text\n1;10,00;Tributária\n";
  const r = parseRegularizeTable(noHeader);
  check("no header -> nothing parsed", r.entries === null && r.totalFound === 0);
}

section("3. detailed PDF parser: synthetic case");
{
  const text = [
    "Relatório Consolidado da Dívida",
    "Devedor: EMPRESA X CPF/CNPJ: 00.000.000/0001-00",
    "Total de inscrições ativas: 2",
    "Tributária (1) Principal R$ 100,00 Multa R$ 20,00 Juros de mora R$ 10,00 Encargo legal R$ 5,00",
    "Previdenciária (1) Principal R$ 50,00 Multa R$ 8,00 Juros de mora R$ 4,00 Encargo legal R$ 2,00",
  ].join("\n");
  const r = parsePdfText(text);
  check("general components extracted (100/20/10/5)", near(r.general.principal, 100) && near(r.general.fine, 20) && near(r.general.interest, 10) && near(r.general.charges, 5));
  check("social-security components extracted (50/8/4/2)", near(r.socialSecurity.principal, 50) && near(r.socialSecurity.charges, 2));
  check("components itemised = true", r.componentsItemised === true);
  check("debtor and tax id from the header", r.name === "EMPRESA X" && r.taxId === "00.000.000/0001-00");
  check("total of active registrations", r.entries === 2);
  check("totalFound sums both natures (199)", near(r.totalFound, 199));
}

section("4. detailed PDF parser: several registrations per nature are summed");
{
  const text = [
    "Devedor: EMPRESA Y CPF/CNPJ: 11.111.111/0001-11",
    "Tributária (2) Principal R$ 100,00 Multa R$ 10,00 Juros de mora R$ 5,00 Encargo legal R$ 1,00",
    "Principal R$ 200,00 Multa R$ 20,00 Juros de mora R$ 10,00 Encargo legal R$ 2,00",
    "FGTS (1) Principal R$ 30,00 Multa R$ 3,00 Juros de mora R$ 1,50 Encargo legal R$ 0,50",
  ].join(" ");
  const r = parsePdfText(text);
  check("two Tributária blocks summed into general principal (300)", near(r.general.principal, 330));
  check("FGTS booked as general", near(r.general.charges, 3.5));
  check("no social security in this report", r.socialSecurity.principal === 0);
  check("entries unknown when the total line is missing", r.entries === null);
}

done();
