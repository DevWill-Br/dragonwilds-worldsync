using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;
namespace WorldSync.Desktop;
public sealed class CoreBridge
{
 private Process? process;
 public event Action<JsonElement>? Message;
 public event Action? UnexpectedExit;
 public string Root {get;}
 public CoreBridge(string root){Root=root;}
 public static string LocateRoot()
 {
  var args=Environment.GetCommandLineArgs(); var i=Array.IndexOf(args,"--core");
  if(i>=0 && i+1<args.Length)return Path.GetFullPath(args[i+1]);
  for(var d=new DirectoryInfo(AppContext.BaseDirectory);d!=null;d=d.Parent){
   if(File.Exists(Path.Combine(d.FullName,"core","ui","bridge.mjs")))return Path.Combine(d.FullName,"core");
   if(File.Exists(Path.Combine(d.FullName,"ui","bridge.mjs")))return d.FullName;
  }
  throw new InvalidOperationException("CORE_MISSING");
 }
 public void Start(string? token=null)
 {
  var bundled=Path.Combine(AppContext.BaseDirectory,"runtime","node.exe");
  var p=new ProcessStartInfo(File.Exists(bundled)?bundled:"node") {WorkingDirectory=Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
  if(File.Exists(bundled))p.Environment["PATH"]=Path.GetDirectoryName(bundled)+";"+Environment.GetEnvironmentVariable("PATH");
  p.ArgumentList.Add(Path.Combine(Root,"ui","bridge.mjs"));
  token ??= Environment.GetEnvironmentVariable("WORLDSYNC_API_TOKEN") ?? Environment.GetEnvironmentVariable("WORLDSYNC_API_TOKEN",EnvironmentVariableTarget.User);
  if(!string.IsNullOrEmpty(token))p.Environment["WORLDSYNC_API_TOKEN"]=token;
  process=new Process{StartInfo=p,EnableRaisingEvents=true};
  process.OutputDataReceived+=(_,e)=>{if(e.Data==null)return;try{using var json=JsonDocument.Parse(e.Data);Message?.Invoke(json.RootElement.Clone());}catch(JsonException){}};
  process.ErrorDataReceived+=(_,_)=>{}; // Never log raw stderr (including setup errors).
  process.Exited+=(_,_)=>UnexpectedExit?.Invoke();
  process.Start();process.BeginOutputReadLine();process.BeginErrorReadLine();
 }
 public void Send(object command)
 {
  if(process is not {HasExited:false})throw new InvalidOperationException("BRIDGE_UNAVAILABLE");
  process.StandardInput.WriteLine(JsonSerializer.Serialize(command));process.StandardInput.Flush();
 }
 // No Kill()/job-object cleanup: closing a UI must not kill a supervised writer.
}
