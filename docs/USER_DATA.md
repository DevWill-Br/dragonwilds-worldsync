# UserDataRoot — persistência entre builds

Raiz: `%LOCALAPPDATA%\WorldSync`. `src/user-data/layout.json` define nomes em um
único lugar para Node/PowerShell. A bridge informa a raiz à UI; a UI não calcula
outro LOCALAPPDATA nem armazena preferências na pasta da build.

- `profiles`: perfis válidos `.local.json`, sem credenciais.
- `state/<perfil>`: journal, staging e locks do supervisor.
- `state/target-locks`: exclusão local por arquivo selecionado.
- `preferences`: último perfil e relatório não sensível de migração.
- `backups/<perfil>`: backups internos preservados.

Credencial Windows, save do jogo, executáveis e assets não são movidos.
A classe LocalGameHost, sessão, CloudClient, protocolo e hashing não foram alterados.
As mudanças em arquivos do adapter limitam-se aos destinos internos de estado/backup
para atender à persistência solicitada; guards de arquivo continuam ativos.

## Migração

Somente se a nova raiz não existir. A origem é o core antigo no mesmo local,
versão portátil irmã, ou checkout acima de ui/artifacts. Mais de uma origem exige
revisão; nunca há mesclagem automática. Nenhuma varredura do SaveGames é feita.

É feito inventário de perfis/dados internos, rejeitando links, segredos em JSON,
locks, temporários, estados não concluídos e estado incompleto. Cópias são validadas
por hash em diretório temporário; o inventário da origem é conferido novamente antes
do rename final. Origem e caminhos históricos nos journals concluídos permanecem
intactos. A nova sessão gravará caminhos novos. Falhas preservam staging para análise.
O lock de migração serializa inicializações de builds novas. Versões antigas devem
estar fechadas e não devem voltar a usar o armazenamento antigo após a migração.

## Abertura e exibição

Último perfil válido é lembrado; perfil único é automático. Consulta cloud é imediata,
com indicador neutro e CTA desabilitado durante a resposta inicial. Refresh periódico
continua. Host atual FREE = Nenhum; BUSY = host da sessão. Última sincronização usa
host/data da revisão confirmada, com Não disponível quando o dado não existe.

## Evidência desta rodada

- 36/36 testes Node passaram (14 específicos de persistência/migração/inicialização).
- Testes C# passaram: seleção, preferência, perfil inválido, hosts e credenciais
  sintéticas com prioridade/reconexão preservadas.
- Build Release: sem erros/avisos. Smoke WPF em demonstração passou, incluindo
  consulta inicial pendente, FREE/BUSY e última revisão.
- Foram migrados **somente fixtures sintéticos**: perfil, último perfil, journal
  concluído e backup interno. As cópias foram conferidas e as origens preservadas.
- Nenhum perfil real foi migrado nesta rodada; nenhuma inicialização normal foi
  executada. Nenhum save real foi lido ou alterado. A migração real ocorre apenas
  na primeira abertura da nova build, se os critérios acima forem atendidos.
