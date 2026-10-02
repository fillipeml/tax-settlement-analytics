# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's "Report a vulnerability" button on the repository's Security tab (private vulnerability reporting). Do not open a public issue.

You will get an acknowledgement within 72 hours and a fix or mitigation plan within 14 days for confirmed issues.

## Scope

This repository is a portfolio project, and it does **not** run on fictional data. The
committed corpus is public information the Brazilian federal government publishes about tax
settlements with legal entities: company names, corporate tax ids and the court case numbers
are as published. Four records that identified natural persons were removed before publication
and stay out.

So the scope worth reporting is anything that makes that worse than what the government already
published:

- A record identifying a natural person that survived the removal.
- A secret, credential or token committed anywhere in the tree.
- A path by which a document dropped into the simulator leaves the browser. It is processed
  client-side and nothing about it is stored or sent; a change that breaks that is a
  vulnerability here.
- A figure the simulator presents as a legal limit that is not one. The caps and terms come
  from Law 13,988/2020 and Ordinance 6,757/2022, and a wrong one is acted on by a lawyer.

## Supported versions

Only the `main` branch and the latest tagged release receive fixes.
