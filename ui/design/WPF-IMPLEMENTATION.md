# Aplicação do protótipo Open Design no WPF

Referência: projeto Open Design `656a83a7-26d4-419c-9ee9-8dffadc4773c`.
`DESIGN.md` foi preservado; `index.html` é a referência aprovada, com somente a URL
relativa da imagem ajustada para reutilizar o asset único do projeto WPF.
A imagem `WorldSync.Desktop/Assets/worldsync-hero.png` é a original, sem edição.
O HTML é referência visual offline, não é carregado pela aplicação nem pelo pacote.

## Tradução visual

- Hero panorâmico com overlay, orbe, título, descrição e disponibilidade.
- Quatro cards superiores; CTA dominante **ASSUMIR E INICIAR** com ação existente.
- Estado da Cloud à esquerda; Próximo fluxo e Resumo à direita.
- Sidebar escura, ícones outline, marcador ativo e foco de teclado.
- Tokens/componentes em `Styles/Controls.xaml` e `Styles/Launcher.xaml`.
- Fonte Segoe UI Variable/Segoe UI: fallback previsto pelo DESIGN.md. Manrope não
  veio nos assets; nenhuma fonte/dependência externa foi adicionada.
- Janela >= 1250 DIP usa duas colunas; compacta usa cards em 2 colunas e painéis
  empilhados. Largura mínima 1000 DIP, rolagem vertical, sem rolagem horizontal.
- Controles nativos de janela preservados; não foram criados botões decorativos
  de minimizar/fechar sem função.

## Fidelidade dos dados

O protótipo simula dados saudáveis; a UI usa os estados existentes. R2 continua
**Não verificado / Sem verificação independente**. Integridade informa **Hash
registrado**, sem afirmar verificação local antes do download. Não há selo
"Todos os sistemas operacionais", nem "sem erros" sem evidência. Indisponibilidade
limpa os valores visuais que poderiam parecer atuais. A palavra INICIAR é somente
uma mudança de texto: o comando `start` continua no LocalGameHost.

Core, bridge, Cloudflare, protocolo, sincronização e controles de segurança não
foram modificados. Navegação e setup existentes permanecem funcionais.

## Validação

- Build WPF Release sem erros/avisos.
- Testes C# de apresentação/perfis/ações e teste Node da projeção sem segredos.
- Smoke WPF em modo demonstração: navegação, CTA, bloqueio em running/finalizing,
  recuperação, busy/offline, responsividade e token mascarado. 12 capturas.
- Capturas revisadas visualmente; textos que cortavam em layout compacto corrigidos.
- Nenhum jogo, save real, perfil real ou consulta à cloud foi usado nos testes.

Capturas ficam em `ui/artifacts/open-design-ui-test/`. Os valores nelas são
sintéticos. Build distribuível gerada pelo script existente `ui/build.ps1`.
