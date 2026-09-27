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
versão portátil irmã, ou checkout acima de ui/artifacts. Fontes idênticas são deduplicadas por SHA-256. Um superset consistente vence
uma fonte menor do mesmo perfil/worldId; nunca há mesclagem automática. Conflitos
reais bloqueiam antes de criar destino/lock, com caminhos sanitizados. Não se usa
timestamp para escolher. Journals divergentes também são conflitos.

Segmentos tests/test/fixtures/.scratch (incluindo tests.scratch) são excluídos.
Uma instalação portátil independente descobre somente versões irmãs; não procura
o checkout nem seus ui/artifacts. A classificação registra perfis/worldId/save
configurado, lifecycle/phase/revisão, backups e preferência. Esses caminhos de save
são apenas strings: não são consultados no filesystem. Nenhuma varredura do SaveGames é feita.

É feito inventário de perfis/dados internos, rejeitando links, segredos em JSON,
locks, temporários e estados não concluídos. Estado sem journal só pode ser
superado por uma fonte completa que contenha todos os mesmos arquivos e hashes. Cópias são validadas
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

## Validação da correção

23 testes de migração/persistência aprovados, incluindo duplicatas, superset,
conflito, exclusão de fixtures e ausência de acesso aos caminhos de SaveGames.
Suítes Node de core/cloud/UI, testes C# e 37 checks PowerShell também aprovados.
Nenhuma migração real foi executada. A fonte portátil esperada permanece
`C:\WorldSync\WorldSync-2.0-win-x64-20260927-025944\core`; não foi inspecionada
ou migrada automaticamente nesta tarefa. Extraia a nova build como uma versão
irmã em C:\WorldSync para a descoberta restrita encontrar essa origem.
