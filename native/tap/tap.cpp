// Windows Customization Hub — taskbar XAML module (Windows 11).
// Loaded into explorer.exe through the XAML Diagnostics API (InitializeXamlDiagnosticsEx). It looks for the taskbar's
// background rectangle and frame in the XAML tree and applies the look that Hub writes to a small text config file.
// Approach is the same one TranslucentTB uses (MIT); the code here is written for this project.
#include <windows.h>
#undef GetCurrentTime
#include <unknwn.h>
#include <ocidl.h>
#include <xamlom.h>

#include <winrt/base.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.UI.h>
#include <winrt/Windows.UI.Core.h>
#include <winrt/Windows.UI.Xaml.h>
#include <winrt/Windows.UI.Xaml.Media.h>
#include <winrt/Windows.UI.Xaml.Shapes.h>

#include <atomic>
#include <chrono>
#include <fstream>
#include <map>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

using namespace winrt;
using namespace winrt::Windows::UI::Xaml;

// {9B0F4A2E-6C1D-4E8A-B3F5-2D7C8E1A4F60}
static const CLSID CLSID_WchTap = { 0x9b0f4a2e, 0x6c1d, 0x4e8a, { 0xb3, 0xf5, 0x2d, 0x7c, 0x8e, 0x1a, 0x4f, 0x60 } };

static std::wstring g_logPath;
static void Log(const std::wstring& s) {
  if (g_logPath.empty()) return;
  static std::mutex m; std::lock_guard<std::mutex> g(m);
  std::wofstream f(g_logPath, std::ios::app);
  SYSTEMTIME t; GetLocalTime(&t);
  wchar_t ts[32]; swprintf_s(ts, L"%02d:%02d:%02d.%03d ", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds);
  f << ts << s << L"\n";
}
static std::wstring Hex(HRESULT hr) { wchar_t b[16]; swprintf_s(b, L"0x%08X", (unsigned)hr); return b; }

enum Kind { kFill = 1, kFrame = 2 };
struct Item { Kind kind; Windows::Foundation::IInspectable origFill{ nullptr }; bool haveOrig = false; };
struct Cfg {
  bool fillSet = false; uint32_t argb = 0;
  bool marginSet = false; double l = 0, t = 0, r = 0, b = 0;
  double radius = -1;
};

struct Tap : implements<Tap, IObjectWithSite, IVisualTreeServiceCallback> {
  com_ptr<IXamlDiagnostics> diag;
  com_ptr<IVisualTreeService> tree;
  std::mutex mu;
  std::map<InstanceHandle, Item> items;
  Cfg cfg;
  std::wstring cfgPath;
  std::atomic<bool> stop{ false };
  std::thread watcher;
  FILETIME lastWrite{};

  ~Tap() { stop = true; if (watcher.joinable()) watcher.detach(); }

  HRESULT __stdcall SetSite(IUnknown* site) noexcept override {
    try {
      if (!site) { stop = true; return S_OK; }
      check_hresult(site->QueryInterface(IID_PPV_ARGS(diag.put())));
      BSTR data = nullptr;
      if (SUCCEEDED(diag->GetInitializationData(&data)) && data) { cfgPath = data; SysFreeString(data); }
      g_logPath = cfgPath + L".log";
      Log(L"SetSite ok, cfg=" + cfgPath);
      tree = diag.as<IVisualTreeService>();
      ReadCfg(true);
      HRESULT hr = tree->AdviseVisualTreeChange(static_cast<IVisualTreeServiceCallback*>(this));
      Log(L"AdviseVisualTreeChange " + Hex(hr));
      auto self = get_strong();
      watcher = std::thread([self]() { self->Watch(); });
      return hr;
    } catch (...) { Log(L"SetSite exception"); return E_FAIL; }
  }
  HRESULT __stdcall GetSite(REFIID, void** p) noexcept override { if (p) *p = nullptr; return E_NOTIMPL; }

  HRESULT __stdcall OnVisualTreeChange(ParentChildRelation, VisualElement el, VisualMutationType type) noexcept override {
    try {
      if (type == Remove) { std::lock_guard<std::mutex> g(mu); items.erase(el.Handle); return S_OK; }
      std::wstring t = el.Type ? el.Type : L"", n = el.Name ? el.Name : L"";
      Kind k{}; bool hit = false;
      if (n == L"BackgroundFill" && t == L"Windows.UI.Xaml.Shapes.Rectangle") { k = kFill; hit = true; }
      else if (t == L"Taskbar.TaskbarFrame") { k = kFrame; hit = true; }
      if (!hit) return S_OK;
      Log(L"found " + t + L"#" + n + L" handle=" + std::to_wstring((unsigned long long)el.Handle));
      { std::lock_guard<std::mutex> g(mu); items[el.Handle] = Item{ k }; }
      Apply(el.Handle);
    } catch (...) { Log(L"OnVisualTreeChange exception"); }
    return S_OK;
  }

