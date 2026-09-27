using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace WorldSync.Desktop;
// UI preference only. Profiles remain validated by the existing host validator.
public static class ProfileSelection
{
 public static string? Choose(IEnumerable<string> valid,string? last)
 {
  var names=valid.Distinct().OrderBy(n=>n,StringComparer.Ordinal).ToArray();
  return last!=null&&names.Contains(last)?last:names.FirstOrDefault();
 }
 public static string? Read(string root)
 {
  try {var name=System.IO.File.ReadAllText(File(root)).Trim();return Regex.IsMatch(name,"^[a-z0-9-]{1,40}$")?name:null;}catch{return null;}
 }
 public static bool Save(string root,string name)
 {
  if(!Regex.IsMatch(name,"^[a-z0-9-]{1,40}$"))return false;
  try {var file=File(root);System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(file)!);var temp=file+"."+Guid.NewGuid()+".tmp";System.IO.File.WriteAllText(temp,name);System.IO.File.Move(temp,file,true);return true;}catch{return false;}
 }
 static string File(string root){
  var file=System.IO.Path.Combine(root,"preferences","last-profile.txt");
  for(var p=file;!string.IsNullOrEmpty(p);p=System.IO.Path.GetDirectoryName(p))if((System.IO.File.Exists(p)||System.IO.Directory.Exists(p))&&(System.IO.File.GetAttributes(p)&System.IO.FileAttributes.ReparsePoint)!=0)throw new System.IO.IOException("UNSAFE_PREFERENCE_PATH");
  return file;
 }
 public static async Task<string[]> Validate(string root,IEnumerable<string> candidates)
 {
  var bundled=System.IO.Path.Combine(AppContext.BaseDirectory,"runtime","node.exe");
  var start=new ProcessStartInfo(System.IO.File.Exists(bundled)?bundled:"node"){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
  start.ArgumentList.Add("--input-type=module");start.ArgumentList.Add("-e");
  start.ArgumentList.Add("import {loadProfile} from './src/local-game/profile.mjs';let input='';for await(const c of process.stdin)input+=c;const valid=[];for(const n of JSON.parse(input)){if(!/^[a-z0-9-]{1,40}$/.test(n))continue;try{await loadProfile(n);valid.push(n);}catch{}}console.log(JSON.stringify(valid));");
  using var process=new Process{StartInfo=start};process.Start();
  var output=process.StandardOutput.ReadToEndAsync();var errors=process.StandardError.ReadToEndAsync();
  await process.StandardInput.WriteAsync(JsonSerializer.Serialize(candidates));process.StandardInput.Close();
  using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(15));
  try {await process.WaitForExitAsync(timeout.Token);}catch(OperationCanceledException){process.Kill();throw new InvalidOperationException("PROFILE_VALIDATION_UNAVAILABLE");}
  await errors;if(process.ExitCode!=0)throw new InvalidOperationException("PROFILE_VALIDATION_UNAVAILABLE");
  return JsonSerializer.Deserialize<string[]>(await output)??[];
 }
}
