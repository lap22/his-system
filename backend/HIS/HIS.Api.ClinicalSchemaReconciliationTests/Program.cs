using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Services.Clinical;

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

Console.WriteLine($"Clinical schema reconciliation checks: {passed}/{passed} PASS");

static Exception Capture(Action action)
{
    try { action(); }
    catch (Exception error) { return error; }
    throw new InvalidOperationException("Expected failure.");
}
