# Cloud de producao: preparacao

O CloudClient aceita HTTP somente em loopback e HTTPS para producao. Rejeita credenciais embutidas, query, fragmento, caminho extra, hostname invalido e redirects. O bearer fica apenas em memoria/ambiente, nao e enumeravel em JSON; timeout e verificacoes de revisao/hash/sessao foram preservados.

`wrangler.production.jsonc` mantem Worker, WORLD_COORDINATOR, WORLD_SAVES e secret obrigatorio WORLDSYNC_API_TOKEN. Usa new_sqlite_classes para o PRIMEIRO deploy: novas contas Cloudflare nao podem criar namespaces KV legados. Nao aplicar essa migracao como substituicao de uma classe KV ja publicada com dados. A configuracao local validada permanece inalterada.

`npm run deploy` seleciona explicitamente a configuracao de producao. O bucket `dragonwilds-worldsync-saves` deve existir e o secret deve ser cadastrado por entrada protegida. Nenhum token deve ser colocado em wrangler*.jsonc ou Git.

`npm run smoke:production` recebe WORLDSYNC_CLOUD_URL e WORLDSYNC_API_TOKEN pelo ambiente. O teste gera um worldId unico e bytes sinteticos em memoria; nao aceita arquivo de save. Valida health, status vazio, acquire, heartbeat, commit, latest/download, SHA-256 e sessao liberada. Se interrompido antes do commit, nao rouba nem libera automaticamente a sessao incompleta.

Estado desta preparacao: 13 testes passaram; deploy --dry-run passou com Wrangler 4.112.0; nenhuma dependencia atualizada. A sessao OAuth existente indica escopos ausentes e precisa ser renovada antes do deploy real. Nenhum recurso remoto foi criado nesta etapa. Setup de PC A/PC B e smoke real continuam pendentes ate autenticacao e deploy autorizados.

Referencia: https://developers.cloudflare.com/changelog/post/2026-07-09-restrict-new-kv-backed-namespaces/
