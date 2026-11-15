# Persistent helper process: line-delimited JSON requests on stdin, one JSON response per line on stdout.
# Used for audio endpoint volume (Core Audio COM), media session (SMTC) and GPU/temperature counters.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Console]::InputEncoding = [Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute(out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-46B7-8EE6-AE6EB1CF1C3A")] class MMDeviceEnumeratorComObject { }
public class Audio {
  static IAudioEndpointVolume Vol() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }
  public static float Volume {
    get { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, Guid.Empty)); }
  }
  public static bool Mute {
    get { bool m; Marshal.ThrowExceptionForHR(Vol().GetMute(out m)); return m; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, Guid.Empty)); }
  }
}
"@

$script:mediaReady = $false
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $script:asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
  $script:mediaReady = $true
} catch { }

function Await($op, $type) {
  $m = $script:asTask.MakeGenericMethod($type)
  $t = $m.Invoke($null, @($op))
  [void]$t.Wait(-1)
  $t.Result
}
function Get-Session {
  if (-not $script:mediaReady) { return $null }
  $mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  return $mgr.GetCurrentSession()
}
function Out-Json($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 6)); [Console]::Out.Flush() }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $req = $line | ConvertFrom-Json
  try {
    $data = $null
    switch ($req.cmd) {
      'ping' { $data = 'pong' }
      'volume.get' { $data = @{ level = [math]::Round([Audio]::Volume * 100); muted = [Audio]::Mute } }
      'volume.set' { [Audio]::Volume = [math]::Max(0, [math]::Min(1, [double]$req.args.level / 100)); $data = @{ level = [math]::Round([Audio]::Volume * 100); muted = [Audio]::Mute } }
      'volume.mute' { [Audio]::Mute = [bool]$req.args.muted; $data = @{ level = [math]::Round([Audio]::Volume * 100); muted = [Audio]::Mute } }
      'media.get' {
        $s = Get-Session
        if ($null -eq $s) { $data = @{ available = $false } }
        else {
          $p = Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
          $pb = $s.GetPlaybackInfo()
          $tl = $s.GetTimelineProperties()
          $data = @{ available = $true; title = $p.Title; artist = $p.Artist; album = $p.AlbumTitle; status = [string]$pb.PlaybackStatus; app = $s.SourceAppUserModelId
                     position = [math]::Round($tl.Position.TotalSeconds); duration = [math]::Round($tl.EndTime.TotalSeconds) }
        }
      }
      'media.cmd' {
        $s = Get-Session
        if ($null -ne $s) {
          switch ($req.args.action) {
            'toggle' { [void](Await ($s.TryTogglePlayPauseAsync()) ([bool])) }
            'play' { [void](Await ($s.TryPlayAsync()) ([bool])) }
            'pause' { [void](Await ($s.TryPauseAsync()) ([bool])) }
            'next' { [void](Await ($s.TrySkipNextAsync()) ([bool])) }
            'prev' { [void](Await ($s.TrySkipPreviousAsync()) ([bool])) }
          }
        }
        $data = $true
      }
      'gpu.get' {
        $g = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*engtype_3D*' }
        $sum = ($g | Measure-Object -Property UtilizationPercentage -Sum).Sum
        if ($null -eq $sum) { $data = @{ load = $null } } else { $data = @{ load = [math]::Min(100, [math]::Round($sum)) } }
      }
      'temp.get' {
        $cpu = $null; $gpu = $null
        foreach ($ns in 'root/LibreHardwareMonitor', 'root/OpenHardwareMonitor') {
          try {
            $sensors = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop | Where-Object { $_.SensorType -eq 'Temperature' }
            $c = $sensors | Where-Object { $_.Name -match 'CPU Package|Core \(Tctl|CPU Total|Core Max' } | Select-Object -First 1
            $g2 = $sensors | Where-Object { $_.Name -match 'GPU Core' } | Select-Object -First 1
            if ($c) { $cpu = [math]::Round($c.Value) }
            if ($g2) { $gpu = [math]::Round($g2.Value) }
            if ($cpu -ne $null -or $gpu -ne $null) { break }
          } catch { }
        }
        if ($null -eq $cpu) {
          try {
            $z = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop | Select-Object -First 1
            if ($z) { $cpu = [math]::Round(($z.CurrentTemperature / 10) - 273.15) }
          } catch { }
        }
        $data = @{ cpu = $cpu; gpu = $gpu }
      }
      default { throw "unknown command $($req.cmd)" }
    }
    Out-Json @{ id = $req.id; ok = $true; data = $data }
  } catch {
    Out-Json @{ id = $req.id; ok = $false; error = $_.Exception.Message }
  }
}
