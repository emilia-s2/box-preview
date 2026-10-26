using System;
using System.Diagnostics;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

public static partial class BoxPreviewInput {
 [StructLayout(LayoutKind.Sequential)] struct POINT { public int x,y; }
 [StructLayout(LayoutKind.Sequential)] struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] struct DEVICE { public ushort page,usage; public uint flags; public IntPtr window; }
 [StructLayout(LayoutKind.Sequential)] struct HEADER { public uint type,size; public IntPtr device,message; }
 delegate bool EnumWindow(IntPtr window,IntPtr data);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT point);
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr window,uint flags);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr window,out RECT rect);
 [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window,ref POINT point);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback,IntPtr data);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr window);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr window);
 [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window,uint relation);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr window,out RECT rect);
 [DllImport("user32.dll",SetLastError=true)] static extern bool RegisterRawInputDevices(DEVICE[] devices,uint count,uint size);
 [DllImport("user32.dll")] static extern uint GetRawInputData(IntPtr input,uint command,IntPtr data,ref uint size,uint headerSize);
 static readonly Stopwatch clock=Stopwatch.StartNew();
 static readonly ManualResetEventSlim prepared=new ManualResetEventSlim(false);
 static readonly object outputLock=new object(),signalLock=new object(),snapshotLock=new object();
 static uint target,owner;
 static bool rawActive;
 static volatile bool middleEnabled;
 static readonly MouseGesture mouseGesture=new MouseGesture();
 static volatile int mode;
 static int busy,sequence,accepted;
 static long lastSignal=-1000;
 static POINT lastPoint;
 static string lastSource="none";
 static bool probe;
 static int probeDuration;
 static volatile bool shuttingDown;
 static int snapshotBusy;
 static long nextSnapshot;
 static Frame snapshot;
 static bool hoverTracked;
 static POINT hoverPoint;
 static IntPtr hoverWindow;
 static long hoverSince;
 static int warmedFrames,cachedClicks,immediateClicks;
 static int retryBusy;
 sealed class ClickRequest { public IntPtr window;public POINT point;public int seq;public string source;public long at; }
 static ClickRequest activeRequest;
 sealed class Frame:IDisposable {
  public Bitmap image;public Rectangle rect;public POINT point;public IntPtr window;public long at;
  public void Dispose(){if(image!=null){image.Dispose();image=null;}}
 }
 public static bool ProcessExists(int pid){try{using(Process process=Process.GetProcessById(pid))return true;}catch(ArgumentException){return false;}}
 public static bool ModifierHeld(short generic,short left,short right) { return (((ushort)generic|(ushort)left|(ushort)right)&0x8000)!=0; }
 // Observe physical mouse buttons only; modifier keys are sampled at the click.
 public sealed class MouseGesture {
  bool leftHeld,middleHeld;
  public void Reset(bool left,bool middle){leftHeld=left;middleHeld=middle;}
  public int Buttons(ushort flags,bool shift,bool otherModifier,bool middleAllowed){
   bool left=(flags&1)!=0&&!leftHeld,middle=(flags&0x10)!=0&&!middleHeld;
   if((flags&1)!=0)leftHeld=true;if((flags&2)!=0)leftHeld=false;
   if((flags&0x10)!=0)middleHeld=true;if((flags&0x20)!=0)middleHeld=false;
   if(otherModifier)return 0;
   if(left&&shift)return 1;
   if(middle&&!shift&&middleAllowed)return 2;
   return 0;
  }
 }
 public static bool MiddleCommand(string line){if(line=="middle 1"){middleEnabled=true;return true;}if(line=="middle 0"){middleEnabled=false;return true;}return false;}
 public static bool MiddleEnabled(){return middleEnabled;}
 // Transfer focus while the caller is still foreground; report actual activation.
 public static bool FocusAllowed(uint foreground,uint expected,uint parent){return expected>0&&parent>0&&(foreground==0||foreground==expected||foreground==parent);}
 static long UtcMilliseconds(){return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();}
 static string FocusGame(long expires){
  if(shuttingDown||probe)return "reader-stopped";
  if(expires<UtcMilliseconds()||expires>UtcMilliseconds()+1000)return "expired";
  uint foreground;GetWindowThreadProcessId(GetForegroundWindow(),out foreground);
  if(!FocusAllowed(foreground,target,owner))return "other-app";
  if(foreground==target)return "focused";
  IntPtr game=IntPtr.Zero;
  EnumWindows(delegate(IntPtr window,IntPtr unused){uint pid;GetWindowThreadProcessId(window,out pid);if(pid==target&&IsWindowVisible(window)&&!IsIconic(window)&&GetWindow(window,4)==IntPtr.Zero){RECT area;if(GetClientRect(window,out area)&&area.right>area.left&&area.bottom>area.top){game=window;return false;}}return true;},IntPtr.Zero);
  if(game==IntPtr.Zero)return "game-window-unavailable";
  GetWindowThreadProcessId(GetForegroundWindow(),out foreground);
  if(!FocusAllowed(foreground,target,owner))return "other-app";
  if(expires<UtcMilliseconds())return "expired";
  if(foreground!=target&&!SetForegroundWindow(game))return "windows-refused";
  // Activation across input queues is asynchronous. Check briefly, never resend.
  long until=Math.Min(expires, UtcMilliseconds()+150);
  do{GetWindowThreadProcessId(GetForegroundWindow(),out foreground);if(foreground==target)return "focused";if(!FocusAllowed(foreground,target,owner))return "other-app";Thread.Sleep(10);}while(!shuttingDown&&UtcMilliseconds()<until);
  return "activation-unconfirmed";
 }
 static void FocusCommand(int ticket,long expires){
  string reason;try{reason=FocusGame(expires);}catch{reason="focus-error";}
  uint foreground;GetWindowThreadProcessId(GetForegroundWindow(),out foreground);
  Output("{\"event\":\"focus-result\",\"seq\":"+ticket+",\"ok\":"+(reason=="focused"?"true":"false")+",\"reason\":\""+reason+"\",\"foregroundPid\":"+foreground+"}");
 }
 static bool Shift(){return ModifierHeld(GetAsyncKeyState(0x10),GetAsyncKeyState(0xA0),GetAsyncKeyState(0xA1));}
 static bool OtherModifier(){return ModifierHeld(GetAsyncKeyState(0x11),GetAsyncKeyState(0xA2),GetAsyncKeyState(0xA3))||ModifierHeld(GetAsyncKeyState(0x12),GetAsyncKeyState(0xA4),GetAsyncKeyState(0xA5))||ModifierHeld(0,GetAsyncKeyState(0x5B),GetAsyncKeyState(0x5C));}
 static void HandleMouse(ushort buttons){
  int gesture=mouseGesture.Buttons(buttons,Shift(),OtherModifier(),middleEnabled);if(gesture==0)return;
  POINT point;IntPtr window;uint foreground,under;
  GetWindowThreadProcessId(GetForegroundWindow(),out foreground);
  if(!GetCursorPos(out point)||!Eligible(point,true,out window))return;
  GetWindowThreadProcessId(window,out under);
  if(TriggerAllowed(foreground,under,target))Signal(window,point,gesture==1?"shift-left-raw":"middle-raw");
 }
 public static bool TriggerAllowed(uint foreground,uint under,uint expected){return expected>0&&foreground==expected&&under==expected;}
 public static bool CaptureAllowed(uint foreground,uint under,uint expected,uint parent){return expected>0&&under==expected&&(foreground==expected||(parent>0&&foreground==parent));}

 public static bool CursorStable(int x,int y,int currentX,int currentY) { long dx=(long)x-currentX,dy=(long)y-currentY;return Math.Abs(dx)<=12&&Math.Abs(dy)<=12&&dx*dx+dy*dy<=144; }
 public static bool SnapshotMatches(long age,int x,int y,int currentX,int currentY,bool sameWindow) { return sameWindow&&age>=0&&age<=300&&Math.Abs((long)x-currentX)<=2&&Math.Abs((long)y-currentY)<=2; }
 // Active reads tolerate small hand movement relative to the original click.
 // Cached frames remain strict: widening them could reuse a neighboring item's tooltip.
 public static bool ClickSnapshotMatches(long age,int x,int y,int currentX,int currentY,bool sameWindow) { return sameWindow&&age>=0&&age<=300&&CursorStable(x,y,currentX,currentY); }
 static bool UpdateHover(bool eligible,IntPtr window,POINT point,long now,bool alt){
  if(!eligible){hoverTracked=false;DropSnapshot();return false;}
  if(!hoverTracked||hoverWindow!=window||!SnapshotMatches(0,hoverPoint.x,hoverPoint.y,point.x,point.y,true)){DropSnapshot();hoverTracked=true;hoverPoint=point;hoverWindow=window;hoverSince=now;nextSnapshot=0;}
  if(!alt&&now-hoverSince<100||now<nextSnapshot)return false;
  nextSnapshot=now+200;return true;
 }
 public static bool Duplicate(string source,string previous,long delta,int x,int y,int oldX,int oldY) { return source!=previous&&delta>=0&&delta<120&&Math.Abs(x-oldX)<=2&&Math.Abs(y-oldY)<=2; }
 public static int Command(string line,int ticket) { string[] parts=line.Split(' ');int received;if(parts.Length!=2||!int.TryParse(parts[1],out received)||received!=ticket)return -1;return parts[0]=="direct"?2:parts[0]=="capture"?1:parts[0]=="skip"?0:-1; }
 static void Output(string json) { lock(outputLock){Console.WriteLine(json);Console.Out.Flush();} }
 static string Health(string eventName) { return "{\"event\":\""+eventName+"\",\"version\":\"0.4.18\",\"targetPid\":"+target+",\"readerPid\":"+Process.GetCurrentProcess().Id+",\"hookRegistered\":"+"false"+",\"rawRegistered\":"+(rawActive?"true":"false")+",\"repairs\":"+0+",\"accepted\":"+accepted+",\"warmedFrames\":"+warmedFrames+",\"cachedClicks\":"+cachedClicks+",\"immediateClicks\":"+immediateClicks+",\"source\":\""+lastSource+"\"}"; }
 static bool Eligible(POINT point,bool alt,out IntPtr window) {
  window=GetAncestor(WindowFromPoint(point),2);uint foreground,under;
  GetWindowThreadProcessId(GetForegroundWindow(),out foreground);GetWindowThreadProcessId(window,out under);
  return alt&&CaptureAllowed(foreground,under,target,owner);
 }
 static Rectangle ClientArea(IntPtr window){
  RECT rect;if(!GetClientRect(window,out rect))throw new Exception();POINT origin=new POINT();if(!ClientToScreen(window,ref origin))throw new Exception();
  Rectangle client=Rectangle.Intersect(new Rectangle(origin.x,origin.y,rect.right-rect.left,rect.bottom-rect.top),SystemInformation.VirtualScreen);
  if(client.Width<100||client.Height<100||client.Width>6000||client.Height>4000)throw new Exception();return client;
 }
 static void MaskToolbox(Graphics drawing,Rectangle area,IntPtr gameWindow){
  // Only own windows above this game window can contribute pixels to its capture.
  // WS_VISIBLE alone also includes windows hidden behind the game.
  HashSet<IntPtr> visited=new HashSet<IntPtr>();
  using(SolidBrush brush=new SolidBrush(Color.Black)){
   for(IntPtr window=GetWindow(gameWindow,3);window!=IntPtr.Zero&&visited.Count<2048&&visited.Add(window);window=GetWindow(window,3)){
    uint pid;RECT bounds;GetWindowThreadProcessId(window,out pid);
    if(pid!=owner||!IsWindowVisible(window)||IsIconic(window)||!GetWindowRect(window,out bounds))continue;
    Rectangle overlap=Rectangle.Intersect(area,new Rectangle(bounds.left,bounds.top,Math.Max(0,bounds.right-bounds.left),Math.Max(0,bounds.bottom-bounds.top)));
    if(overlap.Width>0&&overlap.Height>0)drawing.FillRectangle(brush,overlap.Left-area.Left,overlap.Top-area.Top,overlap.Width,overlap.Height);
   }
  }
 }
 static Frame ReadSnapshot(IntPtr window,POINT point,bool clickCapture=false){
  if(shuttingDown)return null;
  IntPtr currentWindow;if(!Eligible(point,true,out currentWindow)||currentWindow!=window)return null;
  Rectangle area=Rectangle.Intersect(ClientArea(window),new Rectangle(point.x-800,point.y-900,1600,1300));if(area.Width<100||area.Height<100)return null;
  Frame frame=new Frame{rect=area,point=point,window=window,at=clock.ElapsedMilliseconds,image=new Bitmap(area.Width,area.Height,PixelFormat.Format32bppArgb)};
  try{using(Graphics drawing=Graphics.FromImage(frame.image)){drawing.CopyFromScreen(area.Left,area.Top,0,0,area.Size,CopyPixelOperation.SourceCopy);MaskToolbox(drawing,area,window);}POINT current;if(shuttingDown||!GetCursorPos(out current)||!(clickCapture?ClickSnapshotMatches(clock.ElapsedMilliseconds-frame.at,point.x,point.y,current.x,current.y,true):SnapshotMatches(clock.ElapsedMilliseconds-frame.at,point.x,point.y,current.x,current.y,true))||!Eligible(current,true,out currentWindow)||currentWindow!=window){frame.Dispose();return null;}return frame;}catch{frame.Dispose();return null;}
 }
 static void DropSnapshot(){lock(snapshotLock){if(snapshot!=null){snapshot.Dispose();snapshot=null;}}}
 static Frame TakeSnapshot(IntPtr window,POINT point,out long age){
  lock(snapshotLock){age=snapshot==null?-1:clock.ElapsedMilliseconds-snapshot.at;if(snapshot==null)return null;Frame frame=snapshot;snapshot=null;if(!SnapshotMatches(age,frame.point.x,frame.point.y,point.x,point.y,frame.window==window)){frame.Dispose();return null;}return frame;}
 }
 static void ScheduleSnapshot(){
  if(probe||shuttingDown||Interlocked.CompareExchange(ref snapshotBusy,1,0)!=0)return;
  ThreadPool.QueueUserWorkItem(delegate{Frame frame=null;try{POINT point;IntPtr window;uint foreground;GetWindowThreadProcessId(GetForegroundWindow(),out foreground);if(foreground!=target||!GetCursorPos(out point)||!Eligible(point,true,out window))return;frame=ReadSnapshot(window,point);if(frame==null)return;GetWindowThreadProcessId(GetForegroundWindow(),out foreground);if(shuttingDown||foreground!=target)return;lock(snapshotLock){if(shuttingDown)return;if(snapshot!=null)snapshot.Dispose();snapshot=frame;frame=null;Interlocked.Increment(ref warmedFrames);}}catch{}finally{if(frame!=null)frame.Dispose();Interlocked.Exchange(ref snapshotBusy,0);}});
 }
 static string FrameJson(Frame frame,POINT point,int ticket,string source,string captureSource,long age,string eventName){
  using(MemoryStream bytes=new MemoryStream()){frame.image.Save(bytes,ImageFormat.Png);if(bytes.Length>12000000)throw new Exception();return "{\"event\":\""+eventName+"\",\"seq\":"+ticket+",\"inputSource\":\""+source+"\",\"captureSource\":\""+captureSource+"\",\"snapshotAgeMs\":"+age+",\"x\":"+point.x+",\"y\":"+point.y+",\"left\":"+frame.rect.Left+",\"top\":"+frame.rect.Top+",\"width\":"+frame.rect.Width+",\"height\":"+frame.rect.Height+",\"image\":\""+Convert.ToBase64String(bytes.ToArray())+"\"}";}
 }
 static void SendFrame(Frame frame,POINT point,int ticket,string source,string captureSource,long age,string eventName="gesture",Frame fallback=null,long fallbackAge=0){
  string json=FrameJson(frame,point,ticket,source,captureSource,age,eventName);
  if(fallback!=null){string previous=FrameJson(fallback,point,ticket,source,"before-click",fallbackAge,"frozen-fallback");if(json.Length+previous.Length<17000000)json=json.Substring(0,json.Length-1)+",\"fallbackFrame\":"+previous+"}";}
  Output(json);
 }
 public static bool RetryMatches(int ticket,int activeTicket,long age,bool samePoint,bool foregroundGame){return ticket>0&&ticket==activeTicket&&age>=0&&age<=5000&&samePoint&&foregroundGame;}
 public static string RetryReason(int ticket,int activeTicket,long age,bool cursorKnown,bool samePoint,bool sameWindow,uint foreground,uint under,uint expected,uint parent){
  if(ticket<1||ticket!=activeTicket)return "stale-request";
  if(age<0||age>5000)return "expired";
  if(!cursorKnown)return "cursor-unavailable";
  if(!samePoint)return "cursor-moved";
  if(!sameWindow||under!=expected)return "window-covered";
  if(!CaptureAllowed(foreground,under,expected,parent))return "focus-other-app";
  return "";
 }
 static string RetryMessage(string reason){
  switch(reason){
   case "cursor-moved":return "O mouse saiu da posição apontada antes da leitura terminar.";
   case "window-covered":return "Outra janela cobriu o item durante a leitura.";
   case "focus-other-app":return "Outro aplicativo ficou ativo durante a leitura.";
   case "expired":return "O tempo para confirmar a captura terminou.";
   case "stale-request":return "Esta leitura foi substituída por outra consulta.";
   case "cursor-unavailable":return "O Windows não informou a posição do mouse.";
   case "capture-changed":return "A captura mudou enquanto a imagem era lida.";
   default:return "Não foi possível obter uma nova captura do item.";
  }
 }
 static void RetryFrame(int ticket){
  if(Interlocked.CompareExchange(ref retryBusy,1,0)!=0)return;
  ThreadPool.QueueUserWorkItem(delegate{Frame frame=null;string reason="capture-failed";POINT point=new POINT();uint foreground=0,under=0;long age=-1,dx=0,dy=0;try{
   ClickRequest request=activeRequest;bool known=GetCursorPos(out point);IntPtr foregroundWindow=GetForegroundWindow(),underWindow=known?GetAncestor(WindowFromPoint(point),2):IntPtr.Zero;
   GetWindowThreadProcessId(foregroundWindow,out foreground);GetWindowThreadProcessId(underWindow,out under);
   if(request==null){reason="stale-request";throw new Exception();}
   age=clock.ElapsedMilliseconds-request.at;dx=(long)point.x-request.point.x;dy=(long)point.y-request.point.y;
   reason=RetryReason(ticket,request.seq,age,known,CursorStable(request.point.x,request.point.y,point.x,point.y),underWindow==request.window,foreground,under,target,owner);
   if(reason!="")throw new Exception();
   reason="capture-changed";frame=ReadSnapshot(request.window,request.point,true);if(frame==null||activeRequest!=request)throw new Exception();SendFrame(frame,request.point,ticket,request.source,"retry",0,"retry-frame");
  }catch{try{Output("{\"event\":\"retry-error\",\"seq\":"+ticket+",\"reason\":\""+reason+"\",\"ageMs\":"+age+",\"cursorDx\":"+dx+",\"cursorDy\":"+dy+",\"foregroundPid\":"+foreground+",\"underPid\":"+under+",\"error\":\""+RetryMessage(reason)+"\"}");}catch{}}finally{if(frame!=null)frame.Dispose();Interlocked.Exchange(ref retryBusy,0);}});
 }
 static void Signal(IntPtr window,POINT point,string source) {
  lock(signalLock){
   long now=clock.ElapsedMilliseconds;
   if(Duplicate(source,lastSource,now-lastSignal,point.x,point.y,lastPoint.x,lastPoint.y)||Interlocked.CompareExchange(ref busy,1,0)!=0)return;
   lastSignal=now;lastSource=source;lastPoint=point;accepted++;
  }
  long snapshotAge;Frame prior=TakeSnapshot(window,point,out snapshotAge);string captureSource=prior==null?"at-click":"before-click";
  if(prior==null)Interlocked.Increment(ref immediateClicks);else Interlocked.Increment(ref cachedClicks);
  ThreadPool.QueueUserWorkItem(delegate {
   Frame clicked=null;
   try{
    clicked=ReadSnapshot(window,point,true);
    int ticket=Interlocked.Increment(ref sequence);prepared.Reset();mode=0;
    Output("{\"event\":\"prepare\",\"seq\":"+ticket+",\"inputSource\":\""+source+"\",\"x\":"+point.x+",\"y\":"+point.y+"}");
    if(!prepared.Wait(1800)){Output("{\"event\":\"error\",\"error\":\"O leitor não confirmou a abertura do menu.\"}");return;}
    if(mode==0)return;
    activeRequest=new ClickRequest{window=window,point=point,seq=ticket,source=source,at=clock.ElapsedMilliseconds};
    if(mode==2){Output("{\"event\":\"gesture\",\"seq\":"+ticket+",\"inputSource\":\""+source+"\",\"nativeOnly\":true,\"x\":"+point.x+",\"y\":"+point.y+"}");return;}
    if(clicked!=null){SendFrame(clicked,point,ticket,source,"at-click",0,"gesture",prior,snapshotAge);return;}
    if(prior!=null){SendFrame(prior,point,ticket,source,captureSource,snapshotAge);return;}
    Thread.Sleep(120);Capture(window,point,ticket,source);
   }catch(Exception){try{Output("{\"event\":\"error\",\"error\":\"O leitor do atalho encontrou uma falha.\"}");}catch{}}
   finally{if(clicked!=null)clicked.Dispose();if(prior!=null)prior.Dispose();Interlocked.Exchange(ref busy,0);}
  });
 }
 sealed class RawWindow:NativeWindow,IDisposable {
  readonly IntPtr buffer=Marshal.AllocHGlobal(128);
  public bool Registered {get;private set;}
  public RawWindow(){
   CreateHandle(new CreateParams{Caption="BoxPreviewInput",Parent=new IntPtr(-3)});
   DEVICE[] devices={new DEVICE{page=1,usage=2,flags=0x100,window=Handle}};
   Registered=RegisterRawInputDevices(devices,1,(uint)Marshal.SizeOf(typeof(DEVICE)));
  }
  protected override void WndProc(ref Message message){
   if(message.Msg==0xFF)Read(message.LParam);
   base.WndProc(ref message);
  }
  void Read(IntPtr input){
   if(probe)return;
   uint size=128,header=(uint)Marshal.SizeOf(typeof(HEADER));uint read=GetRawInputData(input,0x10000003,buffer,ref size,header);
   if(read==uint.MaxValue||read<header+8||size>128)return;
   HEADER info=(HEADER)Marshal.PtrToStructure(buffer,typeof(HEADER));int offset=(int)header;
   if(info.device==IntPtr.Zero)return;
   if(info.type==0&&read>=header+24)HandleMouse((ushort)Marshal.ReadInt16(buffer,offset+4));
  }
  public void Dispose(){
   if(Registered){DEVICE[] devices={new DEVICE{page=1,usage=2,flags=1}};RegisterRawInputDevices(devices,1,(uint)Marshal.SizeOf(typeof(DEVICE)));Registered=false;}
   DestroyHandle();Marshal.FreeHGlobal(buffer);
  }
 }
 static void Capture(IntPtr window,POINT mouse,int ticket,string source){
  uint foreground,under;GetWindowThreadProcessId(GetForegroundWindow(),out foreground);IntPtr currentWindow=GetAncestor(WindowFromPoint(mouse),2);GetWindowThreadProcessId(currentWindow,out under);
  if(!CaptureAllowed(foreground,under,target,owner)||currentWindow!=window){Output("{\"event\":\"error\",\"error\":\"Deixe a caixa visível no TERA e tente novamente. Outra janela cobriu o ponto apontado.\"}");return;}
  POINT current;if(!GetCursorPos(out current)||!CursorStable(mouse.x,mouse.y,current.x,current.y)){Output("{\"event\":\"error\",\"error\":\"Mantenha o mouse sobre a caixa até a prévia aparecer. O cursor mudou durante a leitura.\"}");return;}
  Rectangle client=ClientArea(window);
  using(Bitmap image=new Bitmap(client.Width,client.Height,PixelFormat.Format32bppArgb)){
   using(Graphics drawing=Graphics.FromImage(image)){drawing.CopyFromScreen(client.Left,client.Top,0,0,client.Size,CopyPixelOperation.SourceCopy);MaskToolbox(drawing,client,window);}
   using(MemoryStream bytes=new MemoryStream()){image.Save(bytes,ImageFormat.Png);if(bytes.Length>12000000)throw new Exception();Output("{\"event\":\"gesture\",\"seq\":"+ticket+",\"inputSource\":\""+source+"\",\"x\":"+mouse.x+",\"y\":"+mouse.y+",\"left\":"+client.Left+",\"top\":"+client.Top+",\"width\":"+client.Width+",\"height\":"+client.Height+",\"image\":\""+Convert.ToBase64String(bytes.ToArray())+"\"}");}
  }
 }
 static void Loop(int parentPid){
  long started=clock.ElapsedMilliseconds;
  SetProcessDPIAware();mouseGesture.Reset((GetAsyncKeyState(0x01)&0x8000)!=0,(GetAsyncKeyState(0x04)&0x8000)!=0);middleEnabled=false;
  using(RawWindow raw=new RawWindow()){
   rawActive=raw.Registered;
   if(!rawActive){Output("{\"event\":\"error\",\"error\":\"O Windows não permitiu registrar Shift + clique esquerdo ou botão central.\"}");return;}
   Output(Health("ready"));
   if(!probe){Thread commands=new Thread(new ThreadStart(delegate{string line;while((line=Console.ReadLine())!=null){if(MiddleCommand(line))continue;string[] parts=line.Split(' ');int ticket;long expires;if(parts.Length==3&&parts[0]=="focus-game"&&int.TryParse(parts[1],out ticket)&&ticket>0&&long.TryParse(parts[2],out expires)){FocusCommand(ticket,expires);continue;}if(parts.Length==2&&parts[0]=="retry"&&int.TryParse(parts[1],out ticket)){RetryFrame(ticket);continue;}int selected=Command(line,sequence);if(selected>=0){mode=selected;prepared.Set();}}Application.Exit();}));commands.IsBackground=true;commands.Start();}
   System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();timer.Interval=50;long nextHealth=0;
   timer.Tick+=delegate{
    if(probe&&clock.ElapsedMilliseconds-started>=probeDuration){Application.Exit();return;}
    if(!probe){POINT point=new POINT();IntPtr window=IntPtr.Zero;uint foreground;GetWindowThreadProcessId(GetForegroundWindow(),out foreground);bool eligible=foreground==target&&GetCursorPos(out point)&&Eligible(point,true,out window);if(UpdateHover(eligible,window,point,clock.ElapsedMilliseconds,false))ScheduleSnapshot();}
    if(clock.ElapsedMilliseconds<nextHealth)return;nextHealth=clock.ElapsedMilliseconds+3000;
    if(!ProcessExists(parentPid)||!ProcessExists((int)target)){Application.Exit();return;}
    string health=Health("health");ThreadPool.QueueUserWorkItem(delegate{try{Output(health);}catch{}});
   };timer.Start();
   try{Application.Run();}finally{shuttingDown=true;DropSnapshot();timer.Stop();timer.Dispose();rawActive=false;}
  }
 }
 public static void Run(int targetPid,int parentPid){
  using(Process game=Process.GetProcessById(targetPid))if(!game.ProcessName.Equals("TERA",StringComparison.OrdinalIgnoreCase)){Output("{\"event\":\"error\",\"error\":\"O processo alvo não é TERA.exe.\"}");return;}
  target=(uint)targetPid;owner=(uint)parentPid;
  Thread thread=new Thread(new ThreadStart(delegate{try{Loop(parentPid);}catch{Output("{\"event\":\"error\",\"error\":\"Falha ao iniciar o leitor de mouse.\"}");}}));thread.SetApartmentState(ApartmentState.STA);thread.Start();thread.Join();
 }
 public static bool TestRaw(){using(RawWindow raw=new RawWindow())return raw.Registered;}
 public static void Probe(int targetPid,int parentPid,int milliseconds){probe=true;probeDuration=Math.Min(10000,Math.Max(500,milliseconds));Run(targetPid,parentPid);}
}
