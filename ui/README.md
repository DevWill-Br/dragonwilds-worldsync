# WorldSync 2.0 — primeira UI funcional

## Abrir

Extraia **todo** o ZIP em uma pasta gravável, por exemplo `C:\WorldSync`.
Abra `WorldSync.exe`. Não execute de dentro do ZIP. O pacote inclui .NET e a
mesma versão de Node usada no build; não precisa instalar npm ou Wrangler.
O aplicativo ainda não tem assinatura de código/instalador.

No PC que já tem este repositório configurado, use a build local ou:

```powershell
.\WorldSync.exe --core 'C:\caminho\dragonwilds-worldsync'
```

Sem `--core`, o ZIP usa sua pasta `core`, isolada dos perfis existentes.
Não copie perfis de um PC para outro: os caminhos e identidade são locais.

## Primeiro uso / PC B

1. Abra **Configurações**, verifique os pré-requisitos e crie um perfil novo.
2. Informe a instalação COPIADA do Dedicated Server (sem `RSDragonwilds\Saved`)
   e um laboratório exclusivo. Use `worldsynctest` para continuar o mundo atual.
3. Use o token compartilhado por canal privado no campo mascarado, ou configure
   a variável de ambiente de usuário `WORLDSYNC_API_TOKEN`. O campo da UI usa
   apenas memória e não persiste o token.
4. Informe Owner ID e senhas do laboratório nos campos mascarados. Senhas
   vazias autorizam geração forte pelo script existente. Nada é exibido.
5. Volte a **Início**. Quando o mundo estiver livre, clique **ASSUMIR E INICIAR**.
6. Ao terminar, clique **ENCERRAR E SINCRONIZAR** e mantenha o app aberto até
   a revisão ser confirmada e a sessão liberada.

O setup existente exige Windows Sandbox habilitado, virtualização e runtime
Visual C++ no host. A UI não habilita recursos, reinicia Windows, copia a
instalação Steam, altera roteador/firewall nem cria o mundo. Um mundo sem
revisão canônica não pode ser iniciado pela UI. PC B não deve fazer seed.

## Limites deliberados desta primeira versão

- O core está inalterado. A ponte executa `worldsync.ps1 start`, conversa com
  o CLI por stdin/stdout e observa o journal apenas para apresentar progresso.
- O histórico mostra revisões observadas **nesta execução do app**, por mundo
  e endpoint. A API atual não fornece histórico completo; isso não é simulado.
- Diagnóstico de R2 aparece como **sem verificação independente**: status do
  coordenador não comprova acesso ao bucket. Hash/download continuam no core.
- Alterar caminhos/worldId gera um **novo perfil**, preservando o antigo.
  O nome do host é o nome do PC; demais opções qualificadas são mantidas pelo
  setup existente. Não há editor genérico de opções do core.
- Recuperação só fica habilitada para o incidente específico já validado pelo
  core, com backup escolhido explicitamente. Outros casos mostram orientação,
  sem reacquire, exclusão de locks ou tentativa de recuperação inventada.
- O fechamento normal é bloqueado com supervisor ativo. Encerramento forçado
  da UI não mata deliberadamente o supervisor: a ponte permanece em background.
  Reconectar a uma ponte órfã não é suportado nesta primeira versão. Não use o
  Gerenciador de Tarefas para encerrar o app durante uma sessão.
- Credenciais ficam somente no ambiente/processo e no INI isolado escrito pelo
  script existente. Diagnóstico é uma projeção explícita; stderr/logs brutos
  nunca são exibidos ou copiados. Não há log de comandos contendo credenciais.
- Não foi repetida uma sessão real de jogo nesta fase. A consulta real foi
  somente leitura; ações e telas foram exercitadas com estados sintéticos.
  O próximo teste é uma sessão controlada pelo usuário pela UI.

## Desenvolvimento e validação

Projeto: `ui/WorldSync.Desktop` (C#, WPF/XAML, .NET 8). Ponte:
`ui/bridge.mjs`. Adaptação de entrada do wizard: `ui/scripts`.

```powershell
node --test ui/tests/*.test.mjs
dotnet run --project ui/tests/Presentation.Tests.csproj -c Release
dotnet build ui/WorldSync.Desktop -c Release
.\ui\WorldSync.Desktop\bin\Release\net8.0-windows\WorldSync.exe --demo --ui-test 'C:\WorldSync-UiTests'
.\ui\build.ps1 -Dotnet 'C:\caminho\dotnet.exe'
```

Os modos `--demo` e `--ui-test` não abrem a ponte nem executam ações reais.
`--capture caminho.png --exit-after-capture` renderiza o app com status real
somente leitura e sai. Capturas não incluem campos de credencial em texto.

Publicação WPF: https://learn.microsoft.com/dotnet/core/deploying/
