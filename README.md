# Hell Protocol — FPS Web

Jogo de tiro tático em primeira pessoa que roda **direto no navegador**, sem instalação e offline. Motor de raycasting próprio (640×400), **economia estilo CS** ($ por abate, menu de compra com 10s no início do round), **sistema de XP/nível persistente em localStorage** (barra animada no fim de cada rodada), cinco armas com viewmodels detalhados e sombreados, **seis arenas selecionáveis com temas visuais próprios** (Depósito, Pátio, Silo, Dunas, Oásis e Forja — chão, teto e paleta de muros exclusivos de cada arena), **bots com pathfinding BFS** (patrulham, rondeiam perto do jogador, perseguem contornando paredes, fazem strafe em combate), animação de morte em 2 estágios, pickups, minimapa tático, recuo/fumaça/clarão nas armas e sons sintetizados em tempo real.

## Como jogar

0. **Jogue online (GitHub Pages):** https://ricardoca.github.io/hellprotocol/
1. Dê um **duplo clique em `index.html`** (abre no navegador padrão). Ou, se preferir, sirva a pasta:
   - `python servidor.py` e acesse `http://localhost:8000/hellprotocol/` — **use este servidor para o multiplayer**: ele desativa o cache, garantindo que o PC e o celular executem sempre a versão mais recente.
2. Clique em **JOGAR** (isso também ativa o mouse-lock para mirar).

### Controles no celular

No celular os controles aparecem automaticamente durante o combate (jogue na **horizontal** para a melhor experiência):

- **Joystick virtual** (canto inferior esquerdo) — analógico: encoste um pouco para andar devagar, empurre até a borda para correr
- **Arrastar na tela** — mirar/girar a câmera (multi-toque: dá para mirar enquanto anda)
- **FOGO** (canto inferior direito) — segure para armas automáticas
- **REC** — recarregar · **COMPRA** — abre o menu de compra · **PAUSA** e **MAPA** — coluna à direita, abaixo do minimapa
- **Slots 1-5** (base central-esquerda) — trocar de arma tocando

### Controles (teclado e mouse)

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

## Multiplayer

1. Um jogador escolhe **Multiplayer → Host → Iniciar Servidor** — o jogo mostra o **código da sala (6 dígitos)** em destaque.
2. Os outros jogadores escolhem **Multiplayer → Entrar na Sala**, digitam os **6 dígitos** e conectam — sem copiar/colar nada.
3. No **mesmo navegador/aba** os servidores aparecem automaticamente na lista (botão "Entrar") — dispensa o código.
4. O host escolhe o **mapa** no dropdown e clica em **Iniciar Partida** — todos começam na mesma arena.

**Como funciona:** a sala é sinalizada por **MQTT em brokers públicos gratuitos** (EMQX, HiveMQ e Mosquitto — o jogo conecta a **todos de uma vez** e publica/escuta em todos, com retransmissão automática das mensagens que se perderem e reconexão em loop dos sinalizadores oscilantes) — o SDP de conexão (oferta/resposta) viaja automaticamente pelos tópicos `hp/<código>/…`, substituindo o antigo convite gigante de copiar/colar. A conexão em si é **WebRTC P2P direto** (o cliente MQTT foi implementado do zero neste projeto — nenhuma biblioteca externa).

**Sinalização própria (API no Vercel):** quando implantado no Vercel com um **KV (Upstash) conectado ao projeto**, o jogo usa automaticamente a API própria (`/api/sala/<código>/<ação>`) em vez do MQTT — o status mostra `sinalização: API`. Sem KV configurado, o `/api/ping` responde 503 e o jogo volta ao MQTT. **Importante: a sinalização é por origem** — host e convidados precisam abrir o jogo pela **mesma URL**. Se o host roda em `localhost` e o celular abre pelo Vercel/GitHub Pages, eles usam sistemas de sinalização diferentes e **nunca se encontram** (o celular vê "Sala não encontrada"). Nesse caso: ou ambos usam a mesma URL (ex.: `http://IP-DO-PC:8000` via `servidor.py` na mesma rede), ou configure `API_EXTERNA` no topo do `net.js` com a URL do Vercel para que o localhost também sinalize pela API.

**GitHub Pages:** a versão online usa um **Service Worker** (rede-primeiro, sem cache HTTP) — depois de qualquer atualização publicada, um único recarregamento já traz a versão nova no PC e no celular. Confira sempre a **build** no menu (v12 ou maior).

**Jogar entre redes diferentes:** o STUN do Google tenta a conexão direta entre os aparelhos — funciona em muitas combinações de redes (quando o NAT permite), mas **não é garantido** (NATs simétricos bloqueiam sem TURN; o único TURN público gratuito — openrelay.metered.ca — saiu do ar e foi removido). **Na mesma rede Wi-Fi a conexão é sempre direta** pelos candidatos de rede local. Se a sala conectar ("Sala encontrada") mas a partida não abrir, a tela avisa — nesse caso conecte os dois aparelhos no mesmo Wi-Fi.

**Diagnóstico:** no console do navegador, `Net._testMqtt()` confere se o servidor de sinalização está acessível e `Net._roomState()` mostra a sala e os pares. A entrada na sala é por código de 6 dígitos (1 milhão de combinações) — trate o código como senha temporária e feche o servidor quando terminar. Se ao entrar **nada acontecer**, confira se **ambos os aparelhos** mostram a mesma **build** (v12 ou maior — aparece na tela de entrar na sala e no menu Multiplayer); navegador antigo em cache é a causa mais comum.

## Ferramentas de desenvolvimento (opcionais, requerem Node.js)

- `node dev-preview.js` — rasterizador 2D headless que gera PNGs reais do jogo em `dev-out/`: os viewmodels das 3 armas, os 7 frames dos soldados e uma cena completa com bot à frente — usado para validar a arte sem abrir o navegador.
- `node dev-test-map.js` — flood-fill: confere que todos os spawns e pickups são alcançáveis nos 3 mapas.
- `node dev-smoke.js` — simula o jogo por ~80s: menu de compra (debitar/preencher), pausa de spawn com menu aberto, combate com recompensa (fuzil e escopeta), bônus de rodada, **XP/nível com persistência (F5 simulado)**, morte/retry e maratona sem exceções.
- `node dev-test-api.js` — teste de fumaça da API de sinalização (modo memória, sem KV): abre a sala, entra como convidado, troca oferta/resposta e valida os códigos HTTP de erro — confirma o ciclo completo sem navegador nem Vercel.

O jogo expõe `window.__OT` (estado, spriteList, mapInfo) e `Engine.debug` apenas como ganchos de depuração para esses testes — podem ser ignorados em uso normal. A build atual aparece no console do navegador (`game.js build vN`) e no menu Multiplayer — confira se **ambos os aparelhos** estão na mesma build antes de testar.
