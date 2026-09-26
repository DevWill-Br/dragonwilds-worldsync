# WorldSync: cloud real e PC A / PC B

API publicada: https://dragonwilds-worldsync-api.contactforwillbr.workers.dev

Worker: dragonwilds-worldsync-api. Durable Object SQLite: WORLD_COORDINATOR / WorldCoordinator. Bucket R2 privado: dragonwilds-worldsync-saves (binding WORLD_SAVES). Secret: WORLDSYNC_API_TOKEN. Versao publicada: a2686ab2-441a-4b94-a274-c329fbe53b16.

## O que foi validado

- Deploy e smoke HTTPS real: health, status vazio, acquire, heartbeat, commit sintetico, latest/download, SHA-256 e liberacao.
- Dois perfis com machineId e laboratorios distintos: A assumiu, baixou, publicou revisao 2; B foi rejeitado enquanto A hospedava, depois assumiu e baixou exatamente a revisao 2; B confirmou a mesma copia e liberou a sessao na revisao 3.
- Mundo sintetico: handoff-971b21b8-7f4d-45d6-a1cd-b7d5c73955c0. Payload: 185 bytes; SHA-256 a8aa4d09415969a79caeccf5dbb80464b9986a70b87a395730b5b52e4db6dc0e.
- Servidor real/Sandbox/autosave/shutdown NAO foram repetidos nesta fase, conforme solicitado. O adapter usa a qualificacao anterior. Nao havia segundo PC fisico conectado; o teste acima comprova transporte/posse entre dois perfis neste PC, nao conectividade de jogadores no PC B.
- Nenhum WorldSyncTest.sav foi enviado para a cloud nesta fase. O worldId worldsynctest permanece revisao 0, livre. Somente payloads sinteticos chegaram ao R2.

## Perfis preparados neste PC

`config/hosts/pc-a.local.json` usa o laboratorio existente `../real-server-lab`.
`config/hosts/pc-b.local.json` usa `../worldsync-hosts/pc-b-lab`.

Ambos usam a instalacao copiada `C:\Users\Willi\Documents\Codex\WSReal\install`, mapeada read-only. Cada .wsb mapeia apenas sua instalacao copiada e seu laboratorio. Tokens nao ficam no JSON. Os perfis sao ignorados pelo Git e os laboratorios ficam fora do repositorio, com .gitignore proprio.

O token gerado foi cadastrado no secret Cloudflare e na variavel de ambiente de usuario WORLDSYNC_API_TOKEN deste PC, sem ser exibido. Os scripts usam primeiro o ambiente do processo e depois o ambiente de usuario. Se ausente no PC B, pedem entrada oculta. Transfira o mesmo token por um canal privado de sua escolha; nunca coloque-o no Git, em mensagens deste projeto ou nos perfis JSON. O token compartilhado tem acesso a todos os mundos deste Worker; use apenas entre os PCs autorizados.

## Primeiro uso: registrar a COPIA canonica

Execute os comandos a partir da raiz do repositorio. Confira status sem iniciar VM:

```powershell
.\tools\host\worldsync.ps1 status -Profile pc-a
```

Como o mundo real ainda nao foi enviado, a primeira revisao deve ser criada deliberadamente a partir de `lab/source/WorldSyncTest.sav`. O comando nao aceita caminho arbitrario, rejeita links e exige mundo vazio/livre:

```powershell
.\tools\host\worldsync.ps1 seed-world -Profile pc-a -ConfirmUploadCopy
```

Esse comando envia SOMENTE a copia ja preparada no laboratorio; nao abre o original da Steam. Execute uma unica vez. A prevalidacao de start recusa mundo sem revisao canonica ANTES de iniciar VM ou adquirir sessao, evitando deixar mundo vazio em recovery.

## PC A: assumir e entregar

```powershell
.\tools\host\worldsync.ps1 start -Profile pc-a
```

O comando inicia o Sandbox usando o .wsb, identifica a VM recem-criada, exige prova de isolamento fresca e abre o supervisor em primeiro plano. Nao feche esse terminal durante a hospedagem.

No supervisor:

```text
assume
start-server
status
stop-server
publish
exit
```

Use stop-server apenas quando terminar a sessao de jogo. FINALIZING aguarda autosave explicito e mantem heartbeat. Publish somente sucede apos processo encerrado, conferencia do ultimo save confirmado e snapshot verificado. A sessao so e liberada apos confirmacao cloud. Nao encerre a VM manualmente com servidor ativo.

## PC B fisico

1. Obtenha esta branch e execute `npm --prefix cloud ci` para instalar exatamente o lockfile, sem atualizar dependencias.
2. Tenha Windows Sandbox habilitado, runtime Visual C++ instalado e uma copia da instalacao do Dedicated Server sem RSDragonwilds/Saved. Nao reutilize a instalacao original como InstallPath. O script valida pre-requisitos; nao instala componentes, habilita recursos nem reinicia Windows.
3. Configure o perfil (os caminhos abaixo sao exemplos locais do PC B):

```powershell
.\tools\host\setup-host.ps1 -Profile pc-b -InstallPath 'C:\WorldSync\install-copy' -LabPath 'C:\WorldSync\pc-b-lab' -WorldId worldsynctest
.\tools\host\worldsync.ps1 credentials -Profile pc-b
```

Preencha OwnerId e senhas somente na entrada oculta local. Enter nas senhas oferece geracao forte. O INI isolado fica no laboratorio; o original nunca e consultado. Configure o mesmo token cloud pelo ambiente ou informe-o no prompt oculto dos comandos.

4. Depois de A publicar e liberar:

```powershell
.\tools\host\worldsync.ps1 status -Profile pc-b
.\tools\host\worldsync.ps1 start -Profile pc-b
```

No supervisor, `assume` baixa a revisao canonica e verifica hash/tamanho; `start-server` instala a copia com backup e inicia o mundo. PC B nao executa seed-world. Para entregar de volta, use stop-server, publish e exit.

## Limites e recuperacao

- Nao foi qualificada contagem de jogadores; o criterio continua baseado no autosave confirmado. Progresso em memoria posterior a esse save nao esta garantido.
- Conectividade de jogadores atraves de NAT/firewall do Sandbox no PC B nao foi testada. Nenhum Tunnel ou regra de roteador foi criado.
- Setup gera configuracao e valida caminhos, feature/hipervisor, binario copiado e DLLs. A automacao de inicio de VM nao foi reexecutada nesta fase para respeitar a restricao de nao repetir Sandbox; usa o mesmo WindowsSandbox.exe/.wsb ja qualificado.
- Trava local persistente, sessao stale ou falha de commit exigem recuperacao explicita; scripts nao roubam sessao, removem travas ou matam o servidor automaticamente.
- Estado operacional permanece em tests/.scratch/lifecycle/<perfil>; nao apague essa pasta nem o laboratorio durante uma sessao.
- Workers Free e R2 continuam sujeitos aos limites/cobranca da conta. Nao foi contratado plano adicional pelo agente.

Configuracao de producao usa new_sqlite_classes somente para primeiro deploy. Nao aplicar como conversao de namespace KV existente. O arquivo local wrangler.jsonc, Node 24.19.0, Wrangler 4.112.0 e Miniflare/workerd fixados permanecem sem atualizacao.
