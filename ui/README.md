# WorldSync 2.0 — jogo local

Extraia **todo** o ZIP em uma pasta gravável, como `C:\WorldSync`, e abra
`WorldSync.exe`. O pacote inclui .NET e Node; não requer npm ou Wrangler.
Ainda não há assinatura de código ou instalador.

## Primeiro PC: adicionar mundo existente

1. Termine a partida e feche completamente Dragonwilds.
2. Em Configurações, verifique o jogo instalado e informe o token da cloud no
   campo protegido, caso não exista `WORLDSYNC_API_TOKEN` no ambiente do usuário.
   Use **Salvar credencial com segurança** para armazená-lo no Gerenciador de
   Credenciais do Windows (usuário atual), sem gravá-lo no perfil. Ele será
   recuperado automaticamente nas próximas aberturas.
3. Clique **Descobrir saves locais**. Escolha o arquivo correspondente ao mundo.
   Nome de exibição e arquivo são dados separados: a aplicação não extrai o nome
   interno do mundo. Confira arquivo, tamanho e data; se houver dúvida sobre a
   correspondência, não adote. Não presume `Posto da Mata.sav`.
4. Use nome **Posto da Mata**, ID **posto-da-mata** e crie o perfil local.
5. Clique **Revisar adoção do mundo local**. Confira mundo, arquivo e SHA-256
   na confirmação explícita. Só então será criado backup e publicada a revisão #1.
   Criar um perfil sozinho não publica nem altera um save.
6. Em Início, use **ASSUMIR E JOGAR**. Selecione e hospede o mundo pelo multiplayer
   normal do jogo. Não há automação dentro do jogo.
7. Ao terminar, feche Dragonwilds e mantenha WorldSync aberto até **Progresso
   sincronizado**. A sessão só é liberada após commit confirmado.

## PC B

Instale o jogo normalmente. Abra e feche uma vez para criar seu diretório de saves.
Prepare o token, crie um perfil com o **mesmo worldId** e use o nome de arquivo
confirmado pelo PC A como destino local. A descoberta confirma a pasta mesmo
quando a lista estiver vazia. Não adote um segundo mundo: use **ASSUMIR E JOGAR**.
O download é validado antes da instalação; se existir um arquivo naquele destino,
ele é preservado em backup. Os demais arquivos não são substituídos.

A opção **Abrir Dragonwilds automaticamente ao assumir** vem habilitada. Desativada,
o aplicativo aguarda você abrir o jogo, mantendo a posse. O processo precisa ser
observado aberto e depois fechado para disparar a sincronização.

## Segurança e limites deste preview

- Perfis, preferências, journals, locks e backups internos ficam em
  `%LOCALAPPDATA%\WorldSync`. Atualizar a pasta do executável não altera esses dados.
  Não apague essa pasta nem troque de versão durante uma sessão.
- Com jogo aberto, não há importação, descoberta, snapshot ou publicação.
- Falha de integridade/rede/sessão conserva registros e exige recuperação explícita.
  Não apague locks nem readquira uma sessão para contornar o erro. A recuperação
  automática específica do adapter antigo não é aplicada ao novo fluxo.
- Fechar a interface normalmente é bloqueado durante a sessão. Se a interface
  cair, a ponte pode continuar em background. Reconexão a ela não é implementada.
- O diretório conhecido é o da versão 1.x, `%LOCALAPPDATA%\RSDragonwilds\Saved\SaveGames`;
  sua existência e ausência de links são verificadas. Caminhos alternativos falham
  fechados. Não há varredura de outros perfis Windows.
- Abertura automática usa Steam app 1374490. Outras lojas e os nomes de processo
  desta instalação ainda precisam de qualificação com o jogo real fechado.
- Steam Cloud/outros sincronizadores não são controlados por WorldSync. Coordene
  seu uso antes do primeiro teste real; mudanças concorrentes detectadas bloqueiam
  o fluxo. Não há garantia contra aplicativos externos iniciados manualmente no
  intervalo entre uma checagem de processo e uma operação de arquivo.
