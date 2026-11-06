using System.Text.Json.Serialization;

namespace HIS.Api.DTOs.MedicalRecords;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum MedicalRecordContractStatus
{
    Draft = 1,
    Finalized = 2
}

public static class MedicalRecordStatusContract
{
    public static string ToDatabaseValue(MedicalRecordContractStatus status) => status switch
    {
        MedicalRecordContractStatus.Draft => "Draft",
        MedicalRecordContractStatus.Finalized => "Finalized",
        _ => throw new ArgumentOutOfRangeException(nameof(status))
    };

    public static MedicalRecordContractStatus FromDatabaseValue(string value) => value switch
    {
        "Draft" => MedicalRecordContractStatus.Draft,
        "Finalized" => MedicalRecordContractStatus.Finalized,
        _ => throw new ArgumentException("The medical record status is invalid.", nameof(value))
    };
}

// Proposed response contract. RowVersion is an opaque transport token; callers
// must return it unchanged and must not infer its database representation.
public sealed class MedicalRecordResponse
{
    public Guid Id { get; set; }
    public Guid AppointmentId { get; set; }
    public Guid PatientProfileId { get; set; }
    public Guid DoctorId { get; set; }
    public string? ChiefComplaint { get; set; }
    public string? Symptoms { get; set; }
    public string? Diagnosis { get; set; }
    public string? Treatment { get; set; }
    public string? DoctorNotes { get; set; }
    public MedicalRecordContractStatus Status { get; set; }
    public string RowVersion { get; set; } = null!;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public DateTime? FinalizedAt { get; set; }
    public Guid? FinalizedByUserId { get; set; }
}
