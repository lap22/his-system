using System.Text.RegularExpressions;

namespace HIS.Api.ClinicalPersistenceIntegrationTests;

public static class ClinicalPersistenceIntegrationHarness
{
    public const bool CanConnectLive = false;
    public const bool CanCreateDatabase = false;
    public const bool CanApplyMigrations = false;
    public const bool CanSeedAutomatically = false;
    public const bool CanCleanupAutomatically = false;

    public const string CandidateDatabaseName =
        "HIS_DB_ClinicalPersistenceTest_20261107T000000_83b2c001";

    private static readonly string[] ProtectedDatabaseNames =
    [
        "HIS_DB",
        "HIS_DB_ClinicalRestore_20261021T104629_a531c2fe9036482198d382a9d3db9c06",
        "HIS_DB_ClinicalMigrationTest_20261022T031652_7632b2af31cf45b0b83c26ef371e5c27"
    ];

    public static void ValidateLiveApproval(LiveApproval approval, DateTime utcNow)
    {
        if (!approval.ExecuteLive)
            throw new HarnessSafetyException("LIVE_OPT_IN_REQUIRED");
        if (!string.Equals(approval.ServerName, "LAPTOP-Q1E2KVS8", StringComparison.OrdinalIgnoreCase))
            throw new HarnessSafetyException("SERVER_IDENTITY_REJECTED");
        if (IsProtectedDatabase(approval.DatabaseName))
            throw new HarnessSafetyException("PROTECTED_DATABASE_REJECTED");
        if (!string.Equals(approval.DatabaseName, CandidateDatabaseName, StringComparison.Ordinal))
            throw new HarnessSafetyException("DATABASE_NAME_REJECTED");
        if (approval.DatabaseId <= 0 || approval.DatabaseGuid == Guid.Empty)
            throw new HarnessSafetyException("DATABASE_IDENTITY_INCOMPLETE");
        if (string.IsNullOrWhiteSpace(approval.ApprovalId) ||
            !Regex.IsMatch(approval.ApprovalSha256 ?? string.Empty, "^[A-Fa-f0-9]{64}$"))
            throw new HarnessSafetyException("APPROVAL_EVIDENCE_INVALID");
        if (approval.ApprovalExpiresAtUtc <= utcNow)
            throw new HarnessSafetyException("APPROVAL_EXPIRED");
        if (!approval.FixturePlanApproved)
            throw new HarnessSafetyException("FIXTURE_PLAN_APPROVAL_REQUIRED");
        if (!CanConnectLive)
            throw new HarnessSafetyException("LIVE_SQL_ADAPTER_DISABLED");
    }

    public static bool IsProtectedDatabase(string? databaseName) =>
        string.IsNullOrWhiteSpace(databaseName) ||
        ProtectedDatabaseNames.Contains(databaseName, StringComparer.OrdinalIgnoreCase) ||
        databaseName.StartsWith("HIS_DB_ClinicalRestore_", StringComparison.OrdinalIgnoreCase) ||
        databaseName.StartsWith("HIS_DB_ClinicalMigrationTest_", StringComparison.OrdinalIgnoreCase);
}

public sealed record LiveApproval(
    bool ExecuteLive,
    string ServerName,
    string DatabaseName,
    int DatabaseId,
    Guid DatabaseGuid,
    string ApprovalId,
    string ApprovalSha256,
    DateTime ApprovalExpiresAtUtc,
    bool FixturePlanApproved);

public sealed class HarnessSafetyException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

public sealed record FixtureDefinition(string Entity, Guid Id, string Purpose);