- Histórico mostra revisões observadas nesta execução; R2 não recebe um diagnóstico
  independente. Não são simulados estados saudáveis nem histórico inexistente.
- Este build foi testado com saves sintéticos/cloud em memória. Nenhum save real
  foi adotado ou consultado, nenhum jogo iniciado e nenhuma cloud real modificada.

## Desenvolvimento

`src/local-game`: adapter e sessão. `ui/bridge.mjs`: ponte padrão.
`src/lifecycle`: protocolo/cliente/supervisor reutilizados sem alteração.
O adapter antigo permanece no repositório, fora da experiência padrão.

```powershell
node --test tests/local-game.test.mjs ui/tests/bridge.test.mjs
dotnet run --project ui/tests/Presentation.Tests.csproj -c Release
.\ui\build.ps1
```

`WorldSync.exe --demo --ui-test C:\WorldSync-UiTests` renderiza telas sintéticas
sem iniciar a ponte. Nunca use captura em modo normal para testar saves ativos.

## Credencial por PC

Prioridade: token informado nesta execução → Windows Credential Manager →
`WORLDSYNC_API_TOKEN` (processo, depois ambiente do usuário). A credencial Windows
usa o alvo `WorldSync/CloudApi/v2`; é compartilhada pelas instalações deste app
no mesmo usuário Windows, sem acompanhar perfis ou ZIPs enviados ao PC B.

Em Configurações, **Substituir credencial** abre um campo vazio protegido.
**Remover credencial** pede confirmação e elimina a credencial salva e a escolha
em memória desta execução. Uma variável de ambiente existente volta a ser usada;
o app não modifica essa variável. Salvar/remover reconecta a ponte e atualiza
status do mundo selecionado. Essas ações ficam bloqueadas durante uma sessão ativa.
Nenhuma credencial real é lida pelos testes: eles usam um alvo Windows descartável
`WorldSync.Tests/<guid>` e uma ponte sintética sem cloud.

## Persistência e primeira atualização

`%LOCALAPPDATA%\WorldSync` contém `profiles`, `state`, `preferences` e `backups`.
Credenciais continuam no Windows Credential Manager; saves continuam na pasta do jogo.
A build contém apenas programa, runtime e assets. Ao abrir, o último perfil válido é
selecionado automaticamente e a cloud é consultada imediatamente. Enquanto aguarda,
**ASSUMIR E INICIAR** fica desabilitado. Troca manual fica em Configurações > Avançado.

Na primeira abertura, se WorldSync ainda não existir em LOCALAPPDATA, a ponte procura
os dados antigos do core atual, versões em pastas irmãs e checkout ancestral quando
se trata de uma build de desenvolvimento. Copia somente perfis e dados internos;
não segue caminhos de saves registrados nos perfis/journals. Compara hashes das cópias,
reverifica a origem e publica o diretório inteiro. A origem não é excluída.

Sessão pendente, recovery, journal incompleto, arquivo lock, link perigoso ou origens
com conteúdo conflitante interrompem a migração. Cópias idênticas são deduplicadas;
um superset consistente do mesmo perfil/worldId vence uma fonte incompleta.
Pastas de testes são excluídas e instalações portáteis não procuram o checkout. Não remova locks para contornar a mensagem. Pastas
parciais `.migration-*` ficam preservadas se houver falha; o destino não é ativado.
A origem deve estar fechada e não deve voltar a ser usada após a migração, pois versões
antigas desconhecem o diretório compartilhado. Builds futuras usam o mesmo UserDataRoot.
Se a instalação antiga estiver em outro local sem relação com a nova, ela não é
procurada por varredura do disco: a origem precisa ser identificada explicitamente
antes de migrar. Nenhum dado existente no novo destino é mesclado/sobrescrito.

Os caminhos antigos registrados em journals concluídos são mantidos como evidência;
a próxima sessão cria registros e backups novos no UserDataRoot. A seleção do último
perfil fica em `preferences/last-profile.txt`, sem credenciais. O relatório de migração
contém apenas data/contagens/resultado, nunca token ou conteúdo de saves.
