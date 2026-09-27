# LocalGameHost — implementação e qualificação sintética

## Decisão

O produto padrão usa o jogo normal. A UI mantém o visual aprovado e delega a uma
sessão LocalGameHost: adquirir → verificar/download → backup/importação do arquivo
selecionado → abrir Steam opcionalmente → observar jogo e heartbeat → observar saída
→ estabilidade/abertura exclusiva → backup/snapshot/hash → commit/reconciliação → liberar.
CloudClient, Durable Object, R2 e protocolo de revisões não foram modificados.

`LocalGameSession` reutiliza assume/publish/reconciliação do Supervisor. Sobrescreve
observação do processo, finalização e falhas para nunca encerrar o jogo do usuário.
Não há requisito de autosave/logs de Dedicated Server no novo modo. O fechamento
real do processo e leitura exclusiva precedem a estabilidade de 3 segundos (limite
30 segundos). Hash/tamanho/mtime reiniciam a janela; mudança após a janela bloqueia
snapshot. Arquivo vazio ou acima do limite existente de 32 MiB é recusado.

Perfis novos são separados dos antigos. `worldsynctest` é rejeitado por esse setup.
Um lock persistente por caminho de save impede dois perfis locais no mesmo arquivo.
Locks são arquivados somente após commit confirmado. Locks/journals de recuperação
não são apagados nem revividos automaticamente. Token permanece no ambiente/memória.

## Descoberta e adoção

A raiz foi reaproveitada da implementação 1.x (`Get-LocalWorldFiles`), não descoberta
nesta máquina durante a partida. A descoberta exige o jogo fechado, verifica raiz
existente/sem reparse e enumera `.sav` com SHA/tamanho/mtime. Nome de arquivo é apenas
uma pista, não o nome interno do mundo. A correspondência precisa ser confirmada
explicitamente pelo usuário. Nenhum parser binário especulativo foi implementado.

A confirmação fixa worldId, arquivo do perfil e SHA-256 descoberto. A adoção só aceita
cloud livre/revisão zero; preserva backup antes de adquirir e publicar revisão #1.
Uma mudança de arquivo ou corrida de revisão bloqueia a publicação.

## Arquivos

- `src/local-game/GameIO.ps1`: descoberta, guards de processo/caminho, leitura
  exclusiva, cópias verificadas, backup somente leitura, troca atômica e Steam.
- `src/local-game/host.mjs`: adapter, estabilidade, locks e ponte PowerShell oculta.
- `src/local-game/session.mjs`: observação do jogo/heartbeat/adoção/finalização.
- `src/local-game/profile.mjs`: perfis locais sem segredos e setup.
- `ui/bridge.mjs`: comandos serializados e projeção pública dos estados.
- `ui/bridge-sandbox-legacy.mjs`: ponte anterior preservada, não utilizada no produto.
- `ui/WorldSync.Desktop`: textos, setup, confirmação e mapeamento de estados.
- `ui/build.ps1`: pacote padrão com LocalGameHost, sem ferramentas de servidor.
- `tests/local-game.test.mjs`, `ui/tests`: fixtures e validações da interface.

## Evidência e limites

Testes executam processo simulado, cloud em memória e arquivos exclusivos sob
`tests/.scratch/local-game`. O bypass de processo real aceita somente essa área;
o lançamento do jogo é proibido nesse modo. Isso permite testar enquanto o usuário
joga sem ler seus saves. O E2E usa operações reais de arquivo do adapter, incluindo
backup, importação, saída simulada, estabilidade, snapshot e commit simulado.

Continuam pendentes de teste controlado posterior: confirmar qual arquivo representa
Posto da Mata, verificar nomes de processo da instalação real, lançamento Steam,
reconhecimento do save pelo jogo e interação com Steam Cloud. Não foi prometida
validação real nesta tarefa. Não se deve adotar se a identificação do arquivo for
ambígua. Game Pass/caminhos alternativos não estão qualificados.

Recuperação automática genérica e reconexão a supervisor órfão não foram adicionadas.
Falhas preservam posse/evidência para recuperação explícita. A cloud só garante posse
entre clientes WorldSync; abrir o jogo manualmente em outro PC permanece possível.
Veja `ui/README.md` para instruções do primeiro teste autorizado e PC B.

### Resultado desta rodada

- 22/22 testes Node (adapter/arquivos/sessão/ponte), incluindo E2E com arquivo
  sintético e cloud em memória, passaram.
- Testes C# passaram: estados, ações, fechamento, seleção/persistência e validação
  de perfis. Compilação WPF Release: zero erros e zero avisos.
- Smoke WPF em `--demo --ui-test` passou; nove telas renderizadas, sem abrir ponte.
- Nenhum teste consultou produção ou saves reais. Dependências não foram atualizadas.
