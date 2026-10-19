using System.Data;
using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using HIS.Api.Data;
using HIS.Api.DTOs.Appointments;
using HIS.Api.Enums;
using HIS.Api.Exceptions;
using HIS.Api.Helpers;
using HIS.Api.Services;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using static CancellationFixtureGuard;

internal static class CancellationConcurrencyChecks
{
    private sealed record Outcome(object? Value, Exception? Error);
    private sealed class RollbackProbe(Guid appointmentId) : DbTransactionInterceptor
    {
        internal int Before = -1;
        internal int After = -1;
        private async Task<int> Count(DbTransaction tx, CancellationToken token)
        {
            await using var cmd = tx.Connection!.CreateCommand(); cmd.Transaction = tx;
            cmd.CommandText = "SELECT COUNT(*) FROM dbo.QueueEntries WHERE AppointmentId=@id";
            var p = cmd.CreateParameter(); p.ParameterName = "@id"; p.Value = appointmentId; cmd.Parameters.Add(p);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync(token));
        }
        public override async ValueTask<InterceptionResult> RollingBackToSavepointAsync(DbTransaction tx,
            TransactionEventData data, InterceptionResult result, CancellationToken token = default)
        { Before = await Count(tx, token); return result; }
        public override async Task RolledBackToSavepointAsync(DbTransaction tx,
            TransactionEventData data, CancellationToken token = default)
        { After = await Count(tx, token); }
    }
    private sealed class Gate(Guid id, AppointmentStatus original) : SaveChangesInterceptor
    {
        internal readonly TaskCompletionSource Reached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal readonly TaskCompletionSource Release = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal Guid? QueueId;
        internal int SaveAttempts;
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            var db = data.Context!; db.ChangeTracker.DetectChanges();
            var entry = db.ChangeTracker.Entries<HIS.Api.Entities.Appointment>().Single(x => x.Entity.Id == id && x.State == EntityState.Modified);
            Require(entry.Property(x => x.Status).OriginalValue == original, "Gate saw an unexpected original status.");
            Require(++SaveAttempts == 1, "Automatic retry detected.");
            QueueId = db.ChangeTracker.Entries<HIS.Api.Entities.QueueEntry>().Where(x => x.State == EntityState.Added).Select(x => (Guid?)x.Entity.Id).SingleOrDefault();
            Reached.TrySetResult();
            await Release.Task.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
            return result;
        }
    }
    private static async Task<Outcome> Observe(Func<Task<object?>> action)
    {
        try { return new(await action(), null); }
        catch (Exception ex) { return new(null, ex); }
    }
    private static async Task Race(string name, Gate winner, Gate loser, Func<Task<object?>> first, Func<Task<object?>> second,
        Func<Task> captureWinner, Func<Outcome, bool> rejectLoser, Func<Task> verifyRows)
    {
        var a = Observe(first); var b = Observe(second);
        try
        {
            await Task.WhenAll(winner.Reached.Task, loser.Reached.Task).WaitAsync(TimeSpan.FromSeconds(20));
            winner.Release.TrySetResult();
            var won = await a.WaitAsync(TimeSpan.FromSeconds(25));
            Require(won.Error == null && won.Value != null, $"{name}: designated winner failed.");
            await captureWinner(); // Persisted state captured before the losing save is released.
            loser.Release.TrySetResult();
            var lost = await b.WaitAsync(TimeSpan.FromSeconds(25));
            Require(rejectLoser(lost), $"{name}: losing operation did not return its expected business conflict.");
            Require(winner.SaveAttempts == 1 && loser.SaveAttempts == 1, "Each operation must attempt exactly one save.");
            await verifyRows();
            Console.WriteLine($"PASS {name}; both original snapshots gated; one save attempt each; winner metadata preserved.");
        }
        finally
        {
            winner.Release.TrySetResult(); loser.Release.TrySetResult();
            await Task.WhenAll(a, b); // Cleanup cannot run while any operation is still using its transaction.
        }
    }
    internal static async Task RunAsync(bool execute)
    {
        Require(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Development", "Development environment is required.");
        if (execute) Require(Environment.GetEnvironmentVariable("HIS_CANCELLATION_ACCEPTANCE") == "APPROVED-5.2.1.2", "Explicit execution opt-in is required.");
        var expectedHash = Environment.GetEnvironmentVariable("HIS_ACCEPTANCE_BASELINE_SHA256") ?? throw new InvalidOperationException("Expected fresh baseline hash is required.");
        var apiDirectory = Path.GetFullPath("backend/HIS/HIS.Api");
        var cfg = new ConfigurationBuilder().SetBasePath(apiDirectory).AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Development.json").AddEnvironmentVariables().Build();
        var cs = cfg.GetConnectionString("DefaultConnection")!;
        DbContextOptions<AppDbContext> Options(params IInterceptor[] interceptors) =>
            new DbContextOptionsBuilder<AppDbContext>().UseSqlServer(cs).AddInterceptors(interceptors).Options;
        var guard = new CancellationFixtureGuard(cs);
        await guard.Preflight(expectedHash);
        await using (var modelDb = new AppDbContext(Options()))
        {
            Require(modelDb.Model.FindEntityType(typeof(HIS.Api.Entities.Appointment))!.FindProperty("Status")!.IsConcurrencyToken,
                "Patched model does not enforce status concurrency.");
            Require(!modelDb.Database.HasPendingModelChanges(), "Unexpected relational model changes; stop before writes.");
        }
        var assembly = typeof(AppointmentService).Assembly.Location;
        var assemblyHash = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(assembly)));
        Require(assemblyHash == "C03D33F6DDF5CB780EF0C38658E63A41B3577F03BA49A85372E0E1927F770DF1", "Service harness loaded an unverified API build.");
        Console.WriteLine($"MODEL PASS: Status concurrency token; no schema differences; API SHA256 {assemblyHash}");
        if (!execute) { Console.WriteLine("READ-ONLY PREFLIGHT ONLY; no test records created."); return; }

        var password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var passwordHash = BCrypt.Net.BCrypt.HashPassword(password);
        var t0 = DateTime.UtcNow;
        var started = false;
        var completed = false;
        var loginPosts = 0; var patches = 0; var gets = 0;
        var cancellationCalls = 0; var checkIns = 0; var confirmations = 0;
        var queueCandidates = new List<Guid>();
        using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { BaseAddress = new Uri("http://localhost:5216/api/"), Timeout = TimeSpan.FromSeconds(20) };
        try
        {
            await using (var db = new AppDbContext(Options()))
            {
                await db.Database.OpenConnectionAsync();
                await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
                Same(guard.Baseline!, await guard.Capture((SqlConnection)db.Database.GetDbConnection(), (SqlTransaction)tx.GetDbTransaction(), false), "immediately before fixture insert");
                var department = new HIS.Api.Entities.Department { Id = DepartmentId, Name = Prefix + " Concurrency", CreatedAt = t0 };
                HIS.Api.Entities.User User(Guid id, string email, UserRole role) => new() { Id = id, Email = email, PasswordHash = passwordHash, Role = role, CreatedAt = t0 };
                var a = User(PatientA, Email("owner"), UserRole.Patient);
                var b = User(PatientB, Email("other"), UserRole.Patient);
                var doctorUser = User(DoctorUser, Email("doctor"), UserRole.Doctor);
                var doctor = new HIS.Api.Entities.Doctor { Id = DoctorId, User = doctorUser, Department = department, FullName = Prefix + " Doctor", Specialization = "QA concurrency", LicenseNumber = Prefix, CreatedAt = t0 };
                PatientProfile Profile(Guid id, HIS.Api.Entities.User user, string name) => new() { Id = id, User = user, FullName = name, DateOfBirth = new DateOnly(2000, 1, 1), Gender = "Other", Relationship = RelationshipType.Self, IsDefault = true, CreatedAt = t0 };
                var pa = Profile(ProfileA, a, Prefix + " Patient A");
                var pb = Profile(ProfileB, b, Prefix + " Patient B");
                var dates = new[] { new DateOnly(2026, 10, 22), CheckInDate, CheckInDate, new DateOnly(2026, 10, 22), new DateOnly(2026, 10, 22) };
                var times = new[] { new TimeOnly(9, 0), new TimeOnly(15, 0), new TimeOnly(15, 30), new TimeOnly(9, 30), new TimeOnly(10, 0) };
                var appointments = Appointments.Select((id, i) => new HIS.Api.Entities.Appointment { Id = id, PatientProfile = pa, Doctor = doctor,
                    AppointmentDate = dates[i], StartTime = times[i], EndTime = times[i].AddMinutes(30),
                    Status = i is 1 or 2 ? AppointmentStatus.Confirmed : AppointmentStatus.Pending, CreatedAt = t0 }).ToArray();
                db.AddRange(department, a, b, doctorUser, doctor, pa, pb); db.AddRange(appointments);
                Require(db.ChangeTracker.Entries().Count(x => x.State == EntityState.Added) == 12, "Fixture insert count differs from approval.");
                Require(await db.SaveChangesAsync() == 12, "Unexpected actual fixture insert count.");
                await tx.CommitAsync(); started = true;
            }
            await guard.RegisterFixtures();
            Console.WriteLine("SETUP PASS: exactly 12 approved fixture rows inserted transactionally.");

            async Task<string> Login(Guid userId, string who)
            {
                Require(++loginPosts <= 2, "Login POST budget exceeded.");
                using var response = await http.PostAsJsonAsync("Auth/login", new { email = Email(who), password });
                await using (var tokensDb = new AppDbContext(Options())) await guard.CaptureTokens(tokensDb);
                Require(response.StatusCode == HttpStatusCode.OK, "Synthetic login did not return 200; no retry.");
                using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                Require(body.RootElement.GetProperty("userId").GetGuid() == userId && body.RootElement.GetProperty("role").GetString() == "Patient", "Unexpected login identity.");
                Console.WriteLine($"HTTP POST Auth/login 200 (synthetic {who})");
                return body.RootElement.GetProperty("accessToken").GetString()!;
            }
            var tokenA = await Login(PatientA, "owner"); var tokenB = await Login(PatientB, "other");

            async Task<object?> Cancel(AppDbContext db, int index, string reason)
            { Require(++cancellationCalls <= 6, "Cancellation service-call budget exceeded."); return await new AppointmentService(db).CancelAsync(PatientA, Appointments[index], new CancelAppointmentRequest { Reason = reason }); }
            async Task<object?> CheckIn(AppDbContext db, int index)
            { Require(++checkIns <= 2, "Check-in service-call budget exceeded."); return await new QueueService(db, new RecordingNotifier(), NullLogger<QueueService>.Instance).CheckInAsync(PatientA, Appointments[index]); }
            async Task<object?> Confirm(AppDbContext db, int index)
            { Require(++confirmations <= 2, "Confirmation service-call budget exceeded."); return await new AppointmentService(db).ConfirmAsync(DoctorUser, Appointments[index], "Doctor"); }
            static bool Business(Outcome outcome, string message) => outcome.Error is InvalidOperationException && outcome.Error.Message == message;

            async Task RunCase(int index, AppointmentStatus original, string name, int kind, bool cancelWins)
            {
                var win = new Gate(Appointments[index], original); var lose = new Gate(Appointments[index], original);
                var rollback = new RollbackProbe(Appointments[index]);
                await using var db1 = new AppDbContext(Options(win)); await using var db2 = new AppDbContext(Options(lose, rollback));
                await using var reads = new AppDbContext(Options());
                var reason = $"{Prefix} C{index + 1} winner";
                var expected = cancelWins ? AppointmentStatus.Cancelled : kind == 1 ? AppointmentStatus.CheckedIn : AppointmentStatus.Confirmed;
                Func<Task<object?>> first = cancelWins ? () => Cancel(db1, index, reason) : kind == 1 ? () => CheckIn(db1, index) : () => Confirm(db1, index);
                Func<Task<object?>> second = kind == 0 ? () => Cancel(db2, index, "loser must not replace metadata") : cancelWins ? kind == 1 ? () => CheckIn(db2, index) : () => Confirm(db2, index) : () => Cancel(db2, index, "loser must not replace metadata");
                await Race(name, win, lose, first, second,
                    async () => {
                        await guard.AdoptWinner(reads, Appointments[index], expected, cancelWins ? reason : null);
                        if (kind == 1 && !cancelWins) await guard.CaptureQueue(reads, win.QueueId ?? throw new InvalidOperationException("No winning queue candidate captured."));
                    },
                    outcome => kind == 0 ? Business(outcome, "Appointment is already cancelled.") : cancelWins
                        ? kind == 1 ? outcome.Error is QueueConcurrencyException : Business(outcome, "Only pending appointments can be confirmed.")
                        : Business(outcome, "This appointment can no longer be cancelled."),
                    async () => {
                        await guard.AssertKnownRows();
                        if (kind == 1)
                        {
                            var candidate = cancelWins ? lose.QueueId : win.QueueId;
                            var candidateId = candidate ?? throw new InvalidOperationException("Missing check-in candidate ID.");
                            queueCandidates.Add(candidateId);
                            var rows = await reads.QueueEntries.AsNoTracking().Where(x => x.AppointmentId == Appointments[index]).ToListAsync();
                            Require(cancelWins ? rows.Count == 0 : rows.Count == 1 && rows[0].Id == candidate, "Queue rollback/commit result is wrong.");
                            if (cancelWins)
                            {
                                Require(rollback.Before is 0 or 1 && rollback.After == 0, "Losing check-in savepoint rollback was not verified.");
                                Console.WriteLine($"ROLLBACK observed: queue rows before savepoint rollback={rollback.Before}, after={rollback.After}; independent context rows={rows.Count}.");
                            }
                            Console.WriteLine($"QUEUE {candidate}: {(cancelWins ? "absent after losing transaction rollback" : "committed Waiting, queue number 1")}");
                        }
                    });
            }
            await RunCase(0, AppointmentStatus.Pending, "C1 concurrent cancellations", 0, true);
            await RunCase(1, AppointmentStatus.Confirmed, "C2 cancellation before check-in", 1, true);
            await RunCase(2, AppointmentStatus.Confirmed, "C3 check-in before cancellation", 1, false);
            await RunCase(3, AppointmentStatus.Pending, "C4 cancellation before confirmation", 2, true);
            await RunCase(4, AppointmentStatus.Pending, "C5 confirmation before cancellation", 2, false);

            async Task Patch(Guid id, string? token, HttpStatusCode expected, string? message, string label)
            {
                Require(++patches <= 3, "Cancellation PATCH budget exceeded.");
                using var request = new HttpRequestMessage(HttpMethod.Patch, $"Appointments/{id}/cancel") { Content = JsonContent.Create(new { reason = Prefix + " rejection check" }) };
                if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                using var response = await http.SendAsync(request);
                Require(response.StatusCode == expected, $"{label}: unexpected HTTP status {(int)response.StatusCode}.");
                if (message != null)
                {
                    using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                    Require(body.RootElement.GetProperty("message").GetString() == message, "Business response message changed.");
                }
                await guard.AssertKnownRows();
                Console.WriteLine($"PASS HTTP PATCH {label}: {(int)response.StatusCode}; no fixture changes.");
            }
            await Patch(Appointments[0], tokenA, HttpStatusCode.BadRequest, "Appointment is already cancelled.", "repeated cancellation");
            await Patch(Appointments[4], tokenB, HttpStatusCode.NotFound, null, "another Patient");
            await Patch(Appointments[4], null, HttpStatusCode.Unauthorized, null, "unauthenticated");
            foreach (var id in Appointments)
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, $"Appointments/{id}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", tokenA);
                gets++; using var response = await http.SendAsync(request);
                Require(response.StatusCode == HttpStatusCode.OK, "Owner detail GET failed.");
                using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                var expectedStatus = Array.IndexOf(Appointments, id) switch { 2 => "CheckedIn", 4 => "Confirmed", _ => "Cancelled" };
                Require(json.RootElement.GetProperty("status").GetString() == expectedStatus, "API GET does not reflect real service transition.");
            }
            await using (var final = new AppDbContext(Options()))
            {
                await guard.CaptureTokens(final);
                Require(guard.Ids["RefreshTokens"].Count == 2 && guard.Ids["QueueEntries"].Count == 1, "Unexpected generated-row accounting.");
            }
            Require(cancellationCalls == 6 && checkIns == 2 && confirmations == 2 && patches == 3 && loginPosts == 2, "Operation accounting differs from approval.");
            completed = true;
            Console.WriteLine("ACCEPTANCE SCENARIOS PASS: 5 deterministic races, repeat/ownership/anonymous HTTP checks, 5 real detail GETs.");
        }
        finally
        {
            Console.WriteLine($"COUNTS: login POST={loginPosts}; cancellation PATCH={patches}; detail GET={gets}; service cancellation={cancellationCalls}; check-in={checkIns}; confirmation={confirmations}; no booking/refresh/logout requests.");
            if (started)
            {
                try
                {
                    await using var db = new AppDbContext(Options()); await guard.CaptureTokens(db);
                    await guard.Cleanup();
                }
                catch
                {
                    Console.WriteLine("CLEANUP ABORTED. Captured exact IDs (verify presence read-only): " + guard.RemainingIds());
                    Console.WriteLine("Check-in candidate IDs: " + string.Join(',', queueCandidates));
                    throw;
                }
            }
        }
        Require(completed, "Scenarios did not complete.");
        Console.WriteLine("CANCELLATION CONCURRENCY ACCEPTANCE PASS; guarded cleanup verified.");
    }
}