public static class ClinicalFixtureManifest
{
    public static readonly IReadOnlyList<FixtureDefinition> Rows =
    [
        new("Department", Guid.Parse("8b2c0001-0000-4000-8000-000000000001"), "Isolated clinical department"),
        new("PatientUser", Guid.Parse("8b2c0002-0000-4000-8000-000000000002"), "Owning Patient account"),
        new("ForeignPatientUser", Guid.Parse("8b2c0003-0000-4000-8000-000000000003"), "Foreign ownership denial"),
        new("AssignedDoctorUser", Guid.Parse("8b2c0004-0000-4000-8000-000000000004"), "Assigned active Doctor actor"),
        new("InactiveDoctorUser", Guid.Parse("8b2c0005-0000-4000-8000-000000000005"), "Inactive Doctor denial"),
        new("ForeignDoctorUser", Guid.Parse("8b2c0006-0000-4000-8000-000000000006"), "Foreign active Doctor denial"),
        new("AssignedDoctor", Guid.Parse("8b2c0007-0000-4000-8000-000000000007"), "Active assigned Doctor"),
        new("InactiveDoctor", Guid.Parse("8b2c0008-0000-4000-8000-000000000008"), "Inactive Doctor profile"),
        new("ForeignDoctor", Guid.Parse("8b2c0009-0000-4000-8000-000000000009"), "Foreign active Doctor profile"),
        new("OwnedProfile", Guid.Parse("8b2c0010-0000-4000-8000-000000000010"), "Owned PatientProfile"),
        new("ForeignProfile", Guid.Parse("8b2c0011-0000-4000-8000-000000000011"), "Foreign PatientProfile"),
        new("RowVersionAppointment", Guid.Parse("8b2c0012-0000-4000-8000-000000000012"), "RowVersion and audit scenarios"),
        new("ConcurrentAppointment", Guid.Parse("8b2c0013-0000-4000-8000-000000000013"), "Concurrent Draft creation"),
        new("ConstraintAppointment", Guid.Parse("8b2c0014-0000-4000-8000-000000000014"), "Finalization constraints"),
        new("HistoricalAppointment", Guid.Parse("8b2c0015-0000-4000-8000-000000000015"), "Completed without MedicalRecord")
    ];

    public const int FixtureInsertLimit = 15;
    public const int MedicalRecordInsertLimit = 3;
    public const int MedicalRecordCommittedUpdateLimit = 2;
    public const int ClinicalAuditInsertLimit = 5;
    public const int CleanupDeleteLimit = 23;

    public static void Validate()
    {
        if (Rows.Count != FixtureInsertLimit || Rows.Select(x => x.Id).Distinct().Count() != Rows.Count)
            throw new HarnessSafetyException("FIXTURE_MANIFEST_INVALID");
        if (Rows.Any(x => x.Id == Guid.Empty || string.IsNullOrWhiteSpace(x.Entity)))
            throw new HarnessSafetyException("FIXTURE_MANIFEST_MALFORMED");
        if (CleanupDeleteLimit != FixtureInsertLimit + MedicalRecordInsertLimit + ClinicalAuditInsertLimit)
            throw new HarnessSafetyException("CLEANUP_BUDGET_INVALID");
    }
}

public sealed record SqlServerScenario(string Area, string Name, bool RequiresMutation);

public static class ClinicalSqlServerTestMatrix
{
    public static readonly IReadOnlyList<string> ExpectedPriorMigrations =
    [
        "20260907065802_InitialCreate",
        "20260909045216_AddRefreshToken",
        "20260911060753_ConfigurePatientProfile",
        "20260924050722_ConfigureDepartment",
        "20260925061203_ConfigureDoctorSchedule",
        "20260928035417_ConfigureAppointment",
        "20261005031550_ConfigureQueueEntry",
        "20261009073346_AddQueueConcurrencyConstraints",
        "20261011081156_AddQueueEntryRowVersion"
    ];

    public const string TargetMigration = "20261020060004_AddClinicalSchemaAndAudit";

    public static readonly IReadOnlyList<SqlServerScenario> Scenarios =
    [
        new("RowVersion", "Insert generates an eight-byte RowVersion", true),
        new("RowVersion", "Update advances RowVersion", true),
        new("RowVersion", "Stale update maps to Conflict", true),
        new("RowVersion", "Stale finalization maps to Conflict", true),
        new("UniqueAppointment", "Concurrent Draft creation persists exactly one record", true),
        new("UniqueAppointment", "Duplicate attempt maps only the verified index to Conflict", true),
        new("Audit", "Create and audit commit together", true),
        new("Audit", "Update and audit commit together", true),
        new("Audit", "Forced audit failure rolls back record mutation", true),
        new("Audit", "No orphan or duplicate audit rows", false),
        new("Constraints", "Draft permits nullable required-finalization text", true),
        new("Constraints", "Finalized requires nonblank complaint and diagnosis", true),
        new("Constraints", "Finalization metadata matches status", true),
        new("Constraints", "Composite Appointment ownership FK rejects mismatch", true),
        new("Constraints", "Clinical relationships do not cascade delete", true),
        new("Authorization", "Active assigned Doctor is accepted", false),
        new("Authorization", "Inactive Doctor is denied", false),
        new("Authorization", "Foreign Doctor is denied", false),
        new("Authorization", "Patient owns exact profile and reads Finalized only", false),
        new("Authorization", "Admin has no implicit clinical access", false),
        new("Historical", "Completed Appointment without MedicalRecord remains unchanged", false),
        new("Historical", "No MedicalRecord is fabricated", false)
    ];
}
