using System.Data;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using HIS.Api.Data;
using HIS.Api.Entities;
using HIS.Api.Enums;

// Exact-ID guards shared by setup and cleanup. This file is compiled only by the test executable.
internal sealed class CancellationFixtureGuard(string connectionString)
{
    internal static readonly Guid DepartmentId = Guid.Parse("2a4ab960-10a8-40e2-913b-9118cf519293");
    internal static readonly Guid PatientA = Guid.Parse("ce8975a2-b9bd-487f-94d9-282492e68bb0");
    internal static readonly Guid PatientB = Guid.Parse("ae63f0a6-dc67-40af-826d-aae664aa8ea1");
    internal static readonly Guid DoctorUser = Guid.Parse("621eccf7-c46b-4235-96f3-29de53bb4af8");
    internal static readonly Guid DoctorId = Guid.Parse("0df0b97e-7eb0-4f09-90bd-c416c330612c");
    internal static readonly Guid ProfileA = Guid.Parse("dfba6629-0543-4f3a-bf4d-a67c6c4c8ee0");
    internal static readonly Guid ProfileB = Guid.Parse("bf1c7345-6453-49c9-b3dc-0be8655ceb16");
    internal static readonly Guid[] Appointments = [
        Guid.Parse("d3e051aa-da3b-447f-a58b-317aeda43896"), Guid.Parse("cf5a0b96-42a7-4f41-943d-359c248ec2dd"),
        Guid.Parse("0d5ba738-077c-4e26-8f6f-96cdbf389c42"), Guid.Parse("b4ed6029-60c3-4629-9a55-00a40c6894b5"),
        Guid.Parse("3ac6a71f-c5fc-4091-9864-cd9ecf2e9561")];
    internal const string Prefix = "QA5212-2a4ab960";
    internal static readonly DateOnly CheckInDate = new(2026, 10, 19);
    internal static string Email(string who) => $"qa5212-{who}-2a4ab960@example.invalid";
    internal readonly Dictionary<string, List<Guid>> Ids = new()
    {
        ["Departments"] = [DepartmentId], ["Users"] = [PatientA, PatientB, DoctorUser],
        ["Doctors"] = [DoctorId], ["PatientProfiles"] = [ProfileA, ProfileB],
        ["Appointments"] = [.. Appointments], ["QueueEntries"] = [], ["RefreshTokens"] = []
    };
    private readonly Dictionary<(string Table, Guid Id), string> expectedRows = [];
    private readonly Dictionary<Guid, string> immutableAppointments = [];
    internal sealed record Fingerprint(string Table, long Count, string SHA256);
    internal sealed record Snapshot(List<Fingerprint> Tables, string Defaults, string Schema)
    {
        internal string Hash => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            string.Join('\n', Tables.Select(t => $"[dbo].[{t.Table}]|{t.Count}|{t.SHA256}"))))).ToLowerInvariant();
    }
    internal Snapshot? Baseline { get; private set; }
    internal List<(Guid Id, string Hash)> DefaultRows { get; } = [];
    internal static void Require(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    private static SqlCommand Command(SqlConnection c, SqlTransaction? t, string sql) => new(sql, c, t) { CommandTimeout = 20 };
    private static string Exclude(IEnumerable<Guid> ids) => string.Join(',', ids.Select(id => $"'{id:D}'"));
    private async Task<string> Text(SqlConnection c, SqlTransaction? t, string sql)
    {
        await using var cmd = Command(c, t, sql);
        await using var reader = await cmd.ExecuteReaderAsync();
        var result = new StringBuilder();
        while (await reader.ReadAsync()) if (!reader.IsDBNull(0)) result.Append(reader.GetValue(0));
        return result.ToString();
    }
    internal async Task<Snapshot> Capture(SqlConnection c, SqlTransaction? t, bool excludeFixtures)
    {
        string[] tables = ["__EFMigrationsHistory", "Appointments", "Departments", "Doctors", "DoctorSchedules", "MedicalRecords", "PatientProfiles", "PrescriptionItems", "Prescriptions", "QueueEntries", "RefreshTokens", "sysdiagrams", "Users"];
        var actualTables = await Text(c, t, "SELECT STRING_AGG(name,',') WITHIN GROUP (ORDER BY name) FROM sys.tables WHERE schema_id=SCHEMA_ID('dbo')");
        Require(actualTables == string.Join(',', tables), "Unexpected table inventory; stop.");
        var rows = new List<Fingerprint>();
        foreach (var table in tables)
        {
            var filter = excludeFixtures && Ids.TryGetValue(table, out var ids) && ids.Count > 0 ? $" WHERE [Id] NOT IN ({Exclude(ids)})" : "";
            var key = table == "sysdiagrams" ? "diagram_id" : table == "__EFMigrationsHistory" ? "MigrationId" : "Id";
            var sql = $"SELECT COUNT_BIG(*),CONVERT(varchar(64),HASHBYTES('SHA2_256',COALESCE((SELECT data.* FROM dbo.[{table}] data{filter} ORDER BY [{key}] FOR JSON PATH,INCLUDE_NULL_VALUES),N'[]')),2) FROM dbo.[{table}]{filter}";
            await using var cmd = Command(c, t, sql);
            await using var reader = await cmd.ExecuteReaderAsync();
            await reader.ReadAsync(); rows.Add(new(table, reader.GetInt64(0), reader.GetString(1)));
        }
        var profileFilter = excludeFixtures ? $" AND Id NOT IN ({Exclude(Ids["PatientProfiles"])})" : "";
        var defaults = await Text(c, t, $"SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT p.* FROM dbo.PatientProfiles p WHERE IsDefault=1{profileFilter} ORDER BY Id FOR JSON PATH,INCLUDE_NULL_VALUES)),2)");
        var schemaJson = await Text(c, t, """
            SELECT (SELECT t.name,c.name columnName,ty.name typeName,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.is_computed FROM sys.tables t JOIN sys.columns c ON t.object_id=c.object_id JOIN sys.types ty ON c.user_type_id=ty.user_type_id ORDER BY t.name,c.column_id FOR JSON PATH) columnsJson,
            (SELECT name,parent_object_id,referenced_object_id,delete_referential_action,is_disabled,is_not_trusted FROM sys.foreign_keys ORDER BY name FOR JSON PATH) foreignKeysJson,
            (SELECT name,parent_id,is_disabled,OBJECT_DEFINITION(object_id) definition FROM sys.triggers WHERE parent_class=1 ORDER BY name FOR JSON PATH) triggersJson,
            (SELECT OBJECT_NAME(object_id) tableName,name,is_unique,filter_definition FROM sys.indexes WHERE object_id IN (SELECT object_id FROM sys.tables) ORDER BY object_id,index_id FOR JSON PATH) indexesJson
            FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES
            """);
        return new(rows, defaults, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(schemaJson))));
    }
    internal static void Same(Snapshot expected, Snapshot actual, string stage)
    {
        Require(expected.Hash == actual.Hash && expected.Defaults == actual.Defaults && expected.Schema == actual.Schema,
            $"Baseline/schema/default-profile mismatch at {stage}; no forced cleanup.");
    }
    internal async Task Preflight(string expectedBaseline)
    {
        var builder = new SqlConnectionStringBuilder(connectionString);
        Require(builder.DataSource.Equals("localhost", StringComparison.OrdinalIgnoreCase) && builder.InitialCatalog == "HIS_DB" && builder.IntegratedSecurity, "Unexpected configured SQL target.");
        Require(HIS.Api.Helpers.HospitalClock.Today == CheckInDate, "Check-in fixture date no longer matches hospital today.");
        await using var c = new SqlConnection(connectionString); await c.OpenAsync();
        await using var tx = (SqlTransaction)await c.BeginTransactionAsync(IsolationLevel.Serializable);
        var identity = await Text(c, tx, "SELECT CONVERT(nvarchar(128),SERVERPROPERTY('ServerName'))+'|'+CONVERT(nvarchar(128),SERVERPROPERTY('Edition'))+'|'+DB_NAME()");
        Require(identity.StartsWith("LAPTOP-Q1E2KVS8|", StringComparison.Ordinal) && identity.Contains("Developer") && identity.EndsWith("|HIS_DB"), "Unexpected database identity/edition.");
        Require(await Text(c, tx, "SELECT COUNT(*) FROM sys.foreign_keys") == "13" && await Text(c, tx, "SELECT COUNT(*) FROM sys.foreign_keys WHERE is_disabled=1 OR is_not_trusted=1") == "0" && await Text(c, tx, "SELECT COUNT(*) FROM sys.triggers WHERE parent_class=1") == "0", "Foreign-key/trigger inventory differs from reviewed preflight.");
        foreach (var (table, ids) in Ids.Where(x => x.Value.Count > 0))
            Require(await Text(c, tx, $"SELECT COUNT(*) FROM dbo.[{table}] WHERE Id IN ({Exclude(ids)})") == "0", "A fixture ID already exists.");
        Require(await Text(c, tx, $"SELECT COUNT(*) FROM dbo.Users WHERE Email IN ('{Email("owner")}', '{Email("other")}', '{Email("doctor")}')") == "0", "Synthetic email collision.");
        Require(await Text(c, tx, $"SELECT COUNT(*) FROM dbo.Departments WHERE Name='{Prefix} Concurrency'") == "0" && await Text(c, tx, $"SELECT COUNT(*) FROM dbo.Doctors WHERE LicenseNumber='{Prefix}'") == "0", "Synthetic name/license collision.");
        Baseline = await Capture(c, tx, false);
        Require(Baseline.Hash == expectedBaseline, "Fresh baseline differs from approved execution baseline.");
        await using (var cmd = Command(c, tx, "SELECT p.Id,CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT p.* FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)),2) FROM dbo.PatientProfiles p WHERE IsDefault=1 ORDER BY Id"))
        await using (var r = await cmd.ExecuteReaderAsync())
            while (await r.ReadAsync()) DefaultRows.Add((r.GetGuid(0), r.GetString(1)));
        Require(DefaultRows.Count == 2, "Expected exactly two original default profiles.");
        await tx.CommitAsync();
        Console.WriteLine($"PREFLIGHT PASS: local Developer HIS_DB; 12 unused IDs; 13 trusted FKs; no triggers; baseline {Baseline.Hash}");
    }
    internal async Task<string> RowHash(SqlConnection c, SqlTransaction? t, string table, Guid id, bool immutable = false)
    {
        var columns = immutable ? "data.Id,data.PatientProfileId,data.DoctorId,data.AppointmentDate,data.StartTime,data.EndTime,data.Symptoms,data.CreatedAt" : "data.*";
        return await Text(c, t, $"SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT {columns} FROM dbo.[{table}] data WHERE Id='{id:D}' FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)),2)");
    }
    internal async Task RegisterFixtures()
    {
        await using var c = new SqlConnection(connectionString); await c.OpenAsync();
        foreach (var (table, ids) in Ids)
        foreach (var id in ids) expectedRows[(table, id)] = await RowHash(c, null, table, id);
        foreach (var id in Appointments) immutableAppointments[id] = await RowHash(c, null, "Appointments", id, true);
    }
    internal async Task AdoptWinner(AppDbContext db, Guid id, AppointmentStatus status, string? reason)
    {
        var appointment = await db.Appointments.AsNoTracking().SingleAsync(x => x.Id == id);
        Require(appointment.Status == status && appointment.CancellationReason == reason && appointment.UpdatedAt != null &&
            (status == AppointmentStatus.Cancelled ? appointment.CancelledAt != null : appointment.CancelledAt == null), "Unexpected winner state.");
        await using var c = new SqlConnection(connectionString); await c.OpenAsync();
        Require(await RowHash(c, null, "Appointments", id, true) == immutableAppointments[id], "Winner changed immutable appointment fields.");
        expectedRows[("Appointments", id)] = await RowHash(c, null, "Appointments", id);
    }
    internal async Task AssertKnownRows()
    {
        await using var c = new SqlConnection(connectionString); await c.OpenAsync();
        foreach (var (key, hash) in expectedRows)
            Require(hash.Length == 64 && hash == await RowHash(c, null, key.Table, key.Id), $"Unexpected changes to test row {key.Table}/{key.Id}.");
    }
    internal async Task CaptureTokens(AppDbContext db)
    {
        var tokens = await db.RefreshTokens.AsNoTracking().Where(x => x.UserId == PatientA || x.UserId == PatientB).ToListAsync();
        Require(tokens.Count <= 2 && tokens.GroupBy(x => x.UserId).All(g => g.Count() == 1), "Unexpected synthetic authentication writes.");
        await using var c = new SqlConnection(connectionString); await c.OpenAsync();
        foreach (var token in tokens)
        {
            var hash = await RowHash(c, null, "RefreshTokens", token.Id);
            if (expectedRows.TryGetValue(("RefreshTokens", token.Id), out var previous)) Require(previous == hash, "Existing test token was modified.");
            else { Ids["RefreshTokens"].Add(token.Id); expectedRows[("RefreshTokens", token.Id)] = hash; Console.WriteLine($"CAPTURE RefreshToken {token.Id}"); }
        }
    }
    internal async Task CaptureQueue(AppDbContext db, Guid id)
    {
        var row = await db.QueueEntries.AsNoTracking().SingleAsync(x => x.Id == id);
        Require(row.AppointmentId == Appointments[2] && row.DoctorId == DoctorId && row.AppointmentDate == CheckInDate && row.QueueNumber == 1 && row.Status == QueueStatus.Waiting && row.CalledAt == null && row.StartedAt == null && row.CompletedAt == null, "Unexpected committed queue row.");
        Ids["QueueEntries"].Add(id);
        await using var c = new SqlConnection(connectionString); await c.OpenAsync();
        expectedRows[("QueueEntries", id)] = await RowHash(c, null, "QueueEntries", id);
        Console.WriteLine($"CAPTURE QueueEntry {id}");
    }
    internal async Task Cleanup()
    {
        Require(Baseline != null && expectedRows.Count >= 12, "No complete setup manifest; refusing cleanup.");
        await using var c = new SqlConnection(connectionString); await c.OpenAsync();
        await using var xactAbort = Command(c, null, "SET XACT_ABORT ON;"); await xactAbort.ExecuteNonQueryAsync();
        await using var tx = (SqlTransaction)await c.BeginTransactionAsync(IsolationLevel.Serializable);
        // Excluding only captured IDs makes unexpected dependent rows fail the full-table baseline comparison.
        Same(Baseline!, await Capture(c, tx, true), "before cleanup");
        foreach (var (key, hash) in expectedRows)
            Require(hash.Length == 64 && hash == await RowHash(c, tx, key.Table, key.Id), $"Cleanup row guard failed: {key.Table}/{key.Id}.");
        foreach (var table in new[] { "RefreshTokens", "QueueEntries", "Appointments", "PatientProfiles", "Doctors", "Users", "Departments" })
        {
            foreach (var id in Ids[table])
            {
                await using var cmd = Command(c, tx, $"DELETE FROM dbo.[{table}] WHERE Id=@id");
                cmd.Parameters.Add(new SqlParameter("@id", SqlDbType.UniqueIdentifier) { Value = id });
                Require(await cmd.ExecuteNonQueryAsync() == 1, "Exact-ID cleanup row count mismatch.");
            }
        }
        Same(Baseline!, await Capture(c, tx, false), "inside cleanup before commit");
        await tx.CommitAsync();
        await using var verifyTx = (SqlTransaction)await c.BeginTransactionAsync(IsolationLevel.Serializable);
        Same(Baseline!, await Capture(c, verifyTx, false), "after cleanup commit"); await verifyTx.CommitAsync();
        Console.WriteLine($"CLEANUP PASS: {Ids.Sum(x => x.Value.Count)} exact test rows deleted; all 13 original counts/hashes, schema and default profiles restored.");
    }
    internal string RemainingIds() => string.Join("; ", Ids.SelectMany(x => x.Value.Select(id => $"{x.Key}/{id}")));
}
