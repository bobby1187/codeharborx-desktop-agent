using System;
using System.IO;
using System.Threading;
class Fixture {
  static int Main(string[] args) {
    var pidFile = Environment.GetEnvironmentVariable("CODEHARBORX_TEST_PID_FILE");
    if (!String.IsNullOrEmpty(pidFile)) File.WriteAllText(pidFile, System.Diagnostics.Process.GetCurrentProcess().Id.ToString());
    Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) {
      e.Cancel = true;
      File.WriteAllText(Environment.GetEnvironmentVariable("CODEHARBORX_TEST_MARKER"), "graceful");
      Environment.Exit(0);
    };
    while (true) Thread.Sleep(100);
  }
}
