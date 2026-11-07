using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Enums;
using HIS.Api.Services.Clinical;

var passed = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}
async Task<ClinicalWorkflowFailure> Failure(Func<Task> action)
{
    try { await action(); }
    catch (ClinicalWorkflowException error) { return error.Failure; }
    throw new InvalidOperationException("Expected a safe workflow failure.");
}

var doctorUser = Guid.Parse("11111111-1111-4111-8111-111111111111");
var doctorId = Guid.Parse("22222222-2222-4222-8222-222222222222");
var patientUser = Guid.Parse("33333333-3333-4333-8333-333333333333");
var profileId = Guid.Parse("44444444-4444-4444-8444-444444444444");
var appointmentId = Guid.Parse("55555555-5555-4555-8555-555555555555");
ClinicalActor doctorActor = new(doctorUser, "Doctor");
ClinicalActor patientActor = new(patientUser, "Patient");
CreateMedicalRecordRequest NewDraft() => new() { AppointmentId = appointmentId };
FakeStore Fixture(AppointmentStatus status = AppointmentStatus.InProgress)
{
    var fake = new FakeStore();
    fake.Doctors[doctorUser] = new(doctorId, true);
    fake.Profiles[profileId] = new(profileId, patientUser);
    fake.Appointments[appointmentId] = new(appointmentId, profileId, doctorId, status);
    return fake;
}
MedicalRecordApplicationService Service(FakeStore store) => new(store,
    new FakeClock(new DateTime(2026, 11, 6, 2, 0, 0, DateTimeKind.Utc)));

var store = Fixture();
var created = await Service(store).CreateDraftAsync(doctorActor, NewDraft(), "create-1");
Check(created.Status == MedicalRecordContractStatus.Draft && store.Audits.Count == 1,
    "Draft creation and audit commit atomically");
Check(created.PatientProfileId == profileId && created.DoctorId == doctorId,
    "PatientProfileId and DoctorId derive from the authoritative appointment");
Check(created.Diagnosis is null, "Incomplete Draft is accepted");
Check(await Failure(() => Service(store).CreateDraftAsync(doctorActor, NewDraft(), "duplicate")) == ClinicalWorkflowFailure.Conflict,
    "Duplicate Appointment record is rejected");

var inactive = Fixture(); inactive.Doctors[doctorUser] = new(doctorId, false);
Check(await Failure(() => Service(inactive).CreateDraftAsync(doctorActor, NewDraft(), "inactive")) == ClinicalWorkflowFailure.AccessDenied,
    "Inactive Doctor is denied");
var foreign = Fixture(); foreign.Doctors[doctorUser] = new(Guid.NewGuid(), true);
Check(await Failure(() => Service(foreign).CreateDraftAsync(doctorActor, NewDraft(), "foreign")) == ClinicalWorkflowFailure.AccessDenied,
    "Foreign Doctor is denied");
var wrongStatus = Fixture(AppointmentStatus.Confirmed);
Check(await Failure(() => Service(wrongStatus).CreateDraftAsync(doctorActor, NewDraft(), "status")) == ClinicalWorkflowFailure.BusinessRule,
    "Non-InProgress appointment is rejected");

var update = new UpdateMedicalRecordDraftRequest { RowVersion = created.RowVersion,
    ChiefComplaint = "Headache", DoctorNotes = "Review" };
var updated = await Service(store).UpdateDraftAsync(doctorActor, created.Id, update, "update-1");
Check(updated.ChiefComplaint == "Headache" && updated.RowVersion != created.RowVersion && store.Audits.Count == 2,
    "Draft update returns a new version and appends audit");
Check(await Failure(() => Service(store).UpdateDraftAsync(doctorActor, created.Id,
    new UpdateMedicalRecordDraftRequest { RowVersion = RowVersionToken.Encode(BitConverter.GetBytes(99L)) }, "stale")) == ClinicalWorkflowFailure.Conflict,
    "Stale version produces Conflict");
Check(await Failure(() => Service(store).UpdateDraftAsync(doctorActor, created.Id,
    new UpdateMedicalRecordDraftRequest { RowVersion = "" }, "missing")) == ClinicalWorkflowFailure.InvalidRequest,
    "Missing version fails request validation");

