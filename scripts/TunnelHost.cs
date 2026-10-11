// Hidden console supervisor. Credentials arrive over stdin, never arguments/files.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

class TunnelHost {
    delegate bool Handler(uint signal);
    static Handler handler = delegate(uint signal) { return true; };
    [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(Handler fn, bool add);
    [DllImport("kernel32.dll")] static extern bool GenerateConsoleCtrlEvent(uint signal, uint group);
    [DllImport("kernel32.dll")] static extern IntPtr CreateJobObject(IntPtr attr, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int info, IntPtr data, uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [StructLayout(LayoutKind.Sequential)] struct Basic { public long perProcess, perJob; public uint flags; public UIntPtr min, max; public uint active; public UIntPtr affinity; public uint priority, scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong a,b,c,d,e,f; }
    [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic basic; public Io io; public UIntPtr processMemory, jobMemory, peakProcess, peakJob; }
    public class Input { public string executable { get; set; } public string profile { get; set; } public string key { get; set; } public string healthFile { get; set; } }
    static string Quote(string s) { return "\"" + s.Replace("\"", "\\\"") + "\""; }
    static int Main() {
        IntPtr job = IntPtr.Zero;
        Process child = null;
        try {
            var input = new JavaScriptSerializer().Deserialize<Input>(Console.ReadLine());
            if (input == null || String.IsNullOrEmpty(input.key)) return 1;
            job = CreateJobObject(IntPtr.Zero, null);
            var limits = new Extended(); limits.basic.flags = 0x2000; // KILL_ON_JOB_CLOSE
            int size = Marshal.SizeOf(limits); IntPtr ptr = Marshal.AllocHGlobal(size);
            try { Marshal.StructureToPtr(limits, ptr, false); if (job == IntPtr.Zero || !SetInformationJobObject(job, 9, ptr, (uint)size)) return 1; }
            finally { Marshal.FreeHGlobal(ptr); }
            // Handler is not inherited by the child; Ctrl-C is delivered to Go's interrupt handler.
            SetConsoleCtrlHandler(handler, true);
            var start = new ProcessStartInfo(input.executable,
                "run --profile " + Quote(input.profile) + " --control-plane.api-key env:CONTROL_PLANE_API_KEY --health.listen-addr 127.0.0.1:0 --health.url-file " + Quote(input.healthFile) + " --open-web-ui=false --log.file \"\" --log.http-raw-unsafe=false");
            start.UseShellExecute = false;
            start.WindowStyle = ProcessWindowStyle.Hidden;
            start.RedirectStandardOutput = true; start.RedirectStandardError = true;
            start.EnvironmentVariables["CONTROL_PLANE_API_KEY"] = input.key;
            start.EnvironmentVariables.Remove("OPENAI_API_KEY");
            start.EnvironmentVariables.Remove("OPENAI_ADMIN_KEY");
            child = Process.Start(start);
            start.EnvironmentVariables.Remove("CONTROL_PLANE_API_KEY"); input.key = null;
            if (!AssignProcessToJobObject(job, child.Handle)) { child.Kill(); return 1; }
            child.OutputDataReceived += delegate { }; child.ErrorDataReceived += delegate { };
            child.BeginOutputReadLine(); child.BeginErrorReadLine();
            Console.WriteLine("started"); Console.Out.Flush();
            // EOF also means the parent disappeared. Normal stop drains in-flight requests first.
            System.Threading.Tasks.Task.Run(delegate { Console.ReadLine(); try { GenerateConsoleCtrlEvent(0, 0); if (!child.WaitForExit(8000)) child.Kill(); } catch { } });
            child.WaitForExit();
            return child.ExitCode;
        } catch { return 1; } // Never emit raw exceptions, arguments, or child output.
        finally { if (job != IntPtr.Zero) CloseHandle(job); }
    }
}
