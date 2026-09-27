namespace WorldSync.Desktop;
public record VisualState(string Key,string Title,string Detail,string Cta,string Action,bool Enabled,int Step);
public static class Presentation {
 public static string CurrentHost(string availability,string host)=>availability=="free"?"Nenhum":string.IsNullOrWhiteSpace(host)?"Não disponível":host;
 public static string LastSync(string host,string utc){var name=string.IsNullOrWhiteSpace(host)?"Não disponível":host;var time=DateTimeOffset.TryParse(utc,out var date)?date.ToLocalTime().ToString("dd MMM • HH:mm"):"Não disponível";return name+" • "+time;}
 public static bool CanClose(bool owned,bool busy)=>!owned&&!busy;
 public static VisualState Map(string phase,string availability,bool owned,bool busy,bool connected){
  if(phase=="recovery_required"||availability=="recovery_required"||(!owned&&!busy&&phase is not "idle" and not "completed"))return new("recovery_required","Recuperação necessária","Save, backups e sessão preservados. Não inicie outra sessão.","RECUPERAÇÃO NECESSÁRIA","",false,-1);
  if(owned||busy)return phase switch {
   "running"=>new("running","Você está hospedando","Selecione e hospede o mundo dentro do jogo. Ao terminar, feche Dragonwilds; a sincronização será automática.","FECHE O JOGO PARA SINCRONIZAR","",false,-1),
   "waiting_for_game"=>new("waiting_for_game","Aguardando Dragonwilds","Abra o jogo e selecione o mundo preparado. Mantenha WorldSync aberto.","AGUARDANDO O JOGO","",false,-1),
   "finalizing"=>new("finalizing","Sincronizando progresso…","O jogo encerrou. Aguardando o arquivo estabilizar e verificando a leitura exclusiva.","VERIFICANDO SAVE","",false,0),
   "stopped"=>new("finalizing","Sincronizando progresso…","Preparando o snapshot verificado e o backup.","PREPARANDO SNAPSHOT","",false,2),
   "publishing"=>new("publishing","Sincronizando progresso…","A sessão será liberada somente após confirmar a revisão na cloud.","PUBLICANDO REVISÃO","",false,4),
   "completed"=>new("completed","Progresso sincronizado","Revisão confirmada na cloud.","CONCLUÍDO","",false,5),
   _=>new("assuming","Preparando seu mundo","Adquirindo sessão, verificando a revisão e preservando backup local.","PREPARANDO O MUNDO","",false,-1)
  };
  if(!connected)return new("error","Cloud indisponível","Verifique a conexão e a credencial local.","ASSUMIR E JOGAR","start",false,-1);
  if(availability!="free")return new("busy","Outro PC está hospedando","Aguarde a sincronização e liberação. Nenhum save local será alterado.","MUNDO EM USO","",false,-1);
  return new("free",phase=="completed"?"Progresso sincronizado":"Disponível para jogar","Continue da última revisão publicada. Hospede normalmente pelo multiplayer do jogo.","ASSUMIR E JOGAR","start",true,phase=="completed"?5:-1);
 }
 public static string Error(string code)=>code switch {
  "WS_GAME_ACTIVE"=>"Feche completamente Dragonwilds antes desta operação. Nenhum save será instalado ou publicado com o jogo aberto.",
  "WORLD_BUSY"=>"Outro PC está hospedando este mundo. Aguarde a liberação.",
  "ADOPTION_REQUIRED"=>"Este mundo ainda não tem uma revisão. Use Adicionar mundo existente no primeiro PC.",
  "WORLD_ALREADY_EXISTS"=>"Este mundo já existe na cloud. Use Assumir e jogar; a adoção não substitui revisões.",
  "WS_SAVE_DIRECTORY_MISSING"=>"O diretório de saves conhecido não foi encontrado. Abra o jogo normalmente para preparar seu perfil e feche-o antes do setup.",
  "INVALID_CLOUD_CONFIG" or "UNAUTHORIZED"=>"Configure uma credencial válida para a cloud.",
  "CLOUD_UNAVAILABLE"=>"Não foi possível alcançar a cloud. Verifique a conexão.",
  "GAME_START_TIMEOUT"=>"O jogo não foi observado iniciando. A sessão permanece reservada para recuperação.",
  "LOCAL_RECOVERY_REQUIRED" or "RECOVERY_REQUIRED" or "SESSION_LOST"=>"É necessária recuperação explícita. Preserve os saves, backups e registros locais.",
  "COMMIT_UNCONFIRMED"=>"Publicação não confirmada. Preserve a sessão; não repita o envio manualmente.",
  "ADOPTION_FILE_CHANGED" or "DOWNLOAD_INTEGRITY_FAILED" or "UNCONFIRMED_SAVE_CHANGE"=>"O arquivo não corresponde ao hash esperado. A operação foi bloqueada e o progresso preservado.",
  _=>"A operação foi bloqueada. Preserve os arquivos e consulte o diagnóstico. Nenhum detalhe sensível foi exibido."
 };
 public static string Diagnostic(string world,int revision,string visual,string cloud,string game,string process,string endpoint,string session="Não verificada")=>$"WorldSync 2.0 / LocalGameHost\nMundo: {world}\nRevisão: {revision}\nEstado: {visual}\nAPI: {cloud}\nSessão: {session}\nR2: sem verificação independente\nJogo instalado: {game}\nProcesso: {process}\nEndpoint: {endpoint}\nDiagnóstico sem credenciais ou logs brutos.";
}
