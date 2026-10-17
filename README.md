# Operação Tática — FPS Web

Jogo de tiro tático em primeira pessoa que roda **direto no navegador**, sem instalação e offline. Motor de raycasting próprio (640×400), **economia estilo CS** ($ por abate, menu de compra com 10s no início do round), **sistema de XP/nível persistente em localStorage** (barra animada no fim de cada rodada), cinco armas com viewmodels detalhados e sombreados, três arenas selecionáveis, **bots com pathfinding BFS** (patrulham, rondeiam perto do jogador, perseguem contornando paredes, fazem strafe em combate), animação de morte em 2 estágios, pickups, minimapa tático, recuo/fumaça/clarão nas armas e sons sintetizados em tempo real.

## Como jogar

1. Dê um **duplo clique em `index.html`** (abre no navegador padrão). Ou, se preferir, sirva a pasta:
   - `python -m http.server 8000` e acesse `http://localhost:8000/web-fps/`
2. Clique em **JOGAR** (isso também ativa o mouse-lock para mirar).

### Controles

| Tecla | Ação |
|---|---|
| `W A S D` | Mover |
| Mouse | Mirar |
| Clique esquerdo | Atirar |
| `R` | Recarregar |
| `1`-`5` | Trocar armas que você possui |
| `B` | Abrir/fechar o menu de compra (só durante o tempo de compra) |
| `Shift` | Andar devagar |
| `M` | Liga/desliga minimapa |
| `Esc` | Pausar (solta o mouse) |

**Objetivo:** elimine todos os bots da rodada. **Economia:** começa com $800; cada abate paga **$300** e cada rodada vencida **$1000**. Nos **10 segundos** iniciais de cada rodada, aperte **B** para abrir o menu de compra: **Pistola .50 ($650), Escopeta ($1800), Fuzil ($2500), Metralhadora ($3500), Colete ($1000) e Kit de Cura ($600)**. Enquanto o menu estiver aberto (ou o tempo de compra não acabar) **os bots não nascem**. **XP/nível:** cada abate dá **25 XP** e vencer a rodada **+100 XP** — no fim da rodada uma barra animada mostra o progresso até o próximo nível (cada nível pede 100×nível de XP). O nível fica no HUD abaixo do colete e **persiste em localStorage** (sobrevive ao F5). Colete **medkits** (vida), **coletes** (armadura) e **caixas de munição** pelo mapa. Bots alertados aparecem como pontos vermelhos no minimapa.

## Ferramentas de desenvolvimento (opcionais, requerem Node.js)

- `node dev-preview.js` — rasterizador 2D headless que gera PNGs reais do jogo em `dev-out/`: os viewmodels das 3 armas, os 7 frames dos soldados e uma cena completa com bot à frente — usado para validar a arte sem abrir o navegador.
- `node dev-test-map.js` — flood-fill: confere que todos os spawns e pickups são alcançáveis nos 3 mapas.
- `node dev-smoke.js` — simula o jogo por ~80s: menu de compra (debitar/preencher), pausa de spawn com menu aberto, combate com recompensa (fuzil e escopeta), bônus de rodada, **XP/nível com persistência (F5 simulado)**, morte/retry e maratona sem exceções.

O jogo expõe `window.__OT` (estado, spriteList, mapInfo) e `Engine.debug` apenas como ganchos de depuração para esses testes — podem ser ignorados em uso normal.
