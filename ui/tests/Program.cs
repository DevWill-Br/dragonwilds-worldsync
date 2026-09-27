using WorldSync.Desktop;
var count=0;
void Check(bool ok){if(!ok)throw new Exception("Presentation test failed");count++;}
var free=Presentation.Map("idle","free",false,false,true);Check(free.Key=="free"&&free.Action=="start"&&free.Enabled);
var running=Presentation.Map("running","busy",true,false,true);Check(running.Key=="running"&&running.Action==""&&!running.Enabled);
Check(!Presentation.Map("prepared","busy",true,false,true).Enabled);
Check(!Presentation.Map("stopped","busy",true,false,true).Enabled);
foreach(var phase in new[]{"acquiring","importing","starting","finalizing","stopping","publishing"})Check(!Presentation.Map(phase,"busy",true,true,true).Enabled);
Check(Presentation.Map("finalizing","busy",true,true,true).Step==0);
Check(!Presentation.Map("waiting_for_game","busy",true,false,true).Enabled);
Check(Presentation.Map("completed","free",false,false,true).Step==5);
Check(Presentation.Map("recovery_required","busy",false,false,true).Key=="recovery_required");
Check(!Presentation.Map("idle","recovery_required",false,false,true).Enabled);
Check(!Presentation.Map("idle","free",false,false,false).Enabled);
Check(!Presentation.Error("SECRET_SAMPLE").Contains("SECRET_SAMPLE"));
Console.WriteLine($"PASS: {count} visual state, action, finalization and safe error checks.");
Check(!Presentation.CanClose(true,false));Check(!Presentation.CanClose(true,true));Check(!Presentation.CanClose(false,true));Check(Presentation.CanClose(false,false));
Console.WriteLine("PASS: closing guard preserves hosting and finalization.");

Check(ProfileSelection.Choose([],"old")==null);
Check(ProfileSelection.Choose(["pc-a"],"missing")=="pc-a");
Check(ProfileSelection.Choose(["pc-a","pc-b"],"pc-b")=="pc-b");
Check(ProfileSelection.Choose(["pc-b","pc-a"],"deleted")=="pc-a");
var prefsRoot=Path.Combine(Path.GetTempPath(),"worldsync-ui-prefs-"+Guid.NewGuid());
Check(ProfileSelection.Save(prefsRoot,"pc-b"));Check(ProfileSelection.Read(prefsRoot)=="pc-b");
Check(!ProfileSelection.Save(prefsRoot,"../invalid"));Check(ProfileSelection.Read(prefsRoot)=="pc-b");
Console.WriteLine("PASS: zero/single/multiple profiles, missing preference, persistence, invalid preference.");

var repo=Directory.GetCurrentDirectory();
var syntheticAppData=Path.Combine(repo,"tests/.scratch/user-data-csharp",Guid.NewGuid().ToString());
Environment.SetEnvironmentVariable("LOCALAPPDATA",syntheticAppData);
var shared=Path.Combine(syntheticAppData,"WorldSync");
Check(ProfileSelection.Save(shared,"pc-b"));Check(ProfileSelection.Read(shared)=="pc-b");
Check(Presentation.CurrentHost("free","old")=="Nenhum");Check(Presentation.CurrentHost("busy","PC-B")=="PC-B");
Check(Presentation.LastSync("WILLI","2026-09-27T06:29:00Z").StartsWith("WILLI • "));Check(Presentation.LastSync("","")=="Não disponível • Não disponível");
if(File.Exists(Path.Combine(repo,"src/local-game/profile.mjs"))){
 var good="ui-valid-"+Guid.NewGuid().ToString("N")[..12];var bad="ui-bad-"+Guid.NewGuid().ToString("N")[..12];
 var goodFile=Path.Combine(shared,"profiles",good+".local.json");var badFile=Path.Combine(shared,"profiles",bad+".local.json");
 try{
  Directory.CreateDirectory(Path.GetDirectoryName(goodFile)!);
  File.WriteAllText(goodFile,"\uFEFF"+System.Text.Json.JsonSerializer.Serialize(new{mode="local-game",profile=good,worldId="test",displayName="Synthetic",cloudUrl="https://example.com",saveRoot=repo,fileName="synthetic.sav",autoLaunch=true,machineId=Guid.NewGuid().ToString()}));
  File.WriteAllText(badFile,"{invalid");
  var valid=await ProfileSelection.Validate(repo,[good,bad,"missing-profile","../escape"]);
  Check(valid.SequenceEqual(new[]{good}));
  Console.WriteLine("PASS: existing core validator accepts BOM profile and excludes malformed/missing/invalid names.");
 }finally{File.Delete(goodFile);File.Delete(badFile);}
}
CredentialTests.Run();

await CredentialTests.BridgeRoundtrip();

Check(Presentation.CanResume("recovery_required",true,false));
Check(!Presentation.CanResume("recovery_required",false,false));
Check(!Presentation.CanResume("recovery_required",true,true));
Check(!Presentation.CanResume("running",true,false));
Console.WriteLine("PASS: resume requires validated recovery, no active command; running cannot invoke recovery.");
