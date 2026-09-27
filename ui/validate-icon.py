import ctypes,struct,sys
from pathlib import Path
# Read PE resources without executing the application.
exe=Path(sys.argv[1]).resolve();ico=Path(__file__).parent/'WorldSync.Desktop/Assets/Brand/app.ico'
b=ico.read_bytes();reserved,kind,count=struct.unpack_from('<HHH',b)
assert (reserved,kind,count)==(0,1,9)
frames={}
for i in range(count):
 w,h,_,_,planes,bits,length,offset=struct.unpack_from('<BBBBHHII',b,6+16*i)
 frames[(w or 256,h or 256)]=b[offset:offset+length]
assert sorted(w for w,h in frames)==[16,20,24,32,40,48,64,128,256]
k=ctypes.WinDLL('kernel32',use_last_error=True)
k.LoadLibraryExW.argtypes=[ctypes.c_wchar_p,ctypes.c_void_p,ctypes.c_uint];k.LoadLibraryExW.restype=ctypes.c_void_p
k.FindResourceW.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p];k.FindResourceW.restype=ctypes.c_void_p
k.LoadResource.argtypes=[ctypes.c_void_p,ctypes.c_void_p];k.LoadResource.restype=ctypes.c_void_p
k.LockResource.argtypes=[ctypes.c_void_p];k.LockResource.restype=ctypes.c_void_p
k.SizeofResource.argtypes=[ctypes.c_void_p,ctypes.c_void_p];k.SizeofResource.restype=ctypes.c_uint
k.FreeLibrary.argtypes=[ctypes.c_void_p]
module=k.LoadLibraryExW(str(exe),None,2|32);assert module
callback=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_ssize_t)
k.EnumResourceNamesW.argtypes=[ctypes.c_void_p,ctypes.c_void_p,callback,ctypes.c_ssize_t]
def resource(name,kind):
 r=k.FindResourceW(module,name,kind);assert r
 return ctypes.string_at(k.LockResource(k.LoadResource(module,r)),k.SizeofResource(module,r))
groups=[]
@callback
def collect(mod,kind,name,data):
 groups.append(resource(name,14));return True
try:
 assert k.EnumResourceNamesW(module,14,collect,0)
 matched=False
 for g in groups:
  n=struct.unpack_from('<H',g,4)[0]
  if n!=9:continue
  for i in range(n):
   w,h,_,_,_,_,length,rid=struct.unpack_from('<BBBBHHIH',g,6+14*i)
   assert resource(rid,3)==frames[(w or 256,h or 256)]
  matched=True
 assert matched
 print('PASS: all nine EXE icon resources exactly match app.ico')
finally:k.FreeLibrary(module)
