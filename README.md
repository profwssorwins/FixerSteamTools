# AmericanKey Auto-Fixer v3.0

Ferramenta automatizada para corrigir problemas de conexão e manifests desatualizados em jogos instalados via SteamTools/Lua.

## 🚀 Funcionalidades

- **Auto-Scan**: Detecta automaticamente jogos instalados na pasta `Steam/config/stplug-in/`.
- **Download Direto**: Conecta-se diretamente ao ManifestHub para baixar manifests atualizados.
- **Resiliência**:  Sistema de retry inteligente para lidar com erros de servidor (500) e limites de taxa (429).
- **Sem Dependência de Backend**: Executa toda a lógica de download no cliente, reduzindo gargalos.
- **Interface Amigável**: Menu interativo para selecionar quais jogos corrigir.

## 📋 Pré-requisitos

- Node.js instalad (versão 14 ou superior).
- Uma API Key válida do ManifestHub (obtenha em [Manifesthub](https://manifesthub1.filegear-sg.me/)).

## 🔧 Instalação

1. Clone ou baixe este repositório.
2. Abra o terminal na pasta do projeto.
3. Instale as dependências:

```bash
npm install
```

## ▶️ Como Usar

Para rodar a ferramenta diretamente pelo código fonte:

```bash
npm start
```

1. A ferramenta solicitará sua **ManifestHub API Key**.
2. Selecione os jogos que deseja corrigir na lista (Espaço para marcar).
3. Aguarde o processo finalizar.

## 📦 Compilar para .EXE

Você pode transformar este script em um executável standalone (sem precisar instalar Node.js em outras máquinas).

1. Instale o compilador globalmente:
   ```bash
   npm install -g pkg
   ```

2. Compile o projeto:
   ```bash
   pkg index.js --targets node18-win-x64 --output AmericanKeyFixer.exe
   ```
   *Ou use o script configurado:*
   ```bash
   npm run build
   ```

O executável será gerado na raiz da pasta.

## ⚠️ Notas Importantes

- A ferramenta espera 5 minutos entre atualizações de jogos diferentes para evitar bloqueios de API.
- Se ocorrerem erros 500 no download, a ferramenta tentará novamente automaticamente até 10 vezes.

## 📄 Licença

Este projeto é de uso livre para a comunidade.
