# Dedicated Server real: laboratorio qualificado

Este adapter opcional executa o binario real **somente no Windows Sandbox**, usando a instalacao copiada/read-only e a copia de WorldSyncTest.sav. Nao inicia servidor na instalacao original. CloudClient continua limitado a localhost. Nenhuma dependencia foi atualizada.

## Preparacao local

O laboratorio fica em `../real-server-lab`, fora do repositorio. Mapear somente a instalacao copiada em `C:\WorldSyncInstall` (read-only) e o laboratorio em `C:\WorldSyncLab` (gravavel). Habilitar rede para EOS; desabilitar clipboard e outros redirecionamentos. Nunca mapear Steam original ou perfil do host. O helper repete a verificacao de isolamento antes do start. Travas persistidas exigem investigacao apos falha; nao sao apagadas automaticamente.

Usar o INI criado pelo build em `run-userdir-001/UserData/Saved/Config/WindowsServer/DedicatedServer.ini`. `tools/real-server-sandbox/Set-LabCredentials.ps1 -LabRoot <laboratorio>` recebe valores ocultos no terminal. Senhas vazias oferecem geracao criptografica local. Nao colocar credenciais em argumentos, Git ou reports. O repositorio ignora `*.ini`; o laboratorio deve conter `.gitignore` com `*`.

Manter `DefaultWorldName=WorldSyncTest`: neste build, um nome diferente criou outro mundo apesar da copia presente. Readiness rejeita NewGame e exige `World load SUCCEEDED (slot: WorldSyncTest)`, `LogDomMatcherSession: START SESSION - Success`, processo vivo e UDP 7777/8888. O evento analytics nao conta.

O Sandbox precisa das DLLs Visual C++ vcruntime140.dll, vcruntime140_1.dll e msvcp140.dll. No laboratorio validado, copias locais ficam em `runtime/`, acrescentadas somente ao PATH do processo convidado.

Start qualificado:

```text
C:\WorldSyncInstall\RSDragonwilds\Binaries\Win64\RSDragonwildsServer-Win64-Shipping.exe -UserDir=C:\WorldSyncLab\run-userdir-001\UserData -log -unattended -NoSplash -forcelogflush
```

A opcao `-NewConsole` nao e usada: seu console nao aceitou AttachConsole. O console tradicional aceita CTRL_C_EVENT. Este build retorna 0xC000013A; esse codigo so e aceito apos sinal solicitado pelo adapter, saida observada e validacao do save confirmado.

## Autosave e finalizacao

Em Engine.ini isolado:

```ini
[ConsoleVariables]
dom.StateSaveFrequencyMins=1
```

Foi observado Set CVar com valor 1 e sucessos a cada aproximadamente 60 segundos. O parser nao depende de hash mudar e tambem funciona com intervalo padrao, com timeout de finalizacao de 12 minutos (ajustavel no construtor). Uma configuracao carregada, isoladamente, nao comprova a cadencia.

`stop-server` registra `finalizing`, continua heartbeat e espera um SUCCESS posterior ao pedido. A evidencia inclui offset/timestamp do evento, SHA-256, bytes, mtime UTC e abertura exclusiva. Nao aceita save com novo inicio pendente ou falha posterior. O timestamp do arquivo deve corresponder ao evento (tolerancia de 2 segundos entre relogios/log flush); timestamp sozinho nunca basta.

Depois solicita Ctrl+C e aguarda a saida. Exporta sob abertura exclusiva e compara o resultado com LAST_CONFIRMED_SAVE. Se houver outro SUCCESS posterior correspondente, aceita a versao nova; se houver mudanca sem evidencia, entra em recovery_required. O arquivo e copiado para o armazenamento isolado do lifecycle, reutilizando backup e importacao atomica. Publish verifica novamente o hash confirmado antes de usar staging/commit/confirmacao/liberacao existentes. Arquivo meramente estavel nao e prova de save concluido.

