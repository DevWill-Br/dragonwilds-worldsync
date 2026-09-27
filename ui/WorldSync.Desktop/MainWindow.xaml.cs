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
 bool owned,busy,allowClose,changingProfiles,restarting,demo;
 string action="",phase="idle",world="",endpoint="",sandbox="Não verificado",server="Não observado",api="Aguardando",visual="idle";
 string sessionStatus="Não verificada";
 int revision;
 readonly Dictionary<string,RevisionRow> history=new();
 readonly string[] stepNames=["Aguardando autosave","Autosave confirmado","Encerrando servidor","Verificando save","Publicando revisão","Concluído"];
 public record RevisionRow(string World,string Endpoint,int Revision,string Time,string Host,string Hash);
 public MainWindow()
 {
  InitializeComponent();
  Loaded+=async(_,_)=>{
   demo=Environment.GetCommandLineArgs().Contains("--demo");
   if(demo){RenderDemo();await Task.Delay(250);if(Environment.GetCommandLineArgs().Contains("--ui-test")){await UiSmoke();return;}CaptureIfRequested();return;}
   try{StartBridge();}catch{ShowNotice("O core ou Node não foi encontrado. Extraia o pacote completo antes de abrir o app.");}
  };
 }
 void StartBridge(string? token=null)
 {
  var b=new CoreBridge(CoreBridge.LocateRoot());bridge=b;
  b.Message+=m=>Dispatcher.BeginInvoke(()=>{if(ReferenceEquals(bridge,b))Handle(m);});
  b.UnexpectedExit+=()=>Dispatcher.BeginInvoke(()=>{if(!allowClose && !restarting && ReferenceEquals(bridge,b))ShowNotice("A conexão com o supervisor terminou. Confira o estado antes de iniciar outra operação.");});
  b.Start(token);
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
    var selected=Profiles.SelectedItem as string;changingProfiles=true;Profiles.Items.Clear();
    foreach(var n in m.GetProperty("names").EnumerateArray())Profiles.Items.Add(n.GetString());
    changingProfiles=false;
    if(Profiles.Items.Count>0)Profiles.SelectedItem=selected!=null&&Profiles.Items.Contains(selected)?selected:Profiles.Items[0];
    else {ShowPage("Settings");SetupTitle.Text="Bem-vindo. Vamos preparar este PC.";Send(new{action="inspect"});}
    break;
   case "profile":
    world=S(m,"worldId");WorldName.Text=world=="worldsynctest"?"WorldSyncTest":world;endpoint=S(m,"endpoint");EndpointInput.Text=endpoint;
    ProfileInput.Text=S(m,"profile");WorldInput.Text=world;LabInput.Text=S(m,"labPath");InstallInput.Text=S(m,"installPath");
    HostOptions.Text="Host: "+S(m,"host")+" • instalação somente leitura • rede do Sandbox habilitada";
    Notice.Visibility=Visibility.Collapsed;Send(new{action="inspect"});break;
   case "state":
    owned=B(m,"owned");busy=B(m,"busy");phase=S(m,"phase");
    var connected=m.TryGetProperty("cloud",out var c)&&c.ValueKind==JsonValueKind.Object;
    var avail=connected?S(c,"availability"):"unknown";
    sessionStatus=avail switch {"free"=>"Livre","busy"=>"Hospedando","committing"=>"Publicando","recovery_required"=>"Recuperação necessária",_=>"Não verificada"};
    var v=Presentation.Map(phase,avail,owned,busy,connected);visual=v.Key;
    StateBadge.Text=v.Key switch {"free"=>"DISPONÍVEL","running"=>"SERVIDOR ONLINE","finalizing"=>"FINALIZANDO","recovery_required"=>"RECUPERAÇÃO NECESSÁRIA","publishing"=>"SINCRONIZANDO","completed"=>"CONCLUÍDO","assuming"=>"PREPARANDO","prepared"=>"PREPARADO","busy"=>"EM USO",_=>"INDISPONÍVEL"};StateTitle.Text=v.Title;StateDetail.Text=v.Detail;
    action=v.Action;PrimaryButton.Content=v.Cta;PrimaryButton.IsEnabled=v.Enabled && (connected && N(c,"revision")>0);
    Profiles.IsEnabled=!owned&&!busy;SetupButton.IsEnabled=TokenButton.IsEnabled=CredentialsButton.IsEnabled=!owned&&!busy;
    RecoveryPanel.Visibility=v.Key=="recovery_required"?Visibility.Visible:Visibility.Collapsed;
    RecoverButton.IsEnabled=B(m,"recoveryEligible")&&!busy;
    RecoveryHint.Text=RecoverButton.IsEnabled?"Selecione o backup preservado para executar a recuperação já validada.":"Este caso não dispõe de recuperação genérica validada. Copie o diagnóstico e preserve o laboratório.";
    RenderSteps(v.Step);
    api=connected?"Disponível":"Indisponível";CloudText.Text="Cloud: "+api;
    server=owned&&phase=="running"?"Hospedando (supervisor)":owned&&phase=="finalizing"?"Aguardando autosave":phase is "stopped" or "completed"?"Encerrado (registro local)":"Não observado ao vivo";
    if(connected){
     revision=N(c,"revision");RevisionText.Text="#"+revision;
     HostText.Text=avail=="free"?"Nenhum host":S(c,"host");
     IntegrityText.Text=revision>0?"SHA-256 canônico registrado":"Sem revisão publicada";
     if(c.TryGetProperty("latest",out var l)&&l.ValueKind==JsonValueKind.Object){
      var time=S(l,"time");SyncText.Text=LocalTime(time);
      var row=new RevisionRow(world,endpoint,N(l,"revision"),time,S(l,"host"),S(l,"hash"));
      history[$"{endpoint}|{world}|{row.Revision}"]=row;RenderHistory();
     }
    }
    if(!string.IsNullOrEmpty(S(m,"error")))ShowNotice(Presentation.Error(S(m,"error")));

    RenderLauncherStatus(v.Key,connected);UpdateDiagnostic();CaptureIfRequested();break;
   case "checks":
    sandbox=B(m,"sandboxRunning")?"Em execução":B(m,"sandbox")?"Habilitado; VM não confirmada":"Indisponível";
    ChecksText.Text=$"{Check(B(m,"sandbox"))} Windows Sandbox   •   {Check(B(m,"virtualization"))} Virtualização\n{Check(B(m,"originalInstall"))} Servidor instalado (local padrão; não utilizado)\n{Check(B(m,"copiedInstall"))} Instalação copiada   •   {Check(B(m,"lab"))} Laboratório\n{Check(B(m,"token"))} Token no ambiente   •   {Check(B(m,"credentials"))} Credenciais locais preparadas";
    UpdateDiagnostic();break;
   case "setup":busy=false;ShowNotice("Perfil criado pela automação existente. Agora configure as credenciais locais.");break;
   case "credentials":busy=false;OwnerInput.Clear();AdminInput.Clear();WorldPasswordInput.Clear();ShowNotice("Credenciais do laboratório salvas sem exibir os valores.");Send(new{action="inspect"});break;
   case "error":busy=false;ShowNotice(Presentation.Error(S(m,"code")));break;
   case "closeBlocked":ShowNotice("O supervisor está ativo. Conclua a finalização e sincronização antes de fechar.");break;
   case "closed":
    if(restarting){restarting=false;StartBridge(pendingToken);pendingToken=null;}
    else {allowClose=true;Close();}break;
  }
 }
 static string Check(bool value)=>value?"✓":"○";
 static string LocalTime(string utc)=>DateTimeOffset.TryParse(utc,out var d)?d.ToLocalTime().ToString("dd MMM • HH:mm"):"—";
 // Presentation only: this clock measures observation in this UI, not server uptime.
 DateTimeOffset? runningObservedSince;
 void RenderLauncherStatus(string key,bool connected)
 {
  var attention=key is "recovery_required" or "error";
  StateBadge.Foreground=new SolidColorBrush(attention?Color.FromRgb(240,192,116):Color.FromRgb(85,224,188));
  StatusSurface.Background=new SolidColorBrush(attention?Color.FromRgb(65,47,28):Color.FromRgb(25,61,48));
  StatusSurface.BorderBrush=new SolidColorBrush(attention?Color.FromRgb(131,99,51):Color.FromRgb(50,110,83));
  PrimaryButton.Tag=key=="running"?"■":key is "finalizing" or "publishing"?"◷":"▶";
  ApiHealth.Text=connected?"●  Saudável":"○  Indisponível";
  ApiHealth.Foreground=new SolidColorBrush(connected?Color.FromRgb(85,224,188):Color.FromRgb(173,158,137));
  CloudSession.Text=sessionStatus;
  RunningPanel.Visibility=key=="running"?Visibility.Visible:Visibility.Collapsed;
  FlowSurface.Visibility=key=="running"?Visibility.Collapsed:Visibility.Visible;
  if(key=="running"){
   runningObservedSince??=DateTimeOffset.UtcNow;
   var elapsed=DateTimeOffset.UtcNow-runningObservedSince.Value;
   SessionDuration.Text=$"{(int)elapsed.TotalHours:00}:{elapsed.Minutes:00}:{elapsed.Seconds:00}";
  }else runningObservedSince=null;
 }
 void RenderSteps(int step)
 {
  Steps.Items.Clear();SummaryCards.Visibility=step>=0&&step<5?Visibility.Collapsed:Visibility.Visible;
  var finalizing=step>=0&&step<5;
  Journey.Visibility=finalizing?Visibility.Collapsed:Visibility.Visible;
  Steps.Visibility=finalizing?Visibility.Visible:Visibility.Collapsed;
  FlowTitle.Text=finalizing?"Finalização segura":step==5?"Sua aventura está sincronizada":"Da última aventura à próxima";
  FlowSummary.Text=finalizing?"Etapas confirmadas pelo core":step==5?"Revisão confirmada • sessão liberada":"Um mundo contínuo, quatro passos.";
  if(step<0)return;
  for(int i=0;i<stepNames.Length;i++){
   var current=i==step;
   Steps.Items.Add(new Border {
    Background=new SolidColorBrush(current?Color.FromRgb(25,65,50):Color.FromRgb(19,29,37)),
    BorderBrush=new SolidColorBrush(current?Color.FromRgb(64,150,114):Color.FromRgb(36,51,59)),
    BorderThickness=new Thickness(1),CornerRadius=new CornerRadius(9),Padding=new Thickness(12,13,12,13),Margin=new Thickness(0,4,10,4),
    Child=new TextBlock{Text=(i<step||step==5?"✓  ":current?"●  ":"○  ")+stepNames[i],FontSize=12,FontWeight=current?FontWeights.SemiBold:FontWeights.Normal,
     Foreground=new SolidColorBrush(i<=step?Color.FromRgb(85,224,188):Color.FromRgb(133,153,165))}
   });
  }
 }
 void RenderHistory()
 {
  HistoryItems.Items.Clear();var rows=history.Values.Where(r=>r.World==world&&r.Endpoint==endpoint).OrderByDescending(r=>r.Revision).ToArray();
  HistoryEmpty.Visibility=rows.Length==0?Visibility.Visible:Visibility.Collapsed;
  foreach(var r in rows)HistoryItems.Items.Add(new TextBlock{Text=$"#{r.Revision}    •    {LocalTime(r.Time)}    •    {r.Host}    •    {r.Hash[..Math.Min(12,r.Hash.Length)]}…    ✓ Publicada",Margin=new Thickness(0,0,0,20)});
 }
 void UpdateDiagnostic()=>DiagnosticText.Text=Presentation.Diagnostic(world,revision,visual,api,sandbox,server,endpoint,sessionStatus);
 void ShowNotice(string text){NoticeText.Text=text;Notice.Visibility=Visibility.Visible;}
 void Navigate(object sender,RoutedEventArgs e)=>ShowPage((sender as Button)?.Tag?.ToString()??"Home");
 void ShowPage(string name){foreach(var button in ((StackPanel)NavHome.Parent).Children.OfType<Button>())button.Background=new SolidColorBrush(button.Tag?.ToString()==name?Color.FromRgb(33,59,59):Colors.Transparent);HomePage.Visibility=name=="Home"?Visibility.Visible:Visibility.Collapsed;HistoryPage.Visibility=name=="History"?Visibility.Visible:Visibility.Collapsed;DiagnosticsPage.Visibility=name=="Diagnostics"?Visibility.Visible:Visibility.Collapsed;SettingsPage.Visibility=name=="Settings"?Visibility.Visible:Visibility.Collapsed;}
 void ProfileChanged(object sender,SelectionChangedEventArgs e){if(!changingProfiles && Profiles.SelectedItem is string name)Send(new{action="select",profile=name});}
 void RefreshClick(object sender,RoutedEventArgs e)=>Send(new{action="refresh"});
 void PrimaryClick(object sender,RoutedEventArgs e){if(!PrimaryButton.IsEnabled||action=="")return;PrimaryButton.IsEnabled=false;busy=true;Send(new{action});}
 void InspectClick(object sender,RoutedEventArgs e)=>Send(new{action="inspect"});
 void CopyDiagnostic(object sender,RoutedEventArgs e){try{Clipboard.SetText(DiagnosticText.Text);ShowNotice("Diagnóstico seguro copiado.");}catch{ShowNotice("A área de transferência está ocupada. Tente novamente.");}}
 void SetupClick(object sender,RoutedEventArgs e){if(owned||busy)return;busy=true;Send(new{action="setup",values=new{profile=ProfileInput.Text.Trim(),worldId=WorldInput.Text.Trim(),installPath=InstallInput.Text.Trim(),labPath=LabInput.Text.Trim()}});}
 void CredentialsClick(object sender,RoutedEventArgs e){if(owned||busy)return;if(OwnerInput.Password.Length==0){ShowNotice("Informe o Owner ID válido no campo protegido.");return;}busy=true;Send(new{action="credentials",values=new{owner=OwnerInput.Password,admin=AdminInput.Password,world=WorldPasswordInput.Password}});OwnerInput.Clear();AdminInput.Clear();WorldPasswordInput.Clear();}
 string? pendingToken;
 void TokenClick(object sender,RoutedEventArgs e){if(owned||busy)return;if(TokenInput.Password.Length<24){ShowNotice("Informe um token válido no campo protegido.");return;}pendingToken=TokenInput.Password;TokenInput.Clear();restarting=true;if(bridge==null){restarting=false;StartBridge(pendingToken);pendingToken=null;}else Send(new{action="quit"});}
 void RecoverClick(object sender,RoutedEventArgs e){if(!RecoverButton.IsEnabled)return;var dialog=new OpenFileDialog{Title="Selecione o backup preservado da sessão",Filter="Save preservado (*.sav)|*.sav",CheckFileExists=true};if(dialog.ShowDialog()==true){busy=true;RecoverButton.IsEnabled=false;Send(new{action="recover",backup=dialog.FileName});}}
 void OnClosing(object? sender,CancelEventArgs e){if(allowClose||demo)return;e.Cancel=true;if(!Presentation.CanClose(owned,busy)){ShowNotice("Mantenha o app aberto até concluir ENCERRAR E SINCRONIZAR. O supervisor continua ativo.");return;}if(bridge==null){allowClose=true;e.Cancel=false;}else Send(new{action="quit"});}
 void RenderDemo()
 {
  world="WorldSyncTest";endpoint="https://dragonwilds-worldsync-api.contactforwillbr.workers.dev";
  WorldName.Text=world=="worldsynctest"?"WorldSyncTest":world;revision=2;RevisionText.Text="#2";StateBadge.Text="DISPONÍVEL";StateTitle.Text="Disponível para jogar";StateDetail.Text="Tudo começa pela última revisão publicada. Seu progresso acompanha o mundo.";HostText.Text="Nenhum host";SyncText.Text="26 set • 20:36";IntegrityText.Text="SHA-256 canônico registrado";CloudText.Text="Cloud: disponível";
  PrimaryButton.IsEnabled=false;api="Disponível (demonstração)";sandbox="Habilitado (demonstração)";UpdateDiagnostic();
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
   State("idle",false,false,"free");Require(PrimaryButton.IsEnabled);PrimaryClick(this,new RoutedEventArgs());Require(demoCommands.Last().Contains("start"));
   State("running",true,false);Require(PrimaryButton.IsEnabled&&action=="stop");await Task.Delay(80);Capture("running");PrimaryClick(this,new RoutedEventArgs());Require(demoCommands.Last().Contains("stop"));
   State("finalizing",true,true);Require(!PrimaryButton.IsEnabled&&Steps.Items.Count==6);ShowPage("Home");await Task.Delay(100);Capture("finalizing");
   State("recovery_required",false,false,"recovery_required");Require(RecoveryPanel.Visibility==Visibility.Visible&&!RecoverButton.IsEnabled);Capture("recovery");
   State("completed",false,false,"free");
   foreach(var page in new[]{"Home","History","Diagnostics","Settings"}){ShowPage(page);await Task.Delay(80);Capture(page.ToLowerInvariant());}
   OwnerInput.Password="PRIVATE_OWNER_SENTINEL";AdminInput.Password="PRIVATE_ADMIN_SENTINEL";WorldPasswordInput.Password="PRIVATE_WORLD_SENTINEL";
   Require(!DiagnosticText.Text.Contains("SENTINEL"));OwnerInput.BringIntoView();await Task.Delay(150);Capture("masked-credentials");
   File.WriteAllText(Path.Combine(dir,"ui-test-result.txt"),"PASS: WPF navigation, action dispatch, finalizing disabled, six steps, recovery screen, safe diagnostic; eight rendered views.");
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
