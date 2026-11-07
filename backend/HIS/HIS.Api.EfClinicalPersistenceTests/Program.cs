using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Entities;
using HIS.Api.Enums;
using HIS.Api.Services.Clinical;
using Microsoft.EntityFrameworkCore;

var passed = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}

var recordId = Guid.Parse("11111111-1111-4111-8111-111111111111");
var appointmentId = Guid.Parse("22222222-2222-4222-8222-222222222222");
var profileId = Guid.Parse("33333333-3333-4333-8333-333333333333");
var doctorId = Guid.Parse("44444444-4444-4444-8444-444444444444");
var actorId = Guid.Parse("55555555-5555-4555-8555-555555555555");
var created = new DateTime(2026, 11, 7, 1, 2, 3, DateTimeKind.Utc);
var version1Bytes = new byte[] { 0, 0, 0, 0, 0, 0, 0, 1 };
var version2Bytes = new byte[] { 0, 0, 0, 0, 0, 0, 0, 2 };
var version1 = RowVersionToken.Encode(version1Bytes);
var version2 = RowVersionToken.Encode(version2Bytes);

var draft = new ClinicalRecordState(recordId, appointmentId, profileId, doctorId,
    null, null, null, null, null, MedicalRecordContractStatus.Draft,
    string.Empty, created, null, null, null);
var draftEntity = ClinicalPersistenceMapping.ToNewEntity(draft);
Check(draftEntity.Id == recordId && draftEntity.AppointmentId == appointmentId &&
      draftEntity.PatientProfileId == profileId && draftEntity.DoctorId == doctorId &&
      draftEntity.Status == MedicalRecordStatus.Draft &&
      draftEntity.ChiefComplaint is null && draftEntity.Diagnosis is null &&
      draftEntity.RowVersion.Length == 0,
    "Draft creation maps authoritative identities and leaves RowVersion database-generated");

draftEntity.RowVersion = version1Bytes;
var mappedDraft = ClinicalPersistenceMapping.ToState(draftEntity);
Check(mappedDraft.Status == MedicalRecordContractStatus.Draft &&
      mappedDraft.RowVersion == version1 && mappedDraft.ChiefComplaint is null,
    "Entity-to-state mapping preserves nullable Draft content and canonical RowVersion");

var updated = mappedDraft with
{
    ChiefComplaint = "Pain",
    Diagnosis = "Observation",
    UpdatedAt = created.AddMinutes(1)
};
ClinicalPersistenceMapping.ApplyMutableState(draftEntity, updated);
Check(draftEntity.ChiefComplaint == "Pain" &&
      draftEntity.Diagnosis == "Observation" &&
      draftEntity.Status == MedicalRecordStatus.Draft,
    "Draft update mapping changes only mutable clinical state");

var finalized = updated with
{
    Status = MedicalRecordContractStatus.Finalized,
    FinalizedAt = created.AddMinutes(2),
    FinalizedByUserId = actorId
};
ClinicalPersistenceMapping.ApplyMutableState(draftEntity, finalized);
Check(draftEntity.Status == MedicalRecordStatus.Finalized &&
      draftEntity.FinalizedAt == finalized.FinalizedAt &&
      draftEntity.FinalizedByUserId == actorId,
    "Finalization mapping preserves approved status metadata");

Check(ClinicalPersistenceMapping.ToEntityStatus(MedicalRecordContractStatus.Draft) == MedicalRecordStatus.Draft &&
      ClinicalPersistenceMapping.ToContractStatus(MedicalRecordStatus.Finalized) == MedicalRecordContractStatus.Finalized,
    "Clinical status mapping is explicit in both directions");
Check(Capture(() => ClinicalPersistenceMapping.ToEntityStatus((MedicalRecordContractStatus)99)) is InvalidOperationException &&
      Capture(() => ClinicalPersistenceMapping.ToContractStatus((MedicalRecordStatus)99)) is InvalidOperationException,
    "Unknown clinical statuses fail closed");
Check(Capture(() => ClinicalPersistenceMapping.ApplyMutableState(draftEntity,
        finalized with { DoctorId = Guid.NewGuid() })) is InvalidOperationException,
    "Persistence mapping cannot change the authoritative ownership tuple");