Limite importante: nao foi qualificada contagem de jogadores; nenhum cliente participou deste teste. Finalizacao usa autosave confirmado, sem afirmar que houve zero jogadores. Alteracoes em memoria posteriores ao autosave nao fazem parte do save publicado. Nao apresentar isso como sincronizacao sem perda de progresso de jogadores ativos.

## Execucao

Definir localmente `WORLDSYNC_SANDBOX_ID` com o ID de uma VM ja iniciada e `WORLDSYNC_WSB_PATH` com o caminho de wsb.exe instalado. Para o teste completo usar `npm --prefix cloud run test:real`: gera cloud local isolada e credencial de teste temporaria, sem ler .dev.vars existente. Nunca usar contra cloud de producao.

CLI existente: definir `WORLDSYNC_SERVER_ADAPTER=sandbox` para escolher o adapter real; manter `WORLDSYNC_API_TOKEN` apenas no ambiente e fornecer URL localhost. Sem essa opcao, permanece sintetico. Comandos: status, assume, start-server, stop-server, publish, exit.

O estado operacional do lifecycle continua sob `tests/.scratch/lifecycle`, com uma ponte de import/export para o laboratorio. Isso evita ampliar o acesso do Safe Core ao host. O bridge e deliberadamente especifico deste laboratorio; nao e um instalador de servidor para PC B.

## Limites para producao

Faltam deploy Cloudflare autorizado, transporte/autenticacao fora de localhost e empacotamento/configuracao do isolamento no PC B. O teste nao qualifica conectividade de clientes atraves do NAT do Sandbox. Config/log principal/save foram observados sob UserDir; componentes auxiliares do Unreal podem usar o perfil descartavel do convidado. A seguranca do original vem do isolamento da VM, nao apenas de UserDir.

## Validacao realizada em 26/09/2026

- `npm run check`: 11/11.
- `npm run test:lifecycle`: 20 cenarios existentes, alem das verificacoes do runtime local.
- `npm run test:real`: ciclo completo concluido, revisao 2 confirmada e sessao liberada; publicacao com processo ativo rejeitada; heartbeat avancou durante FINALIZING.
- Cadencia observada: 21:44:08.540Z, 21:45:08.380Z, 21:46:08.442Z, 21:47:08.414Z. Todos com SUCCESS do slot esperado; primeiras tres leituras exclusivas registradas durante execucao.
- Save final do E2E: 258960 bytes; SHA-256 `d438a3bcf816c44b8ba4590843c96fa3cde6d21cd5eea672ca03e3f15b99be1f`; evento SUCCESS 22:07:13.513Z; mtime 22:07:13.5094719Z.
- Protecao adicional da ponte: hash de importacao propositalmente incorreto rejeitado antes de backup/troca/start.
- Original e backup preservados: original 265043 bytes, mtime UTC 2026-09-26T05:41:39.4100620Z, SHA-256 `369F0414F45506EBA6D4908361F07C9ECD6C0778888AC167846CA9207F89C0F6`; backup somente leitura com mesmo hash.
- Uma tentativa de E2E anterior ao start falhou no uso de File.Replace com backup nulo pelo PowerShell; corrigido com destino de backup explicito. O ciclo completo acima passou apos essa correcao.
- Credenciais fornecidas nao aparecem nos arquivos alterados do repositorio. A VM e os Workers de teste foram encerrados; backups, journals e evidencias locais foram preservados.

Atualizacao cloud real: perfis e caminhos por maquina agora sao configuraveis por tools/host/setup-host.ps1 e tools/host/worldsync.ps1. Consulte PRODUCTION_SETUP.md. O cliente aceita HTTPS remoto, e a verificacao do hash da revisao importada substitui a dependencia de uma copia fonte fixa na prova de isolamento. O start tambem mantem heartbeat durante readiness. As evidencias de qualificacao acima continuam referentes ao teste local anterior.
