using System.ComponentModel.DataAnnotations;
using System.Reflection;
using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Enums;
using HIS.Api.Services.Clinical;

var passed = 0;
var validVersion = RowVersionToken.Encode(new byte[8]);
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}
bool Valid(object value) => Validator.TryValidateObject(value,
    new ValidationContext(value), [], validateAllProperties: true);
MedicalRecordPolicyResult Create(string role = "Doctor", bool active = true,
    Guid? authenticated = null, Guid? assigned = null,
    AppointmentStatus status = AppointmentStatus.InProgress,
    bool exists = false)
{
    var doctor = authenticated ?? Guid.Parse("11111111-1111-4111-8111-111111111111");
    return MedicalRecordPolicy.CanCreateDraft(role, active, doctor,
        assigned ?? doctor, status, exists);
}
MedicalRecordPolicyResult Mutate(string role = "Doctor", bool active = true,
    Guid? authenticated = null, Guid? assigned = null,
    AppointmentStatus appointment = AppointmentStatus.InProgress,
    MedicalRecordContractStatus record = MedicalRecordContractStatus.Draft,
    string? supplied = "opaque-v1", string authoritative = "opaque-v1")
{
    var doctor = authenticated ?? Guid.Parse("11111111-1111-4111-8111-111111111111");
    return MedicalRecordPolicy.CanMutateDraft(role, active, doctor,
        assigned ?? doctor, appointment, record, supplied, authoritative);
}

Check(Valid(new CreateMedicalRecordRequest { AppointmentId = Guid.NewGuid() }),
    "Draft permits missing Diagnosis and incomplete content");
Check(!Valid(new FinalizeMedicalRecordRequest { RowVersion = validVersion, Diagnosis = "Dx" }),
    "Finalization requires ChiefComplaint");
Check(!Valid(new FinalizeMedicalRecordRequest { RowVersion = validVersion, ChiefComplaint = "Concern" }),
    "Finalization requires Diagnosis");
Check(!Valid(new FinalizeMedicalRecordRequest { RowVersion = validVersion, ChiefComplaint = "  ", Diagnosis = "  " }),
    "Whitespace-only required fields are rejected");
Check(!Valid(new CreateMedicalRecordRequest { AppointmentId = Guid.NewGuid(), ChiefComplaint = new string('x', 2001) }) &&
      !Valid(new CreateMedicalRecordRequest { AppointmentId = Guid.NewGuid(), DoctorNotes = new string('x', 4001) }),
    "Maximum clinical field lengths are enforced");
Check(Create().Allowed, "Active assigned Doctor may create a draft");
Check(Create(active: false).Failure == MedicalRecordPolicyFailure.InactiveDoctor,
    "Inactive Doctor is denied");
Check(Create(assigned: Guid.NewGuid()).Failure == MedicalRecordPolicyFailure.AppointmentNotAssigned,
    "Doctor cannot access another Doctor appointment");
Check(Create(status: AppointmentStatus.Confirmed).Failure == MedicalRecordPolicyFailure.AppointmentNotInProgress,
    "Draft creation requires an InProgress appointment");
Check(Create(exists: true).Failure == MedicalRecordPolicyFailure.RecordAlreadyExists,
    "One-record-per-Appointment policy rejects a second record");
Check(Mutate(record: MedicalRecordContractStatus.Finalized).Failure == MedicalRecordPolicyFailure.RecordNotDraft,
    "Finalized clinical content is immutable");
var patient = Guid.NewGuid();
Check(MedicalRecordPolicy.CanPatientRead("Patient", patient, patient,
        MedicalRecordContractStatus.Finalized).Allowed,
    "Patient may read a finalized record for an owned profile");
Check(MedicalRecordPolicy.CanPatientRead("Patient", patient, Guid.NewGuid(),
        MedicalRecordContractStatus.Finalized).Failure == MedicalRecordPolicyFailure.PatientProfileNotOwned,
    "PatientProfile ownership is required");
Check(MedicalRecordPolicy.CanPatientRead("Patient", patient, patient,
        MedicalRecordContractStatus.Draft).Failure == MedicalRecordPolicyFailure.RecordNotFinalized,
    "Patient cannot read Draft records");
Check(Create(role: "Admin").Failure == MedicalRecordPolicyFailure.RoleDenied,
    "Admin has no implicit clinical mutation access");
Check(MedicalRecordPolicy.CanPatientRead("Admin", patient, patient,
        MedicalRecordContractStatus.Finalized).Failure == MedicalRecordPolicyFailure.RoleDenied,
    "Admin has no implicit clinical read access");
Check(Mutate(supplied: null).Failure == MedicalRecordPolicyFailure.MissingConcurrencyToken &&
      Mutate(supplied: "old").Failure == MedicalRecordPolicyFailure.StaleConcurrencyToken,
    "Missing and stale opaque concurrency tokens remain distinct");
Check(!MedicalRecordPolicy.AutomaticallyRetryMutations,
    "Clinical mutations are never automatically retried");
var policySource = File.ReadAllText(Path.Combine(AppContext.BaseDirectory,
    "../../../../HIS.Api/Services/Clinical/MedicalRecordPolicy.cs"));
Check(!policySource.Contains("ChiefComplaint", StringComparison.Ordinal) &&
      !policySource.Contains("Diagnosis", StringComparison.Ordinal) &&
      !policySource.Contains("ILogger", StringComparison.Ordinal),
    "Authorization policy cannot include clinical content in diagnostic logs");
var apiAssembly = typeof(MedicalRecordPolicy).Assembly;
Check(!apiAssembly.GetTypes().Any(type => type.Name.Contains("MedicalRecordsController", StringComparison.Ordinal)),
    "No Medical Records controller or active endpoint is exposed");

Console.WriteLine($"Medical Records offline contract checks: {passed}/{passed} PASS");
