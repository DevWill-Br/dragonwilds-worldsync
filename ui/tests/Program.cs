using WorldSync.Desktop;
var count=0;
void Check(bool ok){if(!ok)throw new Exception("Presentation test failed");count++;}
var free=Presentation.Map("idle","free",false,false,true);Check(free.Key=="free"&&free.Action=="start"&&free.Enabled);
var running=Presentation.Map("running","busy",true,false,true);Check(running.Key=="running"&&running.Action=="stop"&&running.Enabled);
Check(Presentation.Map("prepared","busy",true,false,true).Action=="start");
Check(Presentation.Map("stopped","busy",true,false,true).Action=="publish");
foreach(var phase in new[]{"acquiring","importing","starting","finalizing","stopping","publishing"})Check(!Presentation.Map(phase,"busy",true,true,true).Enabled);
Check(Presentation.Map("finalizing","busy",true,true,true).Step==0);
Check(Presentation.Map("stopping","busy",true,true,true).Step==2);
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
if(File.Exists(Path.Combine(repo,"tools/host/host.mjs"))){
 var good="ui-valid-"+Guid.NewGuid().ToString("N")[..12];var bad="ui-bad-"+Guid.NewGuid().ToString("N")[..12];
 var goodFile=Path.Combine(repo,"config/hosts",good+".local.json");var badFile=Path.Combine(repo,"config/hosts",bad+".local.json");
 try{
  File.WriteAllText(goodFile,"\uFEFF"+System.Text.Json.JsonSerializer.Serialize(new{profile=good,worldId="test",cloudUrl="https://example.com",installPath=repo,labPath=repo,wsbPath=Path.Combine(repo,"test.exe"),wsbFile=Path.Combine(repo,"test.wsb"),machineId=Guid.NewGuid().ToString()}));
  File.WriteAllText(badFile,"{invalid");
  var valid=await ProfileSelection.Validate(repo,[good,bad,"missing-profile","../escape"]);
  Check(valid.SequenceEqual(new[]{good}));
  Console.WriteLine("PASS: existing core validator accepts BOM profile and excludes malformed/missing/invalid names.");
 }finally{File.Delete(goodFile);File.Delete(badFile);}
}
