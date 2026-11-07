# ENEM Relâmpago

App de estudo do 1º dia do ENEM: conteúdo antes da questão, resposta na hora, como resolver, pegadinhas, cartas de assunto, plano e IA para dúvidas.

## Rodar

```bash
npm install --strict-ssl=false
npm run dev
```

## Adicionar outro ano

```bash
npm run importar -- 2024
```

O comando baixa a prova e o gabarito oficiais do Inep, recorta as questões e gera `sources/review/<ano>-d1/` para conferência. As questões só aparecem no app depois de explicadas em `data/explain/*.json`; a lista do que falta fica em `data/pendentes.json`.

Cada explicação precisa de `id`, `assunto`, `conteudo`, `passos`, `resposta` e `pegadinhas`. `npm run data` valida tudo.

## IA de dúvidas

Usa a API do Hugging Face direto do navegador, com tokens salvos só no aparelho. Nunca coloque tokens no código.