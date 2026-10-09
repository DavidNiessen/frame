using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

// Read-only diagnostics through Windows' own AppxPackaging COM implementation.
// No deployment, policy changes, certificate trust, or elevation occurs here.
public static class FramePackageReader
{
    [ComImport, Guid("5842a140-ff9f-4166-8f5c-62f5b7b0c781")]
    private class AppxFactory {}
    [ComImport, Guid("beb94909-e451-438b-b5a7-d79e767b75d8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAppxFactory
    {
        [PreserveSig] int CreatePackageWriter(IntPtr stream, IntPtr settings, out IntPtr writer);
        [PreserveSig] int CreatePackageReader(IStream stream, out IAppxPackageReader reader);
    }
    [ComImport, Guid("b5c49650-99bc-481c-9a34-3d53a4106708"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAppxPackageReader
    {
        [PreserveSig] int GetBlockMap(out IntPtr blockMap);
        [PreserveSig] int GetFootprintFile(uint type, out IntPtr file);
        [PreserveSig] int GetPayloadFile([MarshalAs(UnmanagedType.LPWStr)] string name, out IntPtr file);
        [PreserveSig] int GetPayloadFiles(out IntPtr files);
        [PreserveSig] int GetManifest(out IAppxManifestReader reader);
    }
    [ComImport, Guid("4e1bd148-55a0-4480-a3d1-15544710637c"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAppxManifestReader
    {
        [PreserveSig] int GetPackageId(out IAppxManifestPackageId id);
    }
    [ComImport, Guid("283ce2d7-7153-4a91-9649-7a0f7240945f"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAppxManifestPackageId
    {
        [PreserveSig] int GetName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int GetArchitecture(out uint architecture);
        [PreserveSig] int GetPublisher([MarshalAs(UnmanagedType.LPWStr)] out string publisher);
        [PreserveSig] int GetVersion(out ulong version);
        [PreserveSig] int GetResourceId([MarshalAs(UnmanagedType.LPWStr)] out string resource);
        [PreserveSig] int ComparePublisher([MarshalAs(UnmanagedType.LPWStr)] string other, [MarshalAs(UnmanagedType.Bool)] out bool same);
        [PreserveSig] int GetPackageFullName([MarshalAs(UnmanagedType.LPWStr)] out string fullName);
    }
    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int SHCreateStreamOnFileEx(string path, uint mode, uint attributes,
        [MarshalAs(UnmanagedType.Bool)] bool create, IStream template, out IStream stream);
    private static void Check(int result, string stage)
    {
        if (result < 0) throw new InvalidOperationException(stage + " failed with HRESULT 0x" + result.ToString("X8") + ": " + Marshal.GetExceptionForHR(result).Message);
    }
    private static void Release(object value)
    {
        if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value);
    }
    public static string Validate(string path)
    {
        IStream stream = null; IAppxPackageReader reader = null;
        IAppxManifestReader manifest = null; IAppxManifestPackageId identity = null;
        IAppxFactory factory = null;
        try
        {
            Check(SHCreateStreamOnFileEx(path, 0x20, 0, false, null, out stream), "Opening package stream");
            factory = (IAppxFactory)new AppxFactory();
            Check(factory.CreatePackageReader(stream, out reader), "Windows CreatePackageReader");
            Check(reader.GetManifest(out manifest), "Windows GetManifest");
            Check(manifest.GetPackageId(out identity), "Windows GetPackageId");
            string fullName;
            Check(identity.GetPackageFullName(out fullName), "Windows GetPackageFullName");
            return fullName;
        }
        finally { Release(identity); Release(manifest); Release(reader); Release(factory); Release(stream); }
    }
}