  // read key=value lines; returns true when something changed
  bool ReadCfg(bool force) {
    WIN32_FILE_ATTRIBUTE_DATA fa{};
    if (!GetFileAttributesExW(cfgPath.c_str(), GetFileExInfoStandard, &fa)) return false;
    if (!force && CompareFileTime(&fa.ftLastWriteTime, &lastWrite) == 0) return false;
    lastWrite = fa.ftLastWriteTime;
    std::wifstream f(cfgPath); std::wstring line; Cfg c;
    while (std::getline(f, line)) {
      auto p = line.find(L'='); if (p == std::wstring::npos) continue;
      std::wstring k = line.substr(0, p), v = line.substr(p + 1);
      while (!v.empty() && (v.back() == L'\r' || v.back() == L' ')) v.pop_back();
      if (k == L"fill" && v != L"default") { c.fillSet = true; c.argb = (uint32_t)wcstoul(v.c_str(), nullptr, 16); }
      else if (k == L"margin") { c.marginSet = swscanf_s(v.c_str(), L"%lf,%lf,%lf,%lf", &c.l, &c.t, &c.r, &c.b) == 4; }
      else if (k == L"radius") { c.radius = wcstod(v.c_str(), nullptr); }
    }
    std::lock_guard<std::mutex> g(mu); cfg = c;
    return true;
  }

  void Watch() {
    while (!stop) {
      std::this_thread::sleep_for(std::chrono::milliseconds(300));
      try { if (ReadCfg(false)) { Log(L"config changed"); ApplyAll(); } } catch (...) {}
    }
  }
  void ApplyAll() {
    std::vector<InstanceHandle> hs; { std::lock_guard<std::mutex> g(mu); for (auto& kv : items) hs.push_back(kv.first); }
    for (auto h : hs) Apply(h);
  }

  void Apply(InstanceHandle h) {
    try {
      Cfg c; Kind kind;
      { std::lock_guard<std::mutex> g(mu); auto it = items.find(h); if (it == items.end()) return; kind = it->second.kind; c = cfg; }
      com_ptr<IInspectable> insp;
      HRESULT hr = diag->GetIInspectableFromHandle(h, insp.put());
      if (FAILED(hr) || !insp) { Log(L"GetIInspectableFromHandle " + Hex(hr)); return; }
      auto obj = insp.as<DependencyObject>();
      auto self = get_strong();
      obj.Dispatcher().RunAsync(Windows::UI::Core::CoreDispatcherPriority::Normal, [self, obj, h, kind, c]() {
        try {
          if (kind == kFill) {
            auto rect = obj.as<Windows::UI::Xaml::Shapes::Rectangle>();
            { std::lock_guard<std::mutex> g(self->mu); auto it = self->items.find(h); if (it != self->items.end() && !it->second.haveOrig) { it->second.origFill = rect.Fill(); it->second.haveOrig = true; } }
            if (c.fillSet) {
              Windows::UI::Color col{ (uint8_t)(c.argb >> 24), (uint8_t)(c.argb >> 16), (uint8_t)(c.argb >> 8), (uint8_t)c.argb };
              rect.Fill(Media::SolidColorBrush(col));
            } else {
              Windows::Foundation::IInspectable orig{ nullptr };
              { std::lock_guard<std::mutex> g(self->mu); auto it = self->items.find(h); if (it != self->items.end()) orig = it->second.origFill; }
              if (orig) rect.Fill(orig.as<Media::Brush>());
            }
            if (c.radius >= 0) { rect.RadiusX(c.radius); rect.RadiusY(c.radius); }
          } else {
            auto fe = obj.as<FrameworkElement>();
            fe.Margin(c.marginSet ? ThicknessHelper::FromLengths(c.l, c.t, c.r, c.b) : ThicknessHelper::FromUniformLength(0));
          }
          Log(L"applied kind=" + std::to_wstring((int)kind));
        } catch (hresult_error const& e) { Log(L"apply error " + Hex(e.code()) + L" " + std::wstring(e.message())); }
        catch (...) { Log(L"apply error unknown"); }
      });
    } catch (hresult_error const& e) { Log(L"Apply error " + Hex(e.code()) + L" " + std::wstring(e.message())); }
    catch (...) { Log(L"Apply error unknown"); }
  }
};

struct Factory : implements<Factory, IClassFactory> {
  HRESULT __stdcall CreateInstance(IUnknown* outer, REFIID riid, void** obj) noexcept override {
    if (outer) return CLASS_E_NOAGGREGATION;
    try { return make<Tap>()->QueryInterface(riid, obj); } catch (...) { return E_OUTOFMEMORY; }
  }
  HRESULT __stdcall LockServer(BOOL) noexcept override { return S_OK; }
};

extern "C" HRESULT __stdcall DllGetClassObject(REFCLSID clsid, REFIID riid, void** obj) {
  if (clsid != CLSID_WchTap) return CLASS_E_CLASSNOTAVAILABLE;
  try { return make<Factory>()->QueryInterface(riid, obj); } catch (...) { return E_OUTOFMEMORY; }
}
extern "C" HRESULT __stdcall DllCanUnloadNow() { return S_FALSE; } // never unload: threads are running
