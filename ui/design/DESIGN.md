# WorldSync 2.0 — Sistema Visual Oficial

Versão 1.0 · Protótipo para aprovação visual antes da implementação WPF/XAML.

## 1. Princípios

O WorldSync 2.0 deve parecer um launcher premium para jogo: cinematográfico, seguro e imediatamente acionável. A interface não deve assumir a linguagem de um dashboard corporativo. O mundo é o protagonista; telemetria e infraestrutura aparecem como confirmação discreta de prontidão.

1. **Mundo primeiro:** nome, atmosfera e disponibilidade ocupam o hero.
2. **Ação inequívoca:** `ASSUMIR E INICIAR` é o principal ponto luminoso da tela.
3. **Confiança silenciosa:** cloud, integridade e sincronização comunicam segurança sem competir com a ação.
4. **Progressão legível:** o fluxo Assumir → Abrir jogo → Jogar → Encerrar e sincronizar é sempre visível.
5. **Fantasia contida:** panorama épico e materiais escuros; brilho e vidro só reforçam estado e profundidade.

## 2. Tokens fundamentais

### Cores

| Token | Valor | Uso |
|---|---:|---|
| `--bg-void` | `#061015` | fundo externo e áreas mais profundas |
| `--bg-shell` | `#08151B` | base do launcher |
| `--surface-1` | `#0C1B22` | painéis principais |
| `--surface-2` | `#11252C` | elementos elevados |
| `--surface-glass` | `rgba(13, 31, 38, .78)` | vidro discreto |
| `--border` | `rgba(137, 210, 205, .18)` | borda padrão |
| `--border-strong` | `rgba(72, 229, 204, .38)` | foco e seleção |
| `--text-1` | `#F5FBFA` | títulos e valores principais |
| `--text-2` | `#B5C8CB` | corpo e descrições |
| `--text-3` | `#789198` | rótulos e dados terciários |
| `--accent` | `#24E6C2` | ação, seleção e progresso |
| `--accent-deep` | `#079B85` | gradiente funcional do CTA |
| `--success` | `#39F2A8` | disponibilidade e saúde |
| `--warning` | `#F4C95D` | atenção e sincronização recente |
| `--danger` | `#FF6F7D` | falha e ação destrutiva |

Contraste mínimo: 4,5:1 para texto corrente; 3:1 para títulos grandes, ícones e gráficos essenciais. Estado nunca depende somente de cor: combinar ponto/ícone, rótulo e mensagem.

### Tipografia

- **Display:** Manrope, peso 700–800; fallback `Segoe UI Variable Display`, `Segoe UI`, sans-serif.
- **Interface e corpo:** Segoe UI Variable, Segoe UI, sans-serif.
- **Escala:** 12 / 14 / 16 / 18 / 24 / 32 / 48 px.
- Corpo: mínimo 16 px em conteúdo principal, entrelinha 1,55.
- Labels utilitários: 12–13 px, peso 650, tracking entre 0,04em e 0,10em.
- Números e unidades permanecem na mesma linha.

### Espaçamento

Base de 4 px. Escala oficial: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px.

- Espaço entre ícone e label: 12 px.
- Padding de controle: 12 × 16 px.
- Padding de card: 20–24 px.
- Gap de seção: 24 px.
- Margem estrutural do conteúdo: 28–32 px.

### Radius

- Pequeno: 8 px — chips, tags e controles compactos.
- Médio: 12 px — botões e células.
- Grande: 16 px — cards e painéis.
- Hero: 18 px.
- Pílula: 999 px — somente status e indicadores curtos.

### Sombras e glow

```css
--shadow-surface: 0 16px 40px rgba(0, 0, 0, .28);
--shadow-overlay: 0 24px 70px rgba(0, 0, 0, .42);
--glow-accent: 0 0 24px rgba(36, 230, 194, .32);
--glow-status: 0 0 18px rgba(57, 242, 168, .55);
```

Glows são exclusivos de CTA, foco e status ativo. Cards neutros não recebem halo decorativo.

## 3. Estrutura da aplicação

### Sidebar

- Largura desktop: 252–264 px.
- Fundo opaco mais escuro que o conteúdo, com separador vertical sutil.
- Marca WorldSync 2.0 no topo; ícone de nuvem em outline teal.
- Navegação: Início, Histórico, Diagnóstico e Configurações.
- Item selecionado usa fundo teal translúcido, borda e filete luminoso à esquerda.
- Rodapé contém o manifesto curto: “Sincronize aventuras. Jogue juntos, sempre.”
- Ícones outline consistentes, 20–22 px, stroke 1,8–2 px.

### Barra superior

