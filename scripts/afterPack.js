// Embeds build/icon.ico into the main exe (signAndEditExecutable=false because wine is unavailable on Linux builders).
const fs = require('fs'); const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = require('resedit');
  const exeName = ctx.packager.appInfo.productFilename + '.exe';
  const exe = path.join(ctx.appOutDir, exeName);
  const data = fs.readFileSync(exe);
  const pe = ResEdit.NtExecutable.from(data);
  const res = ResEdit.NtExecutableResource.from(pe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(ctx.packager.projectDir, 'build', 'icon.ico')));
  const group = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries).map((g) => g)[0];
  const groupId = group ? group.id : 1, lang = group ? group.lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, groupId, lang, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const v = ctx.packager.appInfo.version.split('.').map(Number);
    vi.setFileVersion(v[0], v[1] || 0, v[2] || 0, 0, lang); vi.setProductVersion(v[0], v[1] || 0, v[2] || 0, 0, lang);
    vi.setStringValues({ lang, codepage: 1200 }, { FileDescription: 'Windows Customization Hub', ProductName: 'Windows Customization Hub', CompanyName: 'Windows Customization Hub', LegalCopyright: 'Windows Customization Hub', OriginalFilename: exeName, InternalName: 'Windows Customization Hub' });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • icon + version info embedded into', exeName);
};
