using System.Data.Common;
using System.Text.RegularExpressions;
using HIS.Api.Data;
using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

// Explicit opt-in, model-only checks. A connection interceptor fails closed if
// any validation operation unexpectedly attempts database access.
internal static class ClinicalModelChecks
{
    private sealed class NoConnections : DbConnectionInterceptor
    {
        internal int Attempts;

        public override InterceptionResult ConnectionOpening(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result)
        {
            Attempts++;
            throw new InvalidOperationException("Model checks must never open a database connection.");
        }

        public override ValueTask<InterceptionResult> ConnectionOpeningAsync(DbConnection connection,
            ConnectionEventData eventData, InterceptionResult result, CancellationToken cancellationToken = default)
        {
            Attempts++;
            throw new InvalidOperationException("Model checks must never open a database connection.");
        }
    }

    internal static void Run()
    {
        var passed = 0;
        void Check(bool condition, string name)
        {
            if (!condition) throw new InvalidOperationException($"FAIL {name}");
            passed++;
            Console.WriteLine($"PASS {name}");
        }

        var blocker = new NoConnections();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlServer("Server=localhost;Database=HIS_ModelValidation_Offline;Integrated Security=True;TrustServerCertificate=True")
            .AddInterceptors(blocker).Options;
        using var db = new AppDbContext(options);
        _ = db.Model; // Runs EF model validation without opening a connection.
        var model = db.GetService<IDesignTimeModel>().Model;
        IEntityType Entity<T>() => model.FindEntityType(typeof(T))!;
        static bool Columns(IEnumerable<IProperty> properties, params string[] names) =>
            properties.Select(p => p.Name).SequenceEqual(names);

        var record = Entity<MedicalRecord>();
        var appointment = Entity<Appointment>();
        var prescription = Entity<Prescription>();
        var item = Entity<PrescriptionItem>();
        var audit = Entity<ClinicalAuditEvent>();
        Check(model.GetEntityTypes().Count() == 12, "Exactly one clinical audit entity added");
        Check(new MedicalRecord().Status == MedicalRecordStatus.Draft, "New CLR record starts as Draft");
        Check(record.FindProperty("Diagnosis")!.IsNullable, "Draft diagnosis is nullable");
        Check(record.FindProperty("ChiefComplaint")!.GetMaxLength() == 2000, "Existing complaint bound preserved");
        Check(record.FindProperty("DoctorNotes")!.GetMaxLength() == 4000, "Existing internal-note bound preserved");
        var status = record.FindProperty("Status")!;
        Check(!status.IsNullable && status.GetMaxLength() == 20 &&
            status.GetTypeMapping().Converter?.ProviderClrType == typeof(string), "Status is required nvarchar(20) enum text");
        Check(record.FindProperty("FinalizedAt")!.GetColumnType() == "datetime2(7)" &&
            record.FindProperty("FinalizedAt")!.IsNullable, "Finalization timestamp is nullable datetime2(7)");
        var version = record.FindProperty("RowVersion")!;
        Check(version.IsConcurrencyToken && !version.IsNullable &&
            version.ValueGenerated == ValueGenerated.OnAddOrUpdate && version.GetColumnType() == "rowversion",
            "Aggregate RowVersion is required and database-generated on every update");
        Check(record.GetIndexes().Any(i => i.IsUnique && Columns(i.Properties, "AppointmentId")),
            "Unique MedicalRecord.AppointmentId preserved");
        var appointmentFk = record.GetForeignKeys().Single(f => f.PrincipalEntityType == appointment);
        Check(appointmentFk.IsUnique &&
            Columns(appointmentFk.Properties, "AppointmentId", "PatientProfileId", "DoctorId") &&
            Columns(appointmentFk.PrincipalKey.Properties, "Id", "PatientProfileId", "DoctorId"),
            "Composite clinical FK matches the canonical appointment tuple");
        Check(appointment.GetKeys().Any(k => Columns(k.Properties, "Id", "PatientProfileId", "DoctorId") &&
            k.GetName() == "AK_Appointments_Id_PatientProfileId_DoctorId" && k.IsClustered() == false),
            "Composite principal alternate key is nonclustered");
        Check(Columns(appointment.FindPrimaryKey()!.Properties, "Id"), "Appointment primary key preserved");
        var booking = appointment.GetIndexes().Single(i => Columns(i.Properties, "DoctorId", "AppointmentDate", "StartTime"));
        Check(booking.IsUnique && booking.GetFilter() == "[Status] <> 'Cancelled'" &&
            booking.GetDatabaseName() == "IX_Appointments_DoctorId_AppointmentDate_StartTime",
            "Filtered booking index preserved exactly");
        Check(appointment.GetIndexes().Any(i => Columns(i.Properties, "PatientProfileId", "AppointmentDate")),
            "Existing patient/date appointment index preserved");
        Check(appointment.FindProperty("Status")!.IsConcurrencyToken, "Existing appointment status concurrency preserved");
        Check(Entity<QueueEntry>().FindProperty("RowVersion")!.IsConcurrencyToken, "Existing queue concurrency preserved");
        foreach (var entity in new[] { record, prescription, item, audit })
            Check(entity.GetForeignKeys().All(f => f.DeleteBehavior == DeleteBehavior.NoAction),
                $"All {entity.ClrType.Name} foreign keys use NoAction");
        Check(!record.GetProperties().Any(p => p.Name.EndsWith("Id1", StringComparison.Ordinal)),
            "No accidental shadow relationship keys");
        Check(record.GetCheckConstraints().Count() == 2 &&
            record.GetCheckConstraints().Any(c => c.Sql.Contains("[Diagnosis] IS NOT NULL", StringComparison.Ordinal)),
            "Finalization checks explicitly reject NULL diagnosis");
        Check(prescription.GetIndexes().Any(i => i.IsUnique && Columns(i.Properties, "MedicalRecordId")),
            "One prescription per medical record preserved");
        Check(prescription.FindProperty("Notes")!.GetMaxLength() == 2000 &&
            prescription.FindProperty("Notes")!.IsNullable, "Prescription notes are bounded and optional");
        Check(prescription.FindProperty("UpdatedAt")!.GetColumnType() == "datetime2(7)",
            "Prescription update timestamp configured");
        foreach (var field in new[] { "MedicineName", "Dosage", "Frequency", "Duration" })
            Check(item.FindProperty(field)!.GetMaxLength() == 200 && !item.FindProperty(field)!.IsNullable,
                $"{field} is required nvarchar(200)");
        Check(item.FindProperty("Instructions")!.GetMaxLength() == 1000 &&
            item.FindProperty("Instructions")!.IsNullable, "Instructions are optional nvarchar(1000)");
        Check(item.FindProperty("Quantity")!.GetPrecision() == 10 && item.FindProperty("Quantity")!.GetScale() == 2,
            "Quantity uses decimal(10,2)");
        Check(item.FindProperty("QuantityUnit")!.GetMaxLength() == 50 &&
            !item.FindProperty("QuantityUnit")!.IsNullable, "Quantity unit is required nvarchar(50)");
        Check(item.GetIndexes().Single().IsUnique &&
            Columns(item.GetIndexes().Single().Properties, "PrescriptionId", "Position"),
            "Unique prescription item order replaces the redundant FK-only index");
        Check(item.GetCheckConstraints().Count() == 3, "Item required-text, quantity and position checks exist");
        Check(audit.FindProperty("Action")!.GetMaxLength() == 50 &&
            audit.FindProperty("CorrelationId")!.GetMaxLength() == 128, "Audit metadata bounds configured");
        Check(audit.FindProperty("OccurredAt")!.GetColumnType() == "datetime2(7)", "Audit time uses datetime2(7)");
        Check(audit.FindProperty("PreviousRecordVersion")!.IsNullable &&
            audit.FindProperty("PreviousRecordVersion")!.GetColumnType() == "binary(8)", "Previous audit version is optional binary(8)");
        Check(!audit.FindProperty("NewRecordVersion")!.IsNullable &&
            !audit.FindProperty("NewRecordVersion")!.IsConcurrencyToken &&
            audit.FindProperty("NewRecordVersion")!.ValueGenerated == ValueGenerated.Never &&
            audit.FindProperty("NewRecordVersion")!.GetColumnType() == "binary(8)",
            "New audit version is a required snapshot, not a second SQL rowversion");
        Check(audit.GetIndexes().Any(i => Columns(i.Properties, "MedicalRecordId", "OccurredAt", "Id")) &&
            audit.GetIndexes().Any(i => Columns(i.Properties, "ActorUserId")), "Both approved audit indexes configured");
        Check(model.GetEntityTypes().SelectMany(e => e.GetCheckConstraints()).Count() == 6,
            "Exactly six clinical check constraints");

        const string previous = "20261011081156_AddQueueEntryRowVersion";
        const string current = "20261020060004_AddClinicalSchemaAndAudit";
        var migrations = db.GetService<IMigrationsAssembly>();
        Check(migrations.Migrations.Count == 10 && migrations.Migrations.Keys.Last() == current,
            "Exactly one new migration after the existing nine");
        Check(!db.Database.HasPendingModelChanges(), "Migration snapshot matches the current model");
        var migration = migrations.CreateMigration(migrations.Migrations[current], db.Database.ProviderName!);
        var up = migration.UpOperations;
        Check(up[0] is SqlOperation gate && !gate.SuppressTransaction && gate.Sql.Contains("@@TRANCOUNT", StringComparison.Ordinal) &&
            new[] { "MedicalRecords", "Prescriptions", "PrescriptionItems" }.All(t => gate.Sql.Contains($"[dbo].[{t}] WITH (TABLOCKX, HOLDLOCK)", StringComparison.Ordinal)),
            "Up starts with a transactional locked empty-clinical-table gate");
        Check(up.OfType<CreateTableOperation>().Single().Name == "ClinicalAuditEvents", "Only the approved audit table is created");
        Check(up.OfType<AddColumnOperation>().Count() == 8 &&
            up.OfType<AddColumnOperation>().All(c => c.DefaultValue is null && c.DefaultValueSql is null),
            "Eight approved columns added without fabricated default values");
        Check(up.OfType<AlterColumnOperation>().Count() == 7, "Only the seven approved columns are altered");
        Check(!up.Any(o => o is InsertDataOperation or UpdateDataOperation or DeleteDataOperation), "No migration data backfills");
        Check(!up.OfType<DropIndexOperation>().Any(i => i.Table is "Appointments" or "QueueEntries" or "MedicalRecords"),
            "No existing booking, queue or medical-record index is dropped");
        Check(up.OfType<AddForeignKeyOperation>().All(f => f.OnDelete == ReferentialAction.NoAction) &&
            up.OfType<CreateTableOperation>().SelectMany(t => t.ForeignKeys).All(f => f.OnDelete == ReferentialAction.NoAction),
            "All new and recreated Up foreign keys use SQL NO ACTION");
        Check(migration.DownOperations.Count == 1 && migration.DownOperations[0] is SqlOperation down &&
            down.Sql.Contains("THROW 51064", StringComparison.Ordinal), "Automatic destructive Down is blocked unconditionally");

        var migrator = db.GetService<IMigrator>();
        var script = migrator.GenerateScript(previous, current);
        Check(script.IndexOf("BEGIN TRANSACTION", StringComparison.Ordinal) < script.IndexOf("IF @@TRANCOUNT", StringComparison.Ordinal) &&
            script.IndexOf("IF @@TRANCOUNT", StringComparison.Ordinal) < script.IndexOf("DROP CONSTRAINT", StringComparison.Ordinal),
            "Generated SQL runs the empty-data guard inside a transaction before DDL");
        Check(!script.Contains("ON DELETE CASCADE", StringComparison.Ordinal), "Generated Up SQL introduces no cascades");
        Check(!Regex.IsMatch(script, @"(?im)^\s*(UPDATE|DELETE)\s"), "Generated Up SQL contains no UPDATE or DELETE statements");
        Check(Regex.Matches(script, @"(?im)^\s*INSERT\s").Count == 1 && script.Contains("INSERT INTO [__EFMigrationsHistory]", StringComparison.Ordinal),
            "Only the standard future migration-history INSERT is scripted");
        var rollback = migrator.GenerateScript(current, previous);
        Check(rollback.Contains("THROW 51064", StringComparison.Ordinal) &&
            !rollback.Contains("DROP TABLE", StringComparison.Ordinal) && !rollback.Contains("ALTER TABLE", StringComparison.Ordinal),
            "Generated rollback SQL cannot drop clinical data or restore cascades");
        Check(blocker.Attempts == 0, "All checks completed with zero database connection attempts");
        Console.WriteLine($"{passed}/{passed} clinical model/migration checks passed; no SQL was executed.");
    }
}