Check(await Failure(() => Service(store).FinalizeAsync(doctorActor, created.Id,
    new FinalizeMedicalRecordRequest { RowVersion = updated.RowVersion, ChiefComplaint = "Headache" }, "invalid-final")) == ClinicalWorkflowFailure.InvalidRequest,
    "Finalization requires ChiefComplaint and Diagnosis");
var finalized = await Service(store).FinalizeAsync(doctorActor, created.Id,
    new FinalizeMedicalRecordRequest { RowVersion = updated.RowVersion,
        ChiefComplaint = "Headache", Diagnosis = "Migraine" }, "final-1");
Check(finalized.Status == MedicalRecordContractStatus.Finalized &&
      finalized.FinalizedByUserId == doctorUser && store.Audits.Count == 3,
    "Finalization records actor, time and audit");
Check(await Failure(() => Service(store).FinalizeAsync(doctorActor, created.Id,
    new FinalizeMedicalRecordRequest { RowVersion = finalized.RowVersion,
        ChiefComplaint = "Headache", Diagnosis = "Migraine" }, "repeat")) == ClinicalWorkflowFailure.BusinessRule,
    "Repeated finalization does not write again");
Check(await Failure(() => Service(store).UpdateDraftAsync(doctorActor, created.Id,
    new UpdateMedicalRecordDraftRequest { RowVersion = finalized.RowVersion }, "immutable")) == ClinicalWorkflowFailure.BusinessRule,
    "Finalized record is immutable");

var list = await Service(store).ListFinalizedForPatientProfileAsync(patientActor, profileId);
Check(list.Count == 1 && list[0].Id == finalized.Id, "Owning Patient lists Finalized records only");
Check(await Failure(() => Service(store).ListFinalizedForPatientProfileAsync(
    new ClinicalActor(Guid.NewGuid(), "Patient"), profileId)) == ClinicalWorkflowFailure.AccessDenied,
    "Foreign PatientProfile ownership is denied");
Check(await Failure(() => Service(store).ListFinalizedForPatientProfileAsync(
    new ClinicalActor(Guid.NewGuid(), "Admin"), profileId)) == ClinicalWorkflowFailure.AccessDenied,
    "Admin has no implicit clinical access");

var rollback = Fixture();
var rollbackRecord = await Service(rollback).CreateDraftAsync(doctorActor, NewDraft(), "rollback-create");
rollback.FailAudit = true;
await AssertThrows(() => Service(rollback).UpdateDraftAsync(doctorActor, rollbackRecord.Id,
    new UpdateMedicalRecordDraftRequest { RowVersion = rollbackRecord.RowVersion, ChiefComplaint = "sensitive-change" }, "rollback-update"));
Check(rollback.Records[rollbackRecord.Id].ChiefComplaint is null && rollback.Audits.Count == 1,
    "Audit failure rolls back the clinical state change");

var race = Fixture();
var raceRecord = await Service(race).CreateDraftAsync(doctorActor, NewDraft(), "race-create");
race.ForceConcurrencyOnUpdate = true;
Check(await Failure(() => Service(race).UpdateDraftAsync(doctorActor, raceRecord.Id,
    new UpdateMedicalRecordDraftRequest { RowVersion = raceRecord.RowVersion }, "race")) == ClinicalWorkflowFailure.Conflict,
    "Atomic store concurrency failure maps to Conflict without retry");
Check(race.UpdateAttempts == 1 && !MedicalRecordApplicationService.AutomaticallyRetryMutations,
    "Clinical mutation is attempted once with no automatic retry");

var historical = Fixture(AppointmentStatus.Completed);
Check(await Service(historical).LoadByAppointmentAsync(doctorActor, appointmentId) is null,
    "Historical Completed appointment may legitimately have no MedicalRecord");
Check(store.QueueSideEffects == 0 && rollback.QueueSideEffects == 0 && race.QueueSideEffects == 0,
    "Clinical workflow has no Queue completion side effects");
Check(typeof(ClinicalWorkflowException).GetProperty(nameof(ClinicalWorkflowException.Failure)) is not null &&
      !new ClinicalWorkflowException(ClinicalWorkflowFailure.Conflict).Message.Contains("Headache", StringComparison.Ordinal),
    "Safe errors contain no clinical content");

