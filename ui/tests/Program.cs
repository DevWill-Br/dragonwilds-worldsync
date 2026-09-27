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
