using HIS.Api.ClinicalPersistenceIntegrationTests;

var passed = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}

if (args.Contains("--live", StringComparer.Ordinal))
{
    // Deliberately no connection-string loading and no SQL provider invocation.
    // A later approved phase must bind signed identity evidence and implement
    // the live adapter before CanConnectLive may be reviewed for activation.
    ClinicalPersistenceIntegrationHarness.ValidateLiveApproval(
        new LiveApproval(true, string.Empty, string.Empty, 0, Guid.Empty,
            string.Empty, string.Empty, DateTime.MinValue, false),
        DateTime.UtcNow);
}

ClinicalFixtureManifest.Validate();
Check(!ClinicalPersistenceIntegrationHarness.CanConnectLive &&
      !ClinicalPersistenceIntegrationHarness.CanCreateDatabase &&
      !ClinicalPersistenceIntegrationHarness.CanApplyMigrations &&
      !ClinicalPersistenceIntegrationHarness.CanSeedAutomatically &&
      !ClinicalPersistenceIntegrationHarness.CanCleanupAutomatically,
    "Default harness has no SQL or automatic mutation capability");
Check(ClinicalFixtureManifest.Rows.Count == 15 &&
      ClinicalFixtureManifest.Rows.Select(x => x.Id).Distinct().Count() == 15,
    "Fixture manifest contains exactly 15 unique synthetic identities");
Check(ClinicalFixtureManifest.CleanupDeleteLimit == 23 &&
      ClinicalFixtureManifest.MedicalRecordCommittedUpdateLimit == 2,
    "Mutation and exact cleanup budgets are internally consistent");
Check(ClinicalSqlServerTestMatrix.Scenarios.Count == 22 &&
      ClinicalSqlServerTestMatrix.Scenarios.Select(x => x.Area).Distinct().Count() == 6,
    "SQL Server matrix covers all approved test areas");
Check(ClinicalPersistenceIntegrationHarness.IsProtectedDatabase("HIS_DB") &&
      ClinicalPersistenceIntegrationHarness.IsProtectedDatabase(
          "HIS_DB_ClinicalRestore_20261021T104629_a531c2fe9036482198d382a9d3db9c06") &&
      ClinicalPersistenceIntegrationHarness.IsProtectedDatabase(
          "HIS_DB_ClinicalMigrationTest_20261022T031652_7632b2af31cf45b0b83c26ef371e5c27") &&
      !ClinicalPersistenceIntegrationHarness.IsProtectedDatabase(
          ClinicalPersistenceIntegrationHarness.CandidateDatabaseName),
    "Database denylist protects HIS_DB and both protected clinical clones");

var rejected = Capture(() => ClinicalPersistenceIntegrationHarness.ValidateLiveApproval(
    new LiveApproval(false, "LAPTOP-Q1E2KVS8",
        ClinicalPersistenceIntegrationHarness.CandidateDatabaseName,
        7, Guid.NewGuid(), "approval", new string('a', 64),
        DateTime.UtcNow.AddHours(1), true), DateTime.UtcNow));
Check(rejected is HarnessSafetyException { Code: "LIVE_OPT_IN_REQUIRED" },
    "Live verification requires explicit opt-in before identity evaluation");

rejected = Capture(() => ClinicalPersistenceIntegrationHarness.ValidateLiveApproval(
    new LiveApproval(true, "LAPTOP-Q1E2KVS8", "HIS_DB",
        5, Guid.NewGuid(), "approval", new string('a', 64),
        DateTime.UtcNow.AddHours(1), true), DateTime.UtcNow));
Check(rejected is HarnessSafetyException { Code: "PROTECTED_DATABASE_REJECTED" },
    "Protected database names fail closed even with an apparent approval");

rejected = Capture(() => ClinicalPersistenceIntegrationHarness.ValidateLiveApproval(
    new LiveApproval(true, "LAPTOP-Q1E2KVS8",
        ClinicalPersistenceIntegrationHarness.CandidateDatabaseName,
        7, Guid.NewGuid(), "approval", new string('a', 64),
        DateTime.UtcNow.AddHours(1), true), DateTime.UtcNow));
Check(rejected is HarnessSafetyException { Code: "LIVE_SQL_ADAPTER_DISABLED" },
    "Complete-looking approval remains blocked while live SQL is disabled");

var repositoryRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../.."));
var migration = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Migrations/20261020060004_AddClinicalSchemaAndAudit.cs"));
var configuration = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Data/Configurations/MedicalRecordConfiguration.cs"));
var migrationDirectory = Path.Combine(repositoryRoot, "backend/HIS/HIS.Api/Migrations");
Check(migration.Contains("name: \"ChiefComplaint\"", StringComparison.Ordinal) &&
      migration.Contains("nullable: true", StringComparison.Ordinal) &&
      !migration.Contains("ChiefComplaint_NotBlank", StringComparison.Ordinal),
    "Migration permits nullable Draft ChiefComplaint without an unconditional check");
Check(migration.Contains("CK_MedicalRecords_FinalizationLifecycle", StringComparison.Ordinal) &&
      migration.Contains("CK_MedicalRecords_Status", StringComparison.Ordinal) &&
      migration.Contains("IX_MedicalRecords_AppointmentId_PatientProfileId_DoctorId", StringComparison.Ordinal),
    "Migration contains lifecycle, status and composite ownership protections");
Check(configuration.Contains("IsRowVersion()", StringComparison.Ordinal) &&
      configuration.Contains("HasConversion<string>()", StringComparison.Ordinal) &&
      migration.Contains("ClinicalAuditEvents", StringComparison.Ordinal),
    "EF and migration sources contain RowVersion, string status and audit schema");
Check(ClinicalSqlServerTestMatrix.ExpectedPriorMigrations.Count == 9 &&
      ClinicalSqlServerTestMatrix.ExpectedPriorMigrations.All(id =>
          File.Exists(Path.Combine(migrationDirectory, id + ".cs"))) &&
      File.Exists(Path.Combine(migrationDirectory,
          ClinicalSqlServerTestMatrix.TargetMigration + ".cs")),
    "Harness pins nine prior migrations and the isolated clinical target migration");

Console.WriteLine($"Clinical persistence harness offline checks: {passed}/{passed} PASS");
Console.WriteLine("LIVE SQL capability remains disabled.");

static Exception Capture(Action action)
{
    try { action(); }
    catch (Exception error) { return error; }
    throw new InvalidOperationException("Expected failure.");
}
