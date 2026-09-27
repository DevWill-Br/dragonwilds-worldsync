using System.ComponentModel;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
namespace WorldSync.Desktop;
public partial class MainWindow : Window
{
 CoreBridge? bridge;
 CloudCredential? credential;
 bool owned,busy,allowClose,changingProfiles,restarting,demo;
 string action="",phase="idle",world="",endpoint="",gameInstall="Não verificado",server="Não observado",api="Aguardando",visual="idle";
 string sessionStatus="Não verificada";
 int revision;
 readonly Dictionary<string,RevisionRow> history=new();
 readonly string[] stepNames=["Aguardando estabilidade","Leitura exclusiva","Backup e snapshot","Verificando SHA-256","Publicando revisão","Concluído"];
 public record RevisionRow(string World,string Endpoint,int Revision,string Time,string Host,string Hash);
 public MainWindow()
 {
  InitializeComponent();
  Loaded+=async(_,_)=>{
   demo=Environment.GetCommandLineArgs().Contains("--demo");
   if(demo){RenderDemo();await Task.Delay(250);if(Environment.GetCommandLineArgs().Contains("--ui-test")){await UiSmoke();return;}CaptureIfRequested();return;}
   credential=new CloudCredential(new WindowsCredentialStore(),CloudCredential.EnvironmentToken,RestartBridge);
   UpdateCredentialStatus();
   try{StartBridge();}catch{ShowNotice("Não foi possível abrir a conexão ou acessar a credencial segura. Confira a instalação e o armazenamento do Windows.");}
  };
 }
 void StartBridge(string? token=null)
 {
  var b=new CoreBridge(CoreBridge.LocateRoot());bridge=b;
  b.Message+=m=>Dispatcher.BeginInvoke(()=>{if(ReferenceEquals(bridge,b))Handle(m);});
  b.UnexpectedExit+=()=>Dispatcher.BeginInvoke(()=>{if(!allowClose && !restarting && ReferenceEquals(bridge,b))ShowNotice("A conexão com o supervisor terminou. Confira o estado antes de iniciar outra operação.");});
  try{b.Start(token??credential?.Resolve());}catch{bridge=null;throw;}
 }
 static string S(JsonElement e,string name)=>e.TryGetProperty(name,out var v)&&v.ValueKind==JsonValueKind.String?v.GetString()??"":"";
 static bool B(JsonElement e,string name)=>e.TryGetProperty(name,out var v)&&v.ValueKind==JsonValueKind.True;
 static int N(JsonElement e,string name)=>e.TryGetProperty(name,out var v)&&v.TryGetInt32(out var n)?n:0;
 readonly List<string> demoCommands=new();
 void Send(object value){if(demo){demoCommands.Add(JsonSerializer.Serialize(value));return;}try{bridge?.Send(value);}catch{ShowNotice("Não foi possível enviar o comando ao supervisor. O app não fará novas tentativas automáticas.");}}
 void Handle(JsonElement m)
 {
  switch(S(m,"type"))
  {
   case "profiles":
    userDataRoot=S(m,"userDataRoot");
    _=LoadProfiles(m.GetProperty("names").EnumerateArray().Select(n=>n.GetString()!).ToArray());
    break;
   case "profile":
    ShowConsulting();
    confirmedProfile=S(m,"profile");
    var remembered=demo || bridge==null || ProfileSelection.Save(userDataRoot!,confirmedProfile);
    changingProfiles=true;if(Profiles.Items.Contains(confirmedProfile))Profiles.SelectedItem=confirmedProfile;changingProfiles=false;
    world=S(m,"worldId");WorldName.Text=S(m,"displayName");endpoint=S(m,"endpoint");EndpointInput.Text=endpoint;
    ProfileInput.Text=S(m,"profile");WorldInput.Text=world;DisplayNameInput.Text=S(m,"displayName");SaveFileInput.Text=S(m,"fileName");SaveDirectory.Text=S(m,"saveRoot");AutoLaunch.IsChecked=B(m,"autoLaunch");selectedFile=S(m,"fileName");
    HostOptions.Text="Host: "+S(m,"host")+" • jogo local • sincronização após fechar Dragonwilds";
    Notice.Visibility=Visibility.Collapsed;if(!remembered)ShowNotice("O perfil foi selecionado, mas não foi possível lembrar esta escolha neste PC.");Send(new{action="inspect"});break;
   case "startupBlocked":
    bridge=null;
    PrimaryButton.IsEnabled=false;SetupButton.IsEnabled=DiscoverButton.IsEnabled=AdoptButton.IsEnabled=false;
    ShowNotice("Migração não executada. Feche a versão anterior e preserve seus dados: há sessão/registro pendente, origem ambígua ou dados que exigem revisão. Código: "+S(m,"code")+(m.TryGetProperty("sources",out var sources)&&sources.ValueKind==JsonValueKind.Array?"\nOrigens em conflito:\n"+string.Join("\n",sources.EnumerateArray().Select(x=>x.GetString())):""));break;
   case "consulting":ShowConsulting();break;
   case "state":
    owned=B(m,"owned");busy=B(m,"busy");phase=S(m,"phase");
    if(B(m,"consulting")){ShowConsulting();break;}
    var connected=m.TryGetProperty("cloud",out var c)&&c.ValueKind==JsonValueKind.Object;
    var avail=connected?S(c,"availability"):"unknown";
    sessionStatus=avail switch {"free"=>"Livre","busy"=>"Hospedando","committing"=>"Publicando","recovery_required"=>"Recuperação necessária",_=>"Não verificada"};
    var v=Presentation.Map(phase,avail,owned,busy,connected);visual=v.Key;
    StateBadge.Text=v.Key switch {"free"=>"DISPONÍVEL","running"=>"VOCÊ ESTÁ HOSPEDANDO","finalizing"=>"FINALIZANDO","recovery_required"=>"RECUPERAÇÃO NECESSÁRIA","publishing"=>"SINCRONIZANDO","completed"=>"CONCLUÍDO","assuming"=>"PREPARANDO","waiting_for_game"=>"ABRA O JOGO","prepared"=>"PREPARADO","busy"=>"EM USO",_=>"INDISPONÍVEL"};StateTitle.Text=v.Title;StateDetail.Text=S(m,"connectionIssue")=="CLOUD_UNAVAILABLE"?"Conexão temporariamente indisponível. Tentando reconectar; publicação bloqueada até confirmar a sessão.":v.Detail;
    action=v.Action;PrimaryButton.Content=v.Cta=="ASSUMIR E JOGAR"?"ASSUMIR E INICIAR":v.Cta;PrimaryButton.IsEnabled=v.Enabled && (connected && N(c,"revision")>0);
    Profiles.IsEnabled=!owned&&!busy;SetupButton.IsEnabled=TokenButton.IsEnabled=ReplaceTokenButton.IsEnabled=RemoveTokenButton.IsEnabled=DiscoverButton.IsEnabled=OptionsButton.IsEnabled=!owned&&!busy&&!restarting;
    AdoptButton.IsEnabled=!owned&&!busy&&connected&&N(c,"revision")==0&&avail=="free";
    if(v.Key=="busy"&&!string.IsNullOrWhiteSpace(S(c,"host")))StateTitle.Text=S(c,"host")+" está hospedando";
    RecoveryPanel.Visibility=v.Key=="recovery_required"?Visibility.Visible:Visibility.Collapsed;
    RecoverButton.IsEnabled=Presentation.CanResume(phase,B(m,"recoveryEligible"),busy);
    RecoveryHint.Text=RecoverButton.IsEnabled?"Retome a mesma sessão deste PC, sem baixar ou substituir o mundo em uso.":"Este caso não dispõe de recuperação genérica validada. Copie o diagnóstico e preserve os saves e backups.";
    RenderSteps(v.Step);
    api=connected?"Disponível":"Indisponível";CloudText.Text="Cloud: "+api;
    server=owned&&phase=="running"?"Hospedando (supervisor)":owned&&phase=="finalizing"?"Verificando save":phase is "stopped" or "completed"?"Encerrado (registro local)":"Não observado ao vivo";
    if(connected){
     revision=N(c,"revision");RevisionText.Text="#"+revision;
     HostText.Text=Presentation.CurrentHost(avail,S(c,"host"));
     IntegrityText.Text=revision>0?"Hash registrado":"Sem revisão";
     SyncText.Text="Não disponível";
     if(c.TryGetProperty("latest",out var l)&&l.ValueKind==JsonValueKind.Object){
      var time=S(l,"time");SyncText.Text=Presentation.LastSync(S(l,"host"),time);
      var row=new RevisionRow(world,endpoint,N(l,"revision"),time,S(l,"host"),S(l,"hash"));
      history[$"{endpoint}|{world}|{row.Revision}"]=row;RenderHistory();
     }
    }
    if(!connected){RevisionText.Text="—";HostText.Text="Não verificado";IntegrityText.Text="Não verificada";SyncText.Text="—";}
    if(!string.IsNullOrEmpty(S(m,"error")))ShowNotice(Presentation.Error(S(m,"error")));

    RenderLauncherStatus(v.Key,connected);UpdateDiagnostic();CaptureIfRequested();break;
   case "checks":
    gameInstall=B(m,"installed")?"Detectado":"Não detectado";server=B(m,"gameActive")?"Jogo aberto":"Jogo fechado";
    ChecksText.Text=$"{Check(B(m,"installed"))} Dragonwilds instalado   •   {Check(B(m,"token"))} Credencial disponível\n{server} • descoberta e adoção exigem o jogo fechado";UpdateDiagnostic();break;
   case "worlds":
    SaveDirectory.Text=S(m,"root");WorldFiles.Items.Clear();
    foreach(var w in m.GetProperty("worlds").EnumerateArray())WorldFiles.Items.Add(new SaveChoice(S(w,"fileName"),S(w,"sha256"),N(w,"bytes"),S(w,"mtimeUtc")));
    ShowNotice("Escolha o arquivo e confirme qual mundo ele representa. O nome exibido pelo jogo não foi extraído do save.");break;
   case "setup":busy=false;ShowNotice("Perfil criado. A adoção inicial exige uma confirmação separada.");break;
   case "options":ShowNotice("Opção de abertura salva.");break;
   case "error":busy=false;ShowNotice(Presentation.Error(S(m,"code")));break;
   case "closeBlocked":ShowNotice("O supervisor está ativo. Conclua a finalização e sincronização antes de fechar.");break;
   case "closed":
    if(restarting){restarting=false;var token=pendingToken;pendingToken=null;try{StartBridge(token);}catch{ShowNotice("Credencial salva; não foi possível reconectar. Reabra o app para tentar novamente.");}}
    else {allowClose=true;Close();}break;
  }
 }
 string? confirmedProfile;
 string? userDataRoot;
 int profilesLoadVersion;
 async Task LoadProfiles(string[] candidates)
 {
  var version=++profilesLoadVersion;var currentBridge=bridge;
  try {
   var valid=demo?candidates:await ProfileSelection.Validate(currentBridge!.Root,candidates);
   if(version!=profilesLoadVersion || !ReferenceEquals(currentBridge,bridge))return;
   var last=confirmedProfile??(demo?null:ProfileSelection.Read(userDataRoot!));
   var chosen=ProfileSelection.Choose(valid,last);
   changingProfiles=true;Profiles.Items.Clear();foreach(var name in valid)Profiles.Items.Add(name);Profiles.SelectedItem=chosen;changingProfiles=false;
   ProfilesHint.Text=valid.Length switch {0=>"Nenhum perfil válido. Prepare este PC no setup abaixo.",1=>"Este é o perfil padrão deste PC. A seleção é automática.",_=>"A última escolha é lembrada. Troque aqui quando necessário, com o supervisor parado."};
   if(chosen!=null){SetupTitle.Text="Configurações do host";if(!owned&&!busy)Send(new{action="select",profile=chosen});}
   else {ShowPage("Settings");SetupTitle.Text="Bem-vindo. Vamos preparar este PC.";Send(new{action="inspect"});}
  }catch{ShowNotice("Não foi possível verificar os perfis locais. Confira a instalação do app; nenhum perfil foi modificado.");}
 }
 static string Check(bool value)=>value?"✓":"○";
 static string LocalTime(string utc)=>DateTimeOffset.TryParse(utc,out var d)?d.ToLocalTime().ToString("dd MMM • HH:mm"):"—";
 // Presentation only: this clock measures observation in this UI, not server uptime.
 DateTimeOffset? runningObservedSince;
 void RenderLauncherStatus(string key,bool connected)
 {
  var attention=key is "recovery_required" or "error";
  StateBadge.Foreground=new SolidColorBrush(attention?Color.FromRgb(240,192,116):Color.FromRgb(36,230,194));
  StatusSurface.Background=new SolidColorBrush(attention?Color.FromRgb(65,47,28):Color.FromRgb(5,62,53));
  StatusSurface.BorderBrush=new SolidColorBrush(attention?Color.FromRgb(131,99,51):Color.FromRgb(42,171,133));
  PrimaryButton.Tag=key=="running"?"■":key is "finalizing" or "publishing"?"◷":"▶";
  ApiHealth.Text=connected?"●  Saudável":"○  Indisponível";
  ApiHealth.Foreground=new SolidColorBrush(connected?Color.FromRgb(36,230,194):Color.FromRgb(173,158,137));
  CloudSession.Text=sessionStatus;
  RunningPanel.Visibility=key=="running"?Visibility.Visible:Visibility.Collapsed;
  FlowSurface.Visibility=Visibility.Visible;
  SummaryAvailability.Text=connected?sessionStatus:"Não verificada";
  SummaryCanonical.Text=connected&&revision>0?"Hash registrado":"Não verificado";
  SummaryDiagnostic.Text=key=="recovery_required"?"Recuperação necessária":key=="error"?"Verificar conexão":"Consulte Diagnóstico";
  var activeStep=key switch {"assuming"=>1,"prepared" or "waiting_for_game"=>2,"running"=>3,"finalizing" or "publishing"=>4,_=>0};
  var circles=new[]{FlowStep1,FlowStep2,FlowStep3,FlowStep4};
  for(var n=0;n<circles.Length;n++)circles[n].BorderBrush=(Brush)FindResource(n+1==activeStep?"Teal":"TextTertiary");
  if(key=="running"){
   runningObservedSince??=DateTimeOffset.UtcNow;
   var elapsed=DateTimeOffset.UtcNow-runningObservedSince.Value;
   SessionDuration.Text=$"{(int)elapsed.TotalHours:00}:{elapsed.Minutes:00}:{elapsed.Seconds:00}";
  }else runningObservedSince=null;
 }
 void RenderSteps(int step)
 {
  Steps.Items.Clear();SummaryCards.Visibility=Visibility.Visible;
  var finalizing=step>=0&&step<5;
  Journey.Visibility=finalizing?Visibility.Collapsed:Visibility.Visible;
  Steps.Visibility=finalizing?Visibility.Visible:Visibility.Collapsed;
  FlowTitle.Text=finalizing?"Finalização segura":"Próximo fluxo";
  FlowSummary.Text=finalizing?"Etapas confirmadas pelo core":step==5?"Revisão confirmada • sessão liberada":"Um mundo contínuo, quatro passos.";
  if(step<0)return;
  for(int i=0;i<stepNames.Length;i++){
   var current=i==step;
   Steps.Items.Add(new Border {
    Background=new SolidColorBrush(current?Color.FromRgb(25,65,50):Color.FromRgb(19,29,37)),
    BorderBrush=new SolidColorBrush(current?Color.FromRgb(64,150,114):Color.FromRgb(36,51,59)),
    BorderThickness=new Thickness(1),CornerRadius=new CornerRadius(9),Padding=new Thickness(12,13,12,13),Margin=new Thickness(0,4,10,4),
    Child=new TextBlock{Text=(i<step||step==5?"✓  ":current?"●  ":"○  ")+stepNames[i],FontSize=12,FontWeight=current?FontWeights.SemiBold:FontWeights.Normal,
     Foreground=new SolidColorBrush(i<=step?Color.FromRgb(36,230,194):Color.FromRgb(133,153,165))}
   });
  }
 }
 void RenderHistory()
 {
  HistoryItems.Items.Clear();var rows=history.Values.Where(r=>r.World==world&&r.Endpoint==endpoint).OrderByDescending(r=>r.Revision).ToArray();
  HistoryEmpty.Visibility=rows.Length==0?Visibility.Visible:Visibility.Collapsed;
  foreach(var r in rows)HistoryItems.Items.Add(new TextBlock{Text=$"#{r.Revision}    •    {LocalTime(r.Time)}    •    {r.Host}    •    {r.Hash[..Math.Min(12,r.Hash.Length)]}…    ✓ Publicada",Margin=new Thickness(0,0,0,20)});
 }
 void ShowConsulting(){PrimaryButton.IsEnabled=false;StateBadge.Text="CONSULTANDO";StateTitle.Text="Consultando cloud...";StateDetail.Text="Aguarde a resposta inicial antes de assumir o mundo.";CloudText.Text="Consultando cloud...";RevisionText.Text=HostText.Text=SyncText.Text="—";IntegrityText.Text="Aguardando";ApiHealth.Text=CloudSession.Text=SummaryAvailability.Text=SummaryCanonical.Text="Aguardando";StateBadge.Foreground=(Brush)FindResource("TextSecondary");}
 void UpdateDiagnostic()=>DiagnosticText.Text=Presentation.Diagnostic(world,revision,visual,api,gameInstall,server,endpoint,sessionStatus);
 void ShowNotice(string text){NoticeText.Text=text;Notice.Visibility=Visibility.Visible;}
 void LayoutChanged(object sender,SizeChangedEventArgs e){
  if(WorkspaceGrid==null)return;
  var compact=ActualWidth<1250;
  SidebarWidth.Width=new GridLength(compact?210:252);
  SummaryCards.Columns=compact?2:4;
  LeftWorkspaceColumn.Width=new GridLength(compact?1:1.22,GridUnitType.Star);
  WorkspaceGap.Width=new GridLength(compact?0:18);
  RightWorkspaceColumn.Width=new GridLength(compact?0:0.95,GridUnitType.Star);
  Grid.SetColumn(RightWorkspace,compact?0:2);Grid.SetRow(RightWorkspace,compact?1:0);
  var narrow=ActualWidth<1000;
  HeroStatusColumn.Width=new GridLength(narrow?0:compact?240:300);
  Grid.SetColumn(StatusSurface,narrow?0:1);Grid.SetRow(StatusSurface,narrow?1:0);
  StatusSurface.Margin=narrow?new Thickness(0,14,0,0):new Thickness(0);
  StatusSurface.HorizontalAlignment=narrow?HorizontalAlignment.Left:HorizontalAlignment.Stretch;
  StatusSurface.MinWidth=narrow?280:0;WorldName.FontSize=compact?34:48;BrandName.FontSize=compact?18:22;StateBadge.FontSize=compact?20:23;
  WorldOrb.Visibility=compact?Visibility.Collapsed:Visibility.Visible;
  WorldOrb.Width=WorldOrb.Height=compact?64:82;
 }
 void Navigate(object sender,RoutedEventArgs e)=>ShowPage((sender as Button)?.Tag?.ToString()??"Home");
 void ShowPage(string name){foreach(var button in ((StackPanel)NavHome.Parent).Children.OfType<Button>()){var selected=button.Tag?.ToString()==name;button.Background=new SolidColorBrush(selected?Color.FromRgb(15,53,49):Colors.Transparent);button.FontWeight=selected?FontWeights.Bold:FontWeights.Normal;}HomePage.Visibility=name=="Home"?Visibility.Visible:Visibility.Collapsed;HistoryPage.Visibility=name=="History"?Visibility.Visible:Visibility.Collapsed;DiagnosticsPage.Visibility=name=="Diagnostics"?Visibility.Visible:Visibility.Collapsed;SettingsPage.Visibility=name=="Settings"?Visibility.Visible:Visibility.Collapsed;}
 void ProfileChanged(object sender,SelectionChangedEventArgs e){if(!changingProfiles && Profiles.SelectedItem is string name)Send(new{action="select",profile=name});}
 void RefreshClick(object sender,RoutedEventArgs e)=>Send(new{action="refresh"});
 void PrimaryClick(object sender,RoutedEventArgs e){if(!PrimaryButton.IsEnabled||action=="")return;PrimaryButton.IsEnabled=false;busy=true;Send(new{action});}
 void InspectClick(object sender,RoutedEventArgs e)=>Send(new{action="inspect"});
 void CopyDiagnostic(object sender,RoutedEventArgs e){try{Clipboard.SetText(DiagnosticText.Text);ShowNotice("Diagnóstico seguro copiado.");}catch{ShowNotice("A área de transferência está ocupada. Tente novamente.");}}
 string selectedFile="";
 public record SaveChoice(string FileName,string Hash,int Bytes,string Mtime){public string Label=>$"{FileName} • {Bytes:N0} bytes • {Mtime}";}
 void DiscoverClick(object sender,RoutedEventArgs e){if(!owned&&!busy)Send(new{action="discover"});}
 void WorldFileChanged(object sender,SelectionChangedEventArgs e){if(WorldFiles.SelectedItem is SaveChoice s)SaveFileInput.Text=s.FileName;}
 void SetupClick(object sender,RoutedEventArgs e){if(owned||busy)return;busy=true;Send(new{action="setup",values=new{profile=ProfileInput.Text.Trim(),worldId=WorldInput.Text.Trim(),displayName=DisplayNameInput.Text.Trim(),fileName=SaveFileInput.Text.Trim(),autoLaunch=AutoLaunch.IsChecked==true}});}
 void OptionsClick(object sender,RoutedEventArgs e){if(!owned&&!busy)Send(new{action="options",autoLaunch=AutoLaunch.IsChecked==true});}
 void AdoptClick(object sender,RoutedEventArgs e){
  if(owned||busy||!AdoptButton.IsEnabled)return;
  if(WorldFiles.SelectedItem is not SaveChoice choice||choice.FileName!=selectedFile){ShowNotice("Descubra e selecione exatamente o arquivo do perfil ativo antes de adotar.");return;}
  var message=$"Confirme que este arquivo é o mundo correto:\n\nMundo: {WorldName.Text}\nWorld ID: {world}\nArquivo: {choice.FileName}\nTamanho: {choice.Bytes} bytes\nSHA-256: {choice.Hash}\n\nCriar backup e publicar como revisão #1?";
  if(MessageBox.Show(this,message,"Confirmar adoção explícita",MessageBoxButton.YesNo,MessageBoxImage.Question,MessageBoxResult.No)!=MessageBoxResult.Yes)return;
  busy=true;Send(new{action="adopt",confirmed=true,worldId=world,expectedHash=choice.Hash});
 }
 string? pendingToken;
 void UpdateCredentialStatus(){
  if(credential==null)return;
  try{var saved=credential.IsStored;CredentialStatus.Text=saved?"Credencial configurada com segurança neste PC":"Credencial não configurada";CredentialEditor.Visibility=saved?Visibility.Collapsed:Visibility.Visible;CredentialActions.Visibility=saved?Visibility.Visible:Visibility.Collapsed;}
  catch{CredentialStatus.Text="Armazenamento seguro indisponível";ShowNotice("Não foi possível acessar o Gerenciador de Credenciais do Windows. Nenhum detalhe sensível foi exibido.");}
 }
 void RestartBridge(string? token){
  pendingToken=token;restarting=true;
  if(bridge==null){restarting=false;pendingToken=null;StartBridge(token);}else {try{bridge.Send(new{action="quit"});}catch{restarting=false;pendingToken=null;throw new InvalidOperationException("BRIDGE_UNAVAILABLE");}}
 }
 void TokenClick(object sender,RoutedEventArgs e){
  if(owned||busy||restarting)return;
  var token=TokenInput.Password;TokenInput.Clear();
  try{credential!.Save(token);UpdateCredentialStatus();ShowNotice("Credencial salva com segurança. Reconectando à cloud…");}
  catch{ShowNotice("Não foi possível salvar ou reconectar. Verifique a credencial e o armazenamento seguro do Windows.");}
 }
 void ReplaceTokenClick(object sender,RoutedEventArgs e){if(owned||busy||restarting)return;TokenInput.Clear();CredentialEditor.Visibility=Visibility.Visible;TokenInput.Focus();}
 void RemoveTokenClick(object sender,RoutedEventArgs e){
  if(owned||busy||restarting||demo)return;
  if(MessageBox.Show(this,"Remover a credencial salva neste usuário do Windows? Se WORLDSYNC_API_TOKEN estiver configurada, ela voltará a ser usada.","Remover credencial",MessageBoxButton.YesNo,MessageBoxImage.Question,MessageBoxResult.No)!=MessageBoxResult.Yes)return;
  try{credential!.Remove(true);TokenInput.Clear();UpdateCredentialStatus();ShowNotice("Credencial removida. Reconectando com a alternativa do ambiente, se configurada.");}
  catch{ShowNotice("Não foi possível remover ou reconectar. Verifique o armazenamento seguro do Windows.");}
 }

