using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Enums;

namespace HIS.Api.Services.Clinical;

public sealed record ClinicalActor(Guid UserId, string Role);
public sealed record ClinicalDoctor(Guid Id, bool IsActive);
public sealed record ClinicalAppointment(
    Guid Id, Guid PatientProfileId, Guid DoctorId, AppointmentStatus Status);
public sealed record ClinicalPatientProfile(Guid Id, Guid OwnerUserId);

public sealed record ClinicalRecordState(
    Guid Id,
    Guid AppointmentId,
    Guid PatientProfileId,
    Guid DoctorId,
    string? ChiefComplaint,
    string? Symptoms,
    string? Diagnosis,
    string? Treatment,
    string? DoctorNotes,
    MedicalRecordContractStatus Status,
    string RowVersion,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    DateTime? FinalizedAt,
    Guid? FinalizedByUserId);

public sealed record ClinicalAuditWrite(
    Guid MedicalRecordId,
    Guid ActorUserId,
    string Action,
    DateTime OccurredAt,
    string CorrelationId,
    string? PreviousRecordVersion,
    string NewRecordVersion);

public interface IClinicalWorkflowStore
{
    Task<T> ExecuteTransactionAsync<T>(
        Func<IClinicalWorkflowTransaction, CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken);
}

// Every mutation and its audit append use this same transaction-bound object.
// The future EF implementation must enforce expectedVersion in its UPDATE/SaveChanges,
// not merely compare a value previously read into memory.
public interface IClinicalWorkflowTransaction
{
    Task<ClinicalDoctor?> FindDoctorByUserIdAsync(Guid userId, CancellationToken cancellationToken);
    Task<ClinicalAppointment?> FindAppointmentAsync(Guid appointmentId, CancellationToken cancellationToken);
    Task<ClinicalPatientProfile?> FindPatientProfileAsync(Guid profileId, CancellationToken cancellationToken);
    Task<ClinicalRecordState?> FindRecordByAppointmentAsync(Guid appointmentId, CancellationToken cancellationToken);
    Task<ClinicalRecordState?> FindRecordByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<IReadOnlyList<ClinicalRecordState>> ListFinalizedAsync(Guid profileId, CancellationToken cancellationToken);
    Task<ClinicalRecordState> InsertAsync(ClinicalRecordState record, CancellationToken cancellationToken);
    Task<ClinicalRecordState> UpdateAsync(ClinicalRecordState record, string expectedVersion, CancellationToken cancellationToken);
    Task AppendAuditAsync(ClinicalAuditWrite audit, CancellationToken cancellationToken);
}

public interface IClinicalClock
{
    DateTime UtcNow { get; }
}

public interface IMedicalRecordApplicationService
{
    Task<MedicalRecordResponse?> LoadByAppointmentAsync(
        ClinicalActor actor, Guid appointmentId,
        CancellationToken cancellationToken = default);
    Task<MedicalRecordResponse> CreateDraftAsync(
        ClinicalActor actor, CreateMedicalRecordRequest request, string correlationId,
        CancellationToken cancellationToken = default);
    Task<MedicalRecordResponse> UpdateDraftAsync(
        ClinicalActor actor, Guid id, UpdateMedicalRecordDraftRequest request,
        string correlationId, CancellationToken cancellationToken = default);
    Task<MedicalRecordResponse> FinalizeAsync(
        ClinicalActor actor, Guid id, FinalizeMedicalRecordRequest request,
        string correlationId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<MedicalRecordResponse>> ListFinalizedForPatientProfileAsync(
        ClinicalActor actor, Guid profileId,
        CancellationToken cancellationToken = default);
}

public sealed class ClinicalWorkflowException : Exception
{
    public ClinicalWorkflowException(ClinicalWorkflowFailure failure)
        : base(MessageFor(failure)) => Failure = failure;

    public ClinicalWorkflowFailure Failure { get; }

    private static string MessageFor(ClinicalWorkflowFailure failure) => failure switch
    {
        ClinicalWorkflowFailure.InvalidRequest => "The clinical request is invalid.",
        ClinicalWorkflowFailure.BusinessRule => "The clinical operation is not allowed in its current state.",
        ClinicalWorkflowFailure.AccessDenied => "The clinical resource is not available.",
        ClinicalWorkflowFailure.NotFound => "The clinical resource was not found.",
        ClinicalWorkflowFailure.Conflict => "The clinical resource changed or is not eligible for this operation.",
        _ => "The clinical operation could not be completed."
    };
}

public enum ClinicalWorkflowFailure
{
    InvalidRequest,
    BusinessRule,
    AccessDenied,
    NotFound,
    Conflict
}

public sealed class ClinicalStoreConcurrencyException : Exception;
