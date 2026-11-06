using System.ComponentModel.DataAnnotations;

namespace HIS.Api.DTOs.MedicalRecords;

public abstract class MedicalRecordContentRequest
{
    [MaxLength(2000)]
    public string? ChiefComplaint { get; set; }

    [MaxLength(2000)]
    public string? Symptoms { get; set; }

    [MaxLength(2000)]
    public string? Diagnosis { get; set; }

    [MaxLength(2000)]
    public string? Treatment { get; set; }

    [MaxLength(4000)]
    public string? DoctorNotes { get; set; }
}

// Proposed contract only. No controller or service exposes this request yet.
public sealed class CreateMedicalRecordRequest : MedicalRecordContentRequest,
    IValidatableObject
{
    public Guid AppointmentId { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (AppointmentId == Guid.Empty)
            yield return new ValidationResult(
                "AppointmentId is required.", [nameof(AppointmentId)]);
    }
}

public sealed class UpdateMedicalRecordDraftRequest : MedicalRecordContentRequest
{
    [Required, RowVersionToken]
    public string RowVersion { get; set; } = null!;
}

public sealed class FinalizeMedicalRecordRequest : MedicalRecordContentRequest,
    IValidatableObject
{
    [Required, RowVersionToken]
    public string RowVersion { get; set; } = null!;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrWhiteSpace(ChiefComplaint))
            yield return new ValidationResult(
                "ChiefComplaint is required for finalization.",
                [nameof(ChiefComplaint)]);

        if (string.IsNullOrWhiteSpace(Diagnosis))
            yield return new ValidationResult(
                "Diagnosis is required for finalization.",
                [nameof(Diagnosis)]);
    }
}