 void RecoverClick(object sender,RoutedEventArgs e){if(!RecoverButton.IsEnabled)return;RecoverButton.IsEnabled=false;Send(new{action="resume"});}
 void OnClosing(object? sender,CancelEventArgs e){if(allowClose||demo)return;e.Cancel=true;if(restarting){ShowNotice("Aguarde a reconexão da credencial antes de fechar.");return;}if(!Presentation.CanClose(owned,busy)){ShowNotice("Mantenha o app aberto até fechar o jogo e concluir a sincronização. O supervisor continua ativo.");return;}if(bridge==null){allowClose=true;e.Cancel=false;}else Send(new{action="quit"});}
 sealed class DemoCredentialStore:ICredentialStore {string? value;public string? Read()=>value;public void Write(string token)=>value=token;public void Delete()=>value=null;}
 void RenderDemo()
 {
  credential=new CloudCredential(new DemoCredentialStore(),()=>null,_=>demoCommands.Add("credential-reconnect"));UpdateCredentialStatus();
  world="Posto da Mata";endpoint="https://dragonwilds-worldsync-api.contactforwillbr.workers.dev";
  WorldName.Text=world=="worldsynctest"?"WorldSyncTest":world;revision=2;RevisionText.Text="#2";StateBadge.Text="DISPONÍVEL";StateTitle.Text="Disponível para jogar";StateDetail.Text="Tudo começa pela última revisão publicada. Seu progresso acompanha o mundo.";HostText.Text="Nenhum host";SyncText.Text="26 set • 20:36";IntegrityText.Text="Hash registrado";CloudText.Text="Cloud: disponível";
  PrimaryButton.IsEnabled=false;RenderLauncherStatus("free",true);api="Disponível (demonstração)";gameInstall="Detectado (demonstração)";UpdateDiagnostic();
  history["demo"]=new(world,endpoint,2,"2026-09-26T23:36:00Z","PC A","fcb496ed002ff468706e891d1b6c37ff2178d845fa23e9d6ed79056cc113aa73");RenderHistory();
 }
 async Task UiSmoke()
 {
  var args=Environment.GetCommandLineArgs();var dir=args[Array.IndexOf(args,"--ui-test")+1];Directory.CreateDirectory(dir);
  void Require(bool condition){if(!condition)throw new InvalidOperationException("UI_TEST_FAILED");}
  void State(string state,bool isOwned,bool isBusy,string availability="busy"){
   using var data=JsonDocument.Parse(JsonSerializer.Serialize(new{type="state",phase=state,owned=isOwned,busy=isBusy,cloud=new{revision=2,availability,host="PC A",latest=new{revision=2,hash=new string('a',64),time="2026-09-26T23:36:00Z",host="PC A"}}}));Handle(data.RootElement);
  }
  void Capture(string name){UpdateLayout();var bitmap=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(this);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using var stream=File.Create(Path.Combine(dir,name+".png"));encoder.Save(stream);}
  try{
   await LoadProfiles([]);Require(SettingsPage.Visibility==Visibility.Visible);
   await LoadProfiles(["pc-a"]);Require(Profiles.SelectedItem?.ToString()=="pc-a");
   confirmedProfile="pc-b";await LoadProfiles(["pc-a","pc-b"]);Require(Profiles.SelectedItem?.ToString()=="pc-b");
   ShowPage("Home");
   using(var pending=JsonDocument.Parse("{\"type\":\"state\",\"consulting\":true}"))Handle(pending.RootElement);
   Require(!PrimaryButton.IsEnabled&&StateTitle.Text=="Consultando cloud...");
   State("idle",false,false,"free");Require(HostText.Text=="Nenhum"&&SyncText.Text.StartsWith("PC A • "));Require(PrimaryButton.IsEnabled&&PrimaryButton.Content.ToString()=="ASSUMIR E INICIAR");PrimaryClick(this,new RoutedEventArgs());Require(demoCommands.Last().Contains("start"));
   State("running",true,false);Require(!PrimaryButton.IsEnabled&&action=="");await Task.Delay(80);Capture("running");PrimaryClick(this,new RoutedEventArgs());Require(demoCommands.Last().Contains("start"));
   State("finalizing",true,true);Require(!PrimaryButton.IsEnabled&&Steps.Items.Count==6);ShowPage("Home");await Task.Delay(100);Capture("finalizing");
   State("recovery_required",false,false,"recovery_required");Require(RecoveryPanel.Visibility==Visibility.Visible&&!RecoverButton.IsEnabled);Capture("recovery");
   using(var resumable=JsonDocument.Parse("{\"type\":\"state\",\"phase\":\"recovery_required\",\"recoveryEligible\":true,\"owned\":false,\"busy\":false}"))Handle(resumable.RootElement);
   Require(RecoverButton.IsEnabled&&RecoverButton.Content.ToString()=="Retomar sessão deste PC");RecoverClick(this,new RoutedEventArgs());Require(demoCommands.Last().Contains("resume")&&!RecoverButton.IsEnabled);
   State("completed",false,false,"free");
   foreach(var page in new[]{"Home","History","Diagnostics","Settings"}){ShowPage(page);await Task.Delay(80);Capture(page.ToLowerInvariant());}
   ShowPage("Home");State("idle",false,false,"busy");Require(!PrimaryButton.IsEnabled&&HostText.Text=="PC A");Capture("other-host");
   using(var disconnected=JsonDocument.Parse("{\"type\":\"state\",\"phase\":\"idle\",\"owned\":false,\"busy\":false,\"cloud\":null}"))Handle(disconnected.RootElement);
   Require(!PrimaryButton.IsEnabled&&SummaryCanonical.Text=="Não verificado");Capture("offline");
   State("idle",false,false,"free");Width=1040;Height=780;await Task.Delay(160);Require(Grid.GetRow(RightWorkspace)==1&&SummaryCards.Columns==2);Capture("compact");
   Width=1540;Height=1040;await Task.Delay(120);ShowPage("Settings");
   AdvancedProfiles.IsExpanded=true;AdvancedProfiles.BringIntoView();await Task.Delay(100);Capture("local-profiles");
   Require(CredentialStatus.Text=="Credencial não configurada");
   TokenInput.Password="SYNTHETIC_UI_CREDENTIAL_0123456789";TokenClick(this,new RoutedEventArgs());
   Require(TokenInput.Password==""&&CredentialEditor.Visibility==Visibility.Collapsed&&CredentialStatus.Text=="Credencial configurada com segurança neste PC"&&demoCommands.Last()=="credential-reconnect");
   CredentialStatus.BringIntoView();await Task.Delay(100);Capture("credential-saved");
   ReplaceTokenClick(this,new RoutedEventArgs());Require(CredentialEditor.Visibility==Visibility.Visible&&TokenInput.Password=="");
   Require(!credential!.Remove(false)&&credential.IsStored);credential.Remove(true);UpdateCredentialStatus();Require(CredentialEditor.Visibility==Visibility.Visible&&!credential.IsStored);
   TokenInput.Password="PRIVATE_TOKEN_SENTINEL";Require(!DiagnosticText.Text.Contains("SENTINEL"));TokenInput.BringIntoView();await Task.Delay(150);Capture("masked-token");
   File.WriteAllText(Path.Combine(dir,"ui-test-result.txt"),"PASS: WPF navigation, action dispatch, finalizing disabled, six steps, recovery screen, safe diagnostic; running cannot publish; automatic profile selection, advanced profile management; responsive layout, busy/offline honest placeholders; secure credential save/replace/remove UI and reconnect; thirteen rendered views.");
  }catch{File.WriteAllText(Path.Combine(dir,"ui-test-result.txt"),"FAIL: UI_TEST_FAILED");Environment.ExitCode=1;}
  finally{allowClose=true;Close();}
 }
 bool captured;
 void CaptureIfRequested()
 {
  var args=Environment.GetCommandLineArgs();int i=Array.IndexOf(args,"--capture");if(captured||i<0||i+1>=args.Length)return;captured=true;
  Dispatcher.BeginInvoke(async()=>{await Task.Delay(300);UpdateLayout();var bitmap=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(this);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using var stream=File.Create(args[i+1]);encoder.Save(stream);if(args.Contains("--exit-after-capture")){allowClose=true;Send(new{action="quit"});Close();}});
 }
}
