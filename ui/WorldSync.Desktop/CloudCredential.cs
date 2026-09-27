using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
namespace WorldSync.Desktop;

public interface ICredentialStore { string? Read(); void Write(string token); void Delete(); }

// Generic credential scoped by Windows to the signed-in user; no application file.
public sealed class WindowsCredentialStore : ICredentialStore {
 public const string ProductionTarget="WorldSync/CloudApi/v2";
 readonly string target;
 public WindowsCredentialStore(string target=ProductionTarget){this.target=target;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 struct Credential {
  public uint Flags,Type;
  [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
  [MarshalAs(UnmanagedType.LPWStr)] public string? Comment;
  public long LastWritten;
  public uint CredentialBlobSize;
  public IntPtr CredentialBlob;
  public uint Persist,AttributeCount;
  public IntPtr Attributes;
  [MarshalAs(UnmanagedType.LPWStr)] public string? TargetAlias;
  [MarshalAs(UnmanagedType.LPWStr)] public string? UserName;
 }
 [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)]
 [return:MarshalAs(UnmanagedType.Bool)] static extern bool CredRead(string target,uint type,uint flags,out IntPtr credential);
 [DllImport("advapi32.dll",EntryPoint="CredWriteW",CharSet=CharSet.Unicode,SetLastError=true)]
 [return:MarshalAs(UnmanagedType.Bool)] static extern bool CredWrite(ref Credential credential,uint flags);
 [DllImport("advapi32.dll",EntryPoint="CredDeleteW",CharSet=CharSet.Unicode,SetLastError=true)]
 [return:MarshalAs(UnmanagedType.Bool)] static extern bool CredDelete(string target,uint type,uint flags);
 [DllImport("advapi32.dll")] static extern void CredFree(IntPtr buffer);
 static Exception Unavailable()=>new InvalidOperationException("SECURE_CREDENTIAL_UNAVAILABLE");
 public string? Read(){
  if(!CredRead(target,1,0,out var pointer)){if(Marshal.GetLastWin32Error()==1168)return null;throw Unavailable();}
  byte[]? bytes=null;
  try{var c=Marshal.PtrToStructure<Credential>(pointer);if(c.CredentialBlobSize is 0 or >2560)throw Unavailable();bytes=new byte[c.CredentialBlobSize];Marshal.Copy(c.CredentialBlob,bytes,0,bytes.Length);return Encoding.UTF8.GetString(bytes);}
  finally{if(bytes!=null)CryptographicOperations.ZeroMemory(bytes);CredFree(pointer);}
 }
 public void Write(string token){
  var bytes=Encoding.UTF8.GetBytes(token);if(bytes.Length is 0 or >2560){CryptographicOperations.ZeroMemory(bytes);throw Unavailable();}
  var blob=Marshal.AllocCoTaskMem(bytes.Length);
  try{Marshal.Copy(bytes,0,blob,bytes.Length);var c=new Credential{Type=1,TargetName=target,CredentialBlobSize=(uint)bytes.Length,CredentialBlob=blob,Persist=2,UserName="WorldSync"};if(!CredWrite(ref c,0))throw Unavailable();}
  finally{CryptographicOperations.ZeroMemory(bytes);Marshal.Copy(bytes,0,blob,bytes.Length);Marshal.FreeCoTaskMem(blob);}
 }
 public void Delete(){if(!CredDelete(target,1,0)&&Marshal.GetLastWin32Error()!=1168)throw Unavailable();}
}

public sealed class CloudCredential {
 readonly ICredentialStore store;readonly Func<string?> environment;readonly Action<string?> reconnect;
 string? explicitToken;
 public CloudCredential(ICredentialStore store,Func<string?> environment,Action<string?> reconnect){this.store=store;this.environment=environment;this.reconnect=reconnect;}
 public bool IsStored=>!string.IsNullOrEmpty(store.Read());
 public string? Resolve()=>explicitToken??store.Read()??environment();
 public static string? EnvironmentToken(){
  var process=System.Environment.GetEnvironmentVariable("WORLDSYNC_API_TOKEN");
  return !string.IsNullOrWhiteSpace(process)?process:System.Environment.GetEnvironmentVariable("WORLDSYNC_API_TOKEN",EnvironmentVariableTarget.User);
 }
 public void Save(string token){
  if(token.Length<24||Encoding.UTF8.GetByteCount(token)>2560||token.Any(char.IsWhiteSpace)||token.Any(char.IsControl))throw new InvalidOperationException("INVALID_CREDENTIAL");
  store.Write(token);explicitToken=token;reconnect(token);
 }
 public bool Remove(bool confirmed){if(!confirmed)return false;store.Delete();explicitToken=null;reconnect(Resolve());return true;}
}
