using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using HIS.Api.Data;
using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Entities;
using HIS.Api.Enums;
using HIS.Api.Services.Clinical;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

var passed = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}
bool Valid(object value) => Validator.TryValidateObject(value,
    new ValidationContext(value), [], true);
var actor = Guid.Parse("11111111-1111-4111-8111-111111111111");
var finalizedAt = new DateTime(2026, 11, 6, 3, 0, 0, DateTimeKind.Utc);

Check(MedicalRecordSchemaContract.IsValidLifecycle(
    MedicalRecordContractStatus.Draft, null, null, null, null),
    "Empty Draft is valid");
Check(MedicalRecordSchemaContract.IsValidLifecycle(
    MedicalRecordContractStatus.Draft, "Concern", null, null, null),
    "Partially completed Draft is valid");
Check(MedicalRecordSchemaContract.IsValidLifecycle(
    MedicalRecordContractStatus.Finalized, "Concern", "Diagnosis", finalizedAt, actor),
    "Finalized record with required text and metadata is valid");
Check(!MedicalRecordSchemaContract.IsValidLifecycle(
    MedicalRecordContractStatus.Finalized, null, "Diagnosis", finalizedAt, actor),
    "Finalization without ChiefComplaint is invalid");
Check(!MedicalRecordSchemaContract.IsValidLifecycle(
    MedicalRecordContractStatus.Finalized, "Concern", null, finalizedAt, actor),
    "Finalization without Diagnosis is invalid");
Check(!MedicalRecordSchemaContract.IsValidLifecycle(
    MedicalRecordContractStatus.Finalized, "  ", "\t", finalizedAt, actor),
    "Whitespace-only finalization fields are invalid");
Check(!MedicalRecordSchemaContract.IsValidLifecycle(
        MedicalRecordContractStatus.Draft, null, null, finalizedAt, actor) &&
      !MedicalRecordSchemaContract.IsValidLifecycle(
        MedicalRecordContractStatus.Finalized, "C", "D", null, actor) &&
      !MedicalRecordSchemaContract.IsValidLifecycle(
        MedicalRecordContractStatus.Finalized, "C", "D", finalizedAt, null),
    "Finalization metadata is consistent with status");

var bytes = new byte[] { 0, 1, 2, 3, 252, 253, 254, 255 };
var token = RowVersionToken.Encode(bytes);
Check(RowVersionToken.Decode(token).SequenceEqual(bytes) && token == "AAECA/z9/v8=",
    "Eight-byte RowVersion has a canonical Base64 round trip");
Check(!RowVersionToken.TryDecode(Convert.ToBase64String(new byte[7]), out _) &&
      !RowVersionToken.TryDecode(Convert.ToBase64String(new byte[9]), out _),
    "Incorrect RowVersion byte lengths are rejected");
Check(!RowVersionToken.TryDecode("not-base64", out _) &&
      !RowVersionToken.TryDecode(" AAECA/z9/v8=", out _) &&
      !RowVersionToken.TryDecode("AAECA/z9/v8=\r\n", out _),
    "Malformed and noncanonical Base64 tokens are rejected");
Check(!Valid(new UpdateMedicalRecordDraftRequest { RowVersion = "AA==" }) &&
      Valid(new UpdateMedicalRecordDraftRequest { RowVersion = token }),
    "DTO validation uses the strict RowVersion transport contract");

Check(MedicalRecordStatusContract.ToDatabaseValue(MedicalRecordContractStatus.Draft) == "Draft" &&
      MedicalRecordStatusContract.FromDatabaseValue("Finalized") == MedicalRecordContractStatus.Finalized &&
      JsonSerializer.Serialize(MedicalRecordContractStatus.Finalized) == "\"Finalized\"",
    "Domain contract, JSON and EF string status names align");
