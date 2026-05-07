# KaraokeNow — Frontend

Interface web em Next.js 15 + React 19 + TypeScript para buscar músicas e fazer karaokê com remoção de vocais em tempo real.

## Pré-requisitos

- Node.js 18+
- Backend rodando em `http://localhost:8000` (veja `karaoke-back/README.md`)

## Instalação

```bash
npm install
```

## Rodando

```bash
npm run dev
```

Acesse `http://localhost:3000` no navegador.

> O Next.js faz proxy automático de `/api/*` para `http://localhost:8000/api/*`, então o backend precisa estar rodando antes de usar o frontend.

## Build de produção

```bash
npm run build
npm start
```

## Funcionalidades

- **Busca** de músicas diretamente do YouTube
- **Preview ao passar o mouse** sobre o card — toca 8 segundos da música
- **Página da música** com:
  - Loading com barra de progresso em % durante a remoção de vocais
  - Player com seek, volume e controles de ±10s
  - Switch **Original ↔ Karaokê** — ambas as versões tocam simultaneamente, o switch decide qual está no mudo
  - Letra da música carregada automaticamente

## Estrutura

```
src/
├── app/
│   ├── page.tsx              # Página inicial (busca)
│   └── song/[id]/page.tsx    # Página da música (player + letra)
└── components/
    ├── SearchBar/            # Campo de busca
    ├── SongCard/             # Card com preview ao hover
    └── SongGrid/             # Grade de resultados
```

## Ordem de inicialização

1. Suba o **backend** primeiro (porta 8000)
2. Suba o **frontend** (porta 3000)
3. Acesse `http://localhost:3000`