var audit = ClinicalPersistenceMapping.ToAuditEntity(new ClinicalAuditWrite(
    recordId, actorId, "DraftUpdated", created, "correlation-1", version1, version2));
Check(audit.MedicalRecordId == recordId && audit.ActorUserId == actorId &&
      audit.Action == "DraftUpdated" && audit.CorrelationId == "correlation-1" &&
      audit.PreviousRecordVersion!.SequenceEqual(version1Bytes) &&
      audit.NewRecordVersion.SequenceEqual(version2Bytes),
    "Audit mapping captures previous and new versions without clinical content");
Check(Capture(() => ClinicalPersistenceMapping.ToAuditEntity(new ClinicalAuditWrite(
        recordId, actorId, "DraftUpdated", created, "correlation-1", version1, "invalid")))
      is RowVersionTokenException,
    "Audit mapping rejects malformed RowVersion metadata");

Check(ClinicalSqlConflictClassifier.IsDuplicateAppointment(2601,
          $"duplicate index '{ClinicalSqlConflictClassifier.AppointmentIndexName}'") &&
      ClinicalSqlConflictClassifier.IsDuplicateAppointment(2627,
          $"constraint '{ClinicalSqlConflictClassifier.AppointmentIndexName}'"),
    "Verified duplicate Appointment index errors map to conflict");
Check(!ClinicalSqlConflictClassifier.IsDuplicateAppointment(547,
          ClinicalSqlConflictClassifier.AppointmentIndexName) &&
      !ClinicalSqlConflictClassifier.IsDuplicateAppointment(2601, "some_other_index") &&
      !ClinicalSqlConflictClassifier.IsDuplicateAppointment(2627, null),
    "Unrelated SQL errors are not misclassified as duplicate Appointment conflicts");
Check(ClinicalPersistenceExceptionClassifier.IsConcurrency(new DbUpdateConcurrencyException()) &&
      !ClinicalPersistenceExceptionClassifier.IsConcurrency(new DbUpdateException()),
    "Only EF optimistic-concurrency failures map to the clinical conflict path");

var events = new List<string>();
var value = await ClinicalTransactionCoordinator.ExecuteAsync(
    _ => { events.Add("mutation"); return Task.FromResult(42); },
    _ => { events.Add("commit"); return Task.CompletedTask; },
    _ => { events.Add("rollback"); return Task.CompletedTask; },
    CancellationToken.None);
Check(value == 42 && events.SequenceEqual(["mutation", "commit"]),
    "Successful clinical transaction commits exactly once");

events.Clear();
var primary = new TestFailureException();
var failure = await CaptureAsync(() => ClinicalTransactionCoordinator.ExecuteAsync<int>(
    _ => { events.Add("mutation"); return Task.FromException<int>(primary); },
    _ => { events.Add("commit"); return Task.CompletedTask; },
    _ => { events.Add("rollback"); return Task.CompletedTask; },
    CancellationToken.None));
Check(ReferenceEquals(failure, primary) && events.SequenceEqual(["mutation", "rollback"]),
    "Failed clinical mutation rolls back without commit or retry");

var source = File.ReadAllText(Path.Combine(AppContext.BaseDirectory,
    "../../../../HIS.Api/Services/Clinical/EfClinicalWorkflowStore.cs"));
Check(source.Contains("OriginalValue = expectedBytes", StringComparison.Ordinal) &&
      source.Contains("DbUpdateConcurrencyException", StringComparison.Ordinal) &&
      !source.Contains("CreateExecutionStrategy", StringComparison.Ordinal) &&
      !source.Contains("QueueEntr", StringComparison.Ordinal),
    "Adapter enforces the supplied original RowVersion without retry or Queue side effects");
Check(!source.Contains("ILogger", StringComparison.Ordinal) &&
      !source.Contains("MedicalRecordsController", StringComparison.Ordinal),
    "Adapter adds neither clinical-content logging nor endpoint activation");

Console.WriteLine($"EF clinical persistence checks: {passed}/{passed} PASS");

static Exception Capture(Action action)
{
    try { action(); }
    catch (Exception error) { return error; }
    throw new InvalidOperationException("Expected failure.");
}

static async Task<Exception> CaptureAsync(Func<Task> action)
{
    try { await action(); }
    catch (Exception error) { return error; }
    throw new InvalidOperationException("Expected failure.");
}

sealed class TestFailureException : Exception;
