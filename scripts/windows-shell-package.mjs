import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
const xml = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
export function shellPackageManifest(identity, arch = 'x64') {
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
 xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
 xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
 xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
 xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
 xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
 xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
 IgnorableNamespaces="uap uap10 com desktop4 desktop5 rescap">
 <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${identity.version}" ProcessorArchitecture="${arch}" />
 <Properties><DisplayName>Frame</DisplayName><PublisherDisplayName>Frame</PublisherDisplayName><Logo>Assets\\StoreLogo.png</Logo><uap10:AllowExternalContent>true</uap10:AllowExternalContent></Properties>
 <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.22000.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
 <Resources><Resource Language="en-us" /></Resources>
 <Applications><Application Id="Frame" Executable="FrameShellLauncher.exe" uap10:RuntimeBehavior="win32App" uap10:TrustLevel="mediumIL">
  <uap:VisualElements DisplayName="Frame" Description="Edit and convert media in Frame" AppListEntry="none" BackgroundColor="transparent" Square150x150Logo="Assets\\Logo150.png" Square44x44Logo="Assets\\Logo44.png" />
  <Extensions>
   <com:Extension Category="windows.comServer"><com:ComServer><com:SurrogateServer DisplayName="Frame media commands">
    <com:Class Id="${identity.editClsid}" Path="FrameShell.dll" ThreadingModel="STA" />
    <com:Class Id="${identity.convertClsid}" Path="FrameShell.dll" ThreadingModel="STA" />
   </com:SurrogateServer></com:ComServer></com:Extension>
   <desktop4:Extension Category="windows.fileExplorerContextMenus"><desktop4:FileExplorerContextMenus><desktop5:ItemType Type="*">
    <desktop5:Verb Id="FrameEdit" Clsid="${identity.editClsid}" /><desktop5:Verb Id="FrameConvert" Clsid="${identity.convertClsid}" />
   </desktop5:ItemType></desktop4:FileExplorerContextMenus></desktop4:Extension>
  </Extensions>
 </Application></Applications>
 <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>\n`;
}
/** Store-only MSIX: block hashes describe uncompressed 64 KiB blocks; code stays external. */
export function sparseMsix(files) {
  const blockFiles = Object.entries(files).map(([name, content]) => {
    const blocks = [];
    for (let offset = 0; offset < content.length; offset += 65536) blocks.push(`<Block Hash="${createHash('sha256').update(content.subarray(offset, offset + 65536)).digest('base64')}" />`);
    return `<File Name="${xml(name.replace(/\//g, '\\'))}" Size="${content.length}" LfhSize="${30 + Buffer.byteLength(name)}">${blocks.join('')}</File>`;
  });
  const blockMap = `<?xml version="1.0" encoding="utf-8"?><BlockMap xmlns="http://schemas.microsoft.com/appx/2010/blockmap" HashMethod="http://www.w3.org/2001/04/xmlenc#sha256">${blockFiles.join('')}</BlockMap>`;
  const contentTypes = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png" /><Default Extension="xml" ContentType="application/xml" /><Override PartName="/AppxManifest.xml" ContentType="application/vnd.ms-appx.manifest+xml" /><Override PartName="/AppxBlockMap.xml" ContentType="application/vnd.ms-appx.blockmap+xml" /></Types>';
  return zipSync({ ...files, 'AppxBlockMap.xml': Buffer.from(blockMap), '[Content_Types].xml': Buffer.from(contentTypes) }, { level: 0 });
}