Check(MedicalRecordSchemaContract.LifecycleCheckSql.Contains("[ChiefComplaint] IS NOT NULL", StringComparison.Ordinal) &&
      MedicalRecordSchemaContract.LifecycleCheckSql.Contains("[Diagnosis] IS NOT NULL", StringComparison.Ordinal) &&
      !MedicalRecordSchemaContract.LifecycleCheckSql.StartsWith("LEN", StringComparison.Ordinal),
    "Proposed SQL handles NULL explicitly and has no unconditional ChiefComplaint rule");

var error = Capture(() => RowVersionToken.Decode("private-clinical-text"));
Check(error is RowVersionTokenException &&
      error.Message == "The concurrency token is invalid." &&
      !error.Message.Contains("private-clinical-text", StringComparison.Ordinal),
    "Conversion errors contain no input or clinical data");

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseSqlServer("Server=offline.invalid;Database=offline_model_only;Integrated Security=true;Encrypt=true")
    .Options;
using var context = new AppDbContext(options);
var designModel = context.GetService<IDesignTimeModel>().Model;
var medicalRecord = designModel.FindEntityType(typeof(MedicalRecord))
    ?? throw new InvalidOperationException("MedicalRecord is missing from the EF model.");
var chiefComplaint = medicalRecord.FindProperty(nameof(MedicalRecord.ChiefComplaint));
var diagnosis = medicalRecord.FindProperty(nameof(MedicalRecord.Diagnosis));
var status = medicalRecord.FindProperty(nameof(MedicalRecord.Status));
var rowVersion = medicalRecord.FindProperty(nameof(MedicalRecord.RowVersion));
Check(chiefComplaint?.IsNullable == true && diagnosis?.IsNullable == true,
    "EF model permits incomplete Draft clinical text");
Check((status?.GetProviderClrType() == typeof(string) ||
       status?.GetValueConverter()?.ProviderClrType == typeof(string)) &&
      status.GetDefaultValue()?.Equals(MedicalRecordStatus.Draft) == true,
    "EF model stores the clinical status as the approved string representation");
Check(rowVersion?.IsConcurrencyToken == true && rowVersion.ValueGenerated == ValueGenerated.OnAddOrUpdate,
    "EF model configures MedicalRecord RowVersion concurrency");
var constraints = medicalRecord.GetCheckConstraints().ToDictionary(x => x.Name!, x => x.Sql);
Check(constraints.TryGetValue("CK_MedicalRecords_FinalizationLifecycle", out var lifecycleSql) &&
      lifecycleSql == MedicalRecordSchemaContract.LifecycleCheckSql &&
      constraints.ContainsKey("CK_MedicalRecords_Status") &&
      !constraints.ContainsKey("CK_MedicalRecords_ChiefComplaint_NotBlank"),
    "EF checks enforce finalization requirements without rejecting empty Drafts");
var appointmentForeignKey = medicalRecord.GetForeignKeys().Single(x => x.PrincipalEntityType.ClrType == typeof(Appointment));
Check(appointmentForeignKey.Properties.Select(x => x.Name).SequenceEqual([
          nameof(MedicalRecord.AppointmentId),
          nameof(MedicalRecord.PatientProfileId),
          nameof(MedicalRecord.DoctorId)]) &&
      appointmentForeignKey.DeleteBehavior == DeleteBehavior.NoAction,
    "EF model binds the record to the exact appointment ownership tuple with NO ACTION delete");
Check(designModel.FindEntityType(typeof(ClinicalAuditEvent)) is not null &&
      designModel.FindEntityType(typeof(Prescription)) is not null &&
      designModel.FindEntityType(typeof(PrescriptionItem)) is not null,
    "Clinical audit and prescription entities are present in the offline EF model");

Console.WriteLine($"Clinical schema reconciliation checks: {passed}/{passed} PASS");

static Exception Capture(Action action)
{
    try { action(); }
    catch (Exception error) { return error; }
    throw new InvalidOperationException("Expected failure.");
}
