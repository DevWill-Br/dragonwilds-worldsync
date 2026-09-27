using WorldSync.Desktop;
public static class CredentialTests {
 sealed class MemoryStore:ICredentialStore {public string? Value;public bool Fail;public string? Read()=>Value;public void Write(string token){if(Fail)throw new Exception("synthetic failure");Value=token;}public void Delete()=>Value=null;}
 public static void Run(){
  const string a="synthetic-credential-A-0123456789",b="synthetic-credential-B-0123456789",env="synthetic-environment-0123456789";
  void Require(bool ok){if(!ok)throw new Exception("CREDENTIAL_TEST_FAILED");}
  var log=new StringWriter();var original=Console.Out;Console.SetOut(log);
  try{
   var store=new MemoryStore();var connections=new List<string?>();var c=new CloudCredential(store,()=>env,t=>connections.Add(t));
   Require(!c.IsStored&&c.Resolve()==env);
   c.Save(a);Require(c.IsStored&&store.Read()==a&&c.Resolve()==a&&connections.Count==1&&connections[0]==a);
   store.Value=b;Require(c.Resolve()==a); // explicit wins even if secure store changes
   var reopened=new CloudCredential(store,()=>env,t=>connections.Add(t));Require(reopened.Resolve()==b); // secure wins over env
   reopened.Save(a);Require(store.Read()==a);reopened.Save(b);Require(store.Read()==b&&connections.Last()==b);
   Require(!reopened.Remove(false)&&store.Read()==b);Require(reopened.Remove(true)&&store.Read()==null&&connections.Last()==env);
   var empty=new CloudCredential(store,()=>null,_=>{});Require(empty.Resolve()==null);
   store.Fail=true;var before=connections.Count;try{c.Save(b);throw new Exception("EXPECTED_FAILURE");}catch(Exception e)when(e.Message=="synthetic failure"){}Require(connections.Count==before);store.Fail=false;
   // Real Windows API, unique disposable target: never read/write the production target.
   var target="WorldSync.Tests/"+Guid.NewGuid();var native=new WindowsCredentialStore(target);
   try{Require(native.Read()==null);native.Write(a);Require(new WindowsCredentialStore(target).Read()==a);native.Write(b);Require(native.Read()==b);native.Delete();Require(native.Read()==null);native.Delete();}
   finally{native.Delete();}
   // Profile serialization remains an explicit non-secret shape.
   var profile=System.Text.Json.JsonSerializer.Serialize(new{mode="local-game",profile="synthetic",worldId="synthetic",machineId=Guid.NewGuid()});Require(!profile.Contains(a)&&!profile.Contains(b)&&!profile.Contains("token"));
  }finally{Console.SetOut(original);}
  Require(!log.ToString().Contains(a)&&!log.ToString().Contains(b)&&!log.ToString().Contains(env));
  Console.WriteLine("PASS: Windows credential roundtrip/replace/delete; explicit > secure > environment; removal confirmation; reconnect after save; no credential output or profile fields.");
 }
 public static async Task BridgeRoundtrip(){
  var root=Path.Combine(Path.GetTempPath(),"worldsync-credential-bridge-"+Guid.NewGuid());Directory.CreateDirectory(Path.Combine(root,"ui"));
  // Fake bridge only reports booleans. Never loads a production profile or cloud client.
  await File.WriteAllTextAsync(Path.Combine(root,"ui","bridge.mjs"),"import {createInterface} from 'node:readline';console.log(JSON.stringify({type:'ready',authenticated:process.env.WORLDSYNC_API_TOKEN?.startsWith('synthetic-credential-')===true}));for await(const line of createInterface({input:process.stdin})){if(JSON.parse(line).action==='quit'){console.log(JSON.stringify({type:'closed'}));break;}}");
  async Task Connect(string? token){
   var ready=new TaskCompletionSource<bool>();var closed=new TaskCompletionSource();var bridge=new CoreBridge(root);
   bridge.Message+=m=>{var type=m.GetProperty("type").GetString();if(type=="ready")ready.TrySetResult(m.GetProperty("authenticated").GetBoolean());if(type=="closed")closed.TrySetResult();};
   bridge.Start(token);
   try{if(!await ready.Task.WaitAsync(TimeSpan.FromSeconds(10)))throw new Exception("CREDENTIAL_BRIDGE_FAILED");}
   finally{bridge.Send(new{action="quit"});await closed.Task.WaitAsync(TimeSpan.FromSeconds(10));}
  }
  Task pending=Task.CompletedTask;var store=new MemoryStore();var c=new CloudCredential(store,()=>null,t=>pending=Connect(t));
  c.Save("synthetic-credential-first-0123456789");await pending;
  c.Save("synthetic-credential-second-0123456789");await pending;
  Console.WriteLine("PASS: save/replace automatically start a fresh hidden bridge with memory-only credential; responses contain booleans only.");
 }

}
