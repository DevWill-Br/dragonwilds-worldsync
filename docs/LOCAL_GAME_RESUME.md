# Heartbeat e retomada explícita de LocalGameHost

Falhas CLOUD_UNAVAILABLE durante a monitoração de running/waiting_for_game
preservam a sessão por até 60 segundos desde a primeira falha. Tentativas após
1, 2, 4, 8 e no máximo 10 segundos. A fila do supervisor impede sobreposição.
Sem autoridade confirmada não há estabilidade/snapshot/publicação/release.
O fechamento do jogo durante a desconexão aguarda a reconexão antes de finalizar.
Demais erros, sessão stale observada, divergência de sessão/base/hash ou resposta
inválida continuam fail-closed. Não há retry cego de commit.

A retomada é exclusivamente solicitada por `resume` / “Retomar sessão deste PC”.
O botão só habilita após validação read-only de journal, cloud, processo e locks;
a ação repete as validações. Exige recovery_required + CLOUD_UNAVAILABLE (ou SESSION_RETAINED_ON_CLOSE legado
com gameSeen=true, startedAtUtc válido e evidência de running), sessão
preservada e execução anterior running. Journals anteriores sem resumePhase são
aceitos somente com gameSeen=true e startedAtUtc; novos journals incluem identidade
profile/worldId/host/machineId. O journal vem apenas da pasta do perfil selecionado.
A identidade da sessão cloud deve corresponder ao perfil, inclusive em journals
legados. Mundo, sessão, revisão-base e SHA-256 são comparados em ambos os lados.

Uma sessão stale do mesmo PC pode receber heartbeat apenas nesta ação explícita.
Após heartbeat é exigido status hosting/busy com a mesma base e jogo ainda ativo.
Não há acquire, download, instalação ou acesso ao save durante a retomada.
Ao jogo fechar, continua o fluxo normal de estabilidade, leitura exclusiva,
backup/snapshot, hash e commit reconciliado. Nunca force release.

Reabertura: locks antigos só são arquivados (nunca apagados) quando ambos os PIDs
estão comprovadamente encerrados e o lock de alvo corresponde ao perfil. PID vivo,
reutilizado ou inacessível bloqueia retomada; não é encerrado automaticamente.
Um guard adicional serializa retomadas. Evidências antigas são preservadas.
A mesma instância que já possui os handles pode retomar sem trocar locks.
Fechar a nova build em recovery preserva a causa original e o journal.

**Não trocar/encerrar instâncias antigas à força durante uma partida.** A build
não assume o controle de um supervisor ainda vivo; nesse caso mostra o bloqueio.
A tarefa de implementação não executa retomada real, migração nem cloud de produção.

Validação: mocks sem tokens reais, relógio controlado, arquivos sintéticos, processo
Node sintético encerrado para locks, testes existentes e smoke WPF em --demo.

Compatibilidade legada: SESSION_RETAINED_ON_CLOSE não dispensa nenhuma validação
de processo, locks, perfil, posse ou base canônica. Não aceita outros failures.
Testes com journal/locks reais de filesystem são exclusivamente sintéticos.
