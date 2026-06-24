# Mapa de cobertura — consolidação 8 → 3 (files/ do google-sheets-mcp)

Prova de que **todo conteúdo único** dos 8 originais foi preservado nos 3 novos.

| Original (8) | Linhas | → Novo arquivo | Conteúdo único preservado |
|---|---|---|---|
| QUICK_START_5_MINUTOS.md | 248 | **00_INICIO** | prompt de ativação, passos, 3 primeiros comandos (A/B/C), timeline semana 1, comandos úteis |
| QUICK_REFERENCE_6_REGRAS_OURO.md | 289 | **00_INICIO** | 6 regras (condensadas), 5 perguntas, checklist decisão, erros×correto, linguagem de rejeição, exemplo prático, referência de delta |
| INDICE_COMPLETO_PROJETO.txt | 370 | **00_INICIO** | roteiro de leitura, histórico de versões (FAQ/índice antigo descartado: referenciava arquivos inexistentes) |
| DESCRICAO_PROJETO_OFICIAL_CLAUDE_AI.md | 840 | **01_PROJETO** | identidade, missão/visão, arquitetura, 3 MCPs, 4 skills, 4 protocolos, **4 FORMATOS (exemplos)**, expectativas |
| ESPECIFICACAO_PROJETO_PERITO_DERIVATIVOS_B3.md | 671 | **01_PROJETO** | fluxo ETL, endpoints, **implementação (SQL, cron, backtest)**, métricas, checklist pré-prod |
| Instruções do Projeto do Claude AI.md | 330 | **01_PROJETO** + **02_SISTEMA** | princípio "nunca inventar", protocolos revisados, regras de ouro (já na V3.0) |
| INSTRUCOES_SISTEMA_V3.0_FINAL.md | 631 | **02_SISTEMA** | **6 regras de ouro**, escopo autorizado/proibido, governança anti-alucinação, validação sequencial, **fórmulas matemáticas**, 14 proibições, checklist pré-execução, cronograma, lembrete final |
| MANUAL_INSTRUCOES_PERITO_DERIVATIVOS.md | 462 | **02_SISTEMA** | comandos (5 + 3 avançados), como ler formatos, casos de uso, alertas×reação, troubleshooting, performance tracking, checklist diário, treinamento |

## Redundância removida (aparecia repetida em vários arquivos)
- Descrição dos 3 MCPs (em ~6 arquivos) → 1 vez no 01_PROJETO.
- 6 regras de ouro (em 4 arquivos) → completas no 02_SISTEMA, condensadas no 00_INICIO.
- Whitelist de 24 ativos (em 5 arquivos) → 1 vez por arquivo onde é útil.
- Parâmetros de risco (em todos) → tabela única por arquivo.
- 4 protocolos / 4 formatos (em 5 arquivos) → fluxos no 01, templates no 01, regras no 02.
- Prompt de ativação (em 3 arquivos) → 1 versão canônica (3 MCPs) no 00_INICIO.

## Conteúdo descartado de propósito (não é perda de informação)
- **Índice antigo** referenciava 4 arquivos que **não existem** na pasta (`DESCRICAO_..._COPIAR_COLAR.txt`, `AUDITORIA_..._2026-05-23.md`, `FORMATO_2_..._2026-05-23.md`, `README_PROJETO_COMPLETO.txt`). Referências mortas removidas.
- Cabeçalhos/assinaturas/decorações repetidos (status, datas, "plastifique na parede").

## Resultado
8 arquivos (160 KB) → **3 arquivos** (`00_INICIO.md`, `01_PROJETO.md`, `02_SISTEMA.md`), mantendo 100% da informação única e operacional.
