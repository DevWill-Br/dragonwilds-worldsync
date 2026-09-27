using System.Text.Json;
namespace WorldSync.Desktop;
public record VisualState(string Key, string Title, string Detail, string Cta, string Action, bool Enabled, int Step);
public static class Presentation
{
 public static bool CanClose(bool owned,bool busy)=>!owned&&!busy;
 public static VisualState Map(string phase, string availability, bool owned, bool busy, bool connected)
 {
  if(phase=="recovery_required" || availability=="recovery_required" || (!owned && !busy && phase is not "idle" and not "completed")) return new("recovery_required","Recuperação necessária","O progresso foi preservado. Nenhuma sessão será tomada automaticamente.","RECUPERAÇÃO NECESSÁRIA","",false,-1);
  if(owned || busy)
  {
   return phase switch {
    "completed" => new("completed","Progresso sincronizado","Concluindo o supervisor em background.","CONCLUÍDO","",false,5),
    "running" => new("running","Você está hospedando","Ao terminar, aguarde o autosave e a confirmação da sincronização.","ENCERRAR E SINCRONIZAR","stop",!busy,-1),
    "prepared" => new("prepared","Mundo preparado","A revisão canônica foi baixada e verificada pelo core.","INICIAR SERVIDOR","start",!busy,-1),
    "finalizing" => new("finalizing","Finalizando com segurança","Aguardando o próximo autosave confirmado. Mantenha o app aberto.","AGUARDANDO AUTOSAVE","",false,0),
    "stopping" => new("finalizing","Encerrando servidor","Autosave confirmado. Aguardando o encerramento do processo.","ENCERRANDO SERVIDOR","",false,2),
    "stopped" => new("prepared","Servidor encerrado","O core verificará o snapshot antes de publicar a revisão.","SINCRONIZAR REVISÃO","publish",!busy,3),
    "publishing" => new("publishing","Sincronizando revisão","A sessão só será liberada depois da confirmação da cloud.","PUBLICANDO REVISÃO","",false,4),
    _ => new("assuming","Preparando seu mundo","Validando a sessão, o ambiente isolado e a revisão canônica.","ASSUMINDO E INICIANDO","",false,-1)
   };
  }
  if(!connected)return new("error","Cloud indisponível","Verifique a conexão e a credencial local. Nenhuma ação será iniciada.","ASSUMIR E INICIAR","start",false,-1);
  if(availability!="free")return new("busy","Mundo em uso","Outro host mantém a sessão. Aguarde a publicação e liberação.","EM USO POR OUTRO HOST","",false,-1);
  return new("free","Disponível para jogar","Tudo começa pela última revisão publicada. Seu progresso acompanha o mundo.","ASSUMIR E INICIAR","start",!busy,phase=="completed"?5:-1);
 }
 public static string Error(string code)=>code switch {
  "INVALID_CLOUD_CONFIG" or "UNAUTHORIZED" => "A credencial da cloud está ausente ou não foi aceita. Configure o token local.",
  "WS_SERVER_ACTIVE" or "SERVER_ACTIVE" => "Um servidor ou marcador de escrita está ativo. O save foi protegido.",
  "CLOUD_UNAVAILABLE" => "Não foi possível alcançar a cloud. Verifique a conexão.",
  "RECOVERY_REQUIRED" or "LOCAL_RECOVERY_REQUIRED" or "LAB_LOCKED_RECOVERY_REQUIRED" => "É necessária uma recuperação explícita. Preserve o laboratório e os registros.",
  "COMMIT_UNCONFIRMED" => "A publicação ainda não foi confirmada. Não repita o envio; preserve a sessão para recuperação.",
  "UNCONFIRMED_SAVE_CHANGE" or "DOWNLOAD_INTEGRITY_FAILED" or "STAGING_INTEGRITY_FAILED" => "A verificação de integridade bloqueou a operação. O progresso local foi preservado.",
  _ => "A operação não foi concluída. Consulte o diagnóstico; nenhum detalhe sensível foi exibido."
 };
 public static string Diagnostic(string world,int revision,string visual,string cloud,string sandbox,string server,string endpoint,string session="Não verificada")
  => $"WorldSync 2.0\nMundo: {world}\nRevisão: {revision}\nEstado: {visual}\nAPI: {cloud}\nSessão: {session}\nR2: sem verificação independente\nSandbox: {sandbox}\nServidor: {server}\nEndpoint: {endpoint}\nDiagnóstico sem credenciais, sessões completas ou logs brutos.";
}