Console.WriteLine($"Medical Records service checks: {passed}/{passed} PASS");

static async Task AssertThrows(Func<Task> action)
{
    try { await action(); }
    catch { return; }
    throw new InvalidOperationException("Expected failure.");
}

sealed class FakeClock(DateTime utcNow) : IClinicalClock
{
    public DateTime UtcNow => utcNow;
}

sealed class FakeStore : IClinicalWorkflowStore, IClinicalWorkflowTransaction
{
    public Dictionary<Guid, ClinicalDoctor> Doctors { get; } = [];
    public Dictionary<Guid, ClinicalAppointment> Appointments { get; } = [];
    public Dictionary<Guid, ClinicalPatientProfile> Profiles { get; } = [];
    public Dictionary<Guid, ClinicalRecordState> Records { get; private set; } = [];
    public List<ClinicalAuditWrite> Audits { get; private set; } = [];
    public bool FailAudit { get; set; }
    public bool ForceConcurrencyOnUpdate { get; set; }
    public int UpdateAttempts { get; private set; }
    public int QueueSideEffects => 0;

    public async Task<T> ExecuteTransactionAsync<T>(
        Func<IClinicalWorkflowTransaction, CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken)
    {
        var records = Records.ToDictionary(x => x.Key, x => x.Value);
        var audits = Audits.ToList();
        try { return await operation(this, cancellationToken); }
        catch { Records = records; Audits = audits; throw; }
    }

    public Task<ClinicalDoctor?> FindDoctorByUserIdAsync(Guid userId, CancellationToken _) =>
        Task.FromResult(Doctors.GetValueOrDefault(userId));
    public Task<ClinicalAppointment?> FindAppointmentAsync(Guid id, CancellationToken _) =>
        Task.FromResult(Appointments.GetValueOrDefault(id));
    public Task<ClinicalPatientProfile?> FindPatientProfileAsync(Guid id, CancellationToken _) =>
        Task.FromResult(Profiles.GetValueOrDefault(id));
    public Task<ClinicalRecordState?> FindRecordByAppointmentAsync(Guid id, CancellationToken _) =>
        Task.FromResult(Records.Values.SingleOrDefault(x => x.AppointmentId == id));
    public Task<ClinicalRecordState?> FindRecordByIdAsync(Guid id, CancellationToken _) =>
        Task.FromResult(Records.GetValueOrDefault(id));
    public Task<IReadOnlyList<ClinicalRecordState>> ListFinalizedAsync(Guid profileId, CancellationToken _) =>
        Task.FromResult<IReadOnlyList<ClinicalRecordState>>(Records.Values
            .Where(x => x.PatientProfileId == profileId && x.Status == MedicalRecordContractStatus.Finalized).ToArray());
    public Task<ClinicalRecordState> InsertAsync(ClinicalRecordState record, CancellationToken _)
    {
        if (Records.Values.Any(x => x.AppointmentId == record.AppointmentId))
            throw new ClinicalStoreConcurrencyException();
        var saved = record with { RowVersion = Version(1) };
        Records[saved.Id] = saved;
        return Task.FromResult(saved);
    }
    public Task<ClinicalRecordState> UpdateAsync(ClinicalRecordState record, string expectedVersion, CancellationToken _)
    {
        UpdateAttempts++;
        if (ForceConcurrencyOnUpdate || !Records.TryGetValue(record.Id, out var current) || current.RowVersion != expectedVersion)
            throw new ClinicalStoreConcurrencyException();
        var next = BitConverter.ToInt64(RowVersionToken.Decode(current.RowVersion)) + 1;
        var saved = record with { RowVersion = Version(next) };
        Records[saved.Id] = saved;
        return Task.FromResult(saved);
    }
    public Task AppendAuditAsync(ClinicalAuditWrite audit, CancellationToken _)
    {
        if (FailAudit) throw new InvalidOperationException("Synthetic audit failure");
        Audits.Add(audit);
        return Task.CompletedTask;
    }
    private static string Version(long value) =>
        RowVersionToken.Encode(BitConverter.GetBytes(value));
}