- Integra o título da janela e o estado `Cloud online`.
- Estado inclui ponto luminoso e texto; não usar somente uma bolinha colorida.
- Controles de janela permanecem discretos e separados da navegação de produto.

### Hero

- Panorama de fantasia em largura total, com altura aproximada de 190–220 px em desktop.
- Arte deve concentrar a cidade/castelo no terço direito e manter área escura à esquerda para leitura.
- Overlay azul-petróleo escuro da esquerda para o centro; nunca aplicar um gradiente colorido sobre toda a interface.
- Identidade: orbe/mundo, `Posto da Mata` e descrição curta.
- Status `DISPONÍVEL` ocupa o quadrante direito, com borda emerald, ponto luminoso, título e apoio `Pronto para ser assumido`.

### Cards de estado

- Quatro cartões: Revisão atual, Integridade, Host atual e Última sincronização.
- Superfície escura translúcida, borda de 1 px e raio de 16 px.
- Ícone em bloco de 48–52 px; valor em 20–24 px e label em 14 px.
- Destaques: Integridade em teal; sincronização recente em amarelo; ausência de host em neutro.
- Hover move a borda para `--border-strong`; nenhum texto perde contraste.

### CTA principal

- Label oficial: `ASSUMIR E INICIAR`.
- Largura dominante, altura mínima de 148 px no desktop.
- Fundo emerald/teal com contraste alto; círculo de play, título, descrição e chevron.
- Hover: leve elevação por `transform`, brilho reforçado e seta avançando 4 px.
- Pressionado: redução de 1 px no eixo Y.
- Loading: texto `PREPARANDO O MUNDO`, indicador e controle desabilitado.
- Sucesso: `MUNDO ASSUMIDO` e próximo passo `ABRIR JOGO`.
- Falha: mensagem próxima ao CTA com causa e ação `TENTAR NOVAMENTE`.
- Teclado: foco visível de 3 px, sem depender do halo de hover.

### Estado da Cloud

- Cabeçalho com ícone de nuvem e chip `Todos os sistemas operacionais`.
- Linhas: API, R2 e Sessão.
- Cada linha inclui nome, explicação, ponto de estado e texto `Saudável`.
- Em espera: `Verificando`; falha: `Indisponível` e mensagem de recuperação.
- Divisores internos suaves, sem transformar cada linha em um card independente.

### Próximo fluxo

- Título com ícone de lista.
- Quatro passos numerados: Assumir, Abrir jogo, Jogar, Encerrar e sincronizar.
- Etapa atual recebe anel teal e número branco; concluída recebe check; futura permanece neutra.
- Em telas compactas, os passos formam uma lista vertical; setas tornam-se linhas de conexão.

### Resumo

- Lista compacta com Disponibilidade, Save canônico e Diagnóstico.
- Label à esquerda e valor à direita; valores positivos em teal e acompanhados de texto.
- Sem gráficos decorativos, métricas inventadas ou excesso de cartões.

## 4. Estados globais

| Estado | Tratamento |
|---|---|
| Default | superfície, borda sutil e texto de alto contraste |
| Hover | borda mais nítida; elevação máxima de 2 px |
| Focus | outline teal de 3 px com offset de 3 px |
| Selected | fundo teal 12–16%, borda teal e marcador de posição |
| Loading | skeleton ou progresso após 300 ms; preservar dimensões |
| Empty | explicar por que está vazio e apresentar próximo passo |
| Success | ícone + label + mensagem; teal/verde como reforço |
| Failure | ícone + causa + solução; vermelho como reforço |
| Disabled | contraste reduzido, cursor e label ainda legíveis |

Movimentos curtos: 180 ms para feedback, 260 ms para painéis. Animar apenas `transform` e `opacity`. Em `prefers-reduced-motion`, remover deslocamentos, pulso e rotação não essenciais.

## 5. Responsividade

- ≥ 1440 px: sidebar fixa e grade completa.
- 1024–1439 px: sidebar compacta, painéis em duas colunas.
- 768–1023 px: navegação superior, cards em duas colunas, fluxo vertical.
- 375–767 px: uma coluna, navegação rolável, CTA e status em largura total.
- Não ocultar ação principal ou estado do mundo.
- Não permitir rolagem horizontal.

## 6. Limites de implementação

Este documento governa somente a camada visual. O protótipo simula estados no navegador; não conecta cloud, R2, bridge, sincronização, LocalGameHost ou jogo. Não existem Windows Sandbox ou Dedicated Server no fluxo. A futura implementação WPF/XAML deve traduzir os tokens e componentes aqui definidos sem alterar a lógica funcional existente.
