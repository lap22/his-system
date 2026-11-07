using HIS.Api.DTOs.MedicalRecords;
using HIS.Api.Services.Clinical;

namespace HIS.Api.ClinicalHttpHostedTests;

public sealed class FakeMedicalRecordApplicationService : IMedicalRecordApplicationService
{
    public static readonly Guid DoctorA = Guid.Parse("10000000-0000-4000-8000-000000000001");
    public static readonly Guid DoctorB = Guid.Parse("10000000-0000-4000-8000-000000000002");
    public static readonly Guid PatientA = Guid.Parse("20000000-0000-4000-8000-000000000001");
    public static readonly Guid PatientB = Guid.Parse("20000000-0000-4000-8000-000000000002");
    public static readonly Guid OwnedProfile = Guid.Parse("30000000-0000-4000-8000-000000000001");
    public static readonly Guid ForeignProfile = Guid.Parse("30000000-0000-4000-8000-000000000002");
    public static readonly Guid FinalizedAppointment = Guid.Parse("40000000-0000-4000-8000-000000000001");
    public static readonly Guid DraftAppointment = Guid.Parse("40000000-0000-4000-8000-000000000002");
    public static readonly Guid RecordId = Guid.Parse("50000000-0000-4000-8000-000000000001");
    public static readonly string Version = RowVersionToken.Encode(new byte[8]);

    public ClinicalWorkflowFailure? NextFailure { get; set; }
    public bool ThrowUnexpected { get; set; }
    public int InvocationCount { get; private set; }

    public void Reset()
    {
        NextFailure = null;
        ThrowUnexpected = false;
        InvocationCount = 0;
    }

    public Task<MedicalRecordResponse?> LoadByAppointmentAsync(
        ClinicalActor actor, Guid appointmentId, CancellationToken cancellationToken = default)
    {
        BeforeCall();
        if (actor.Role == "Doctor" && actor.UserId != DoctorA) Denied();
        if (actor.Role == "Patient" &&
            (actor.UserId != PatientA || appointmentId == DraftAppointment)) Denied();
        return Task.FromResult<MedicalRecordResponse?>(appointmentId == FinalizedAppointment
            ? Response(MedicalRecordContractStatus.Finalized)
            : Response(MedicalRecordContractStatus.Draft));
    }

    public Task<MedicalRecordResponse> CreateDraftAsync(
        ClinicalActor actor, CreateMedicalRecordRequest request, string correlationId,
        CancellationToken cancellationToken = default)
    {
        BeforeCall();
        if (actor.UserId != DoctorA) Denied();
        return Task.FromResult(Response(MedicalRecordContractStatus.Draft));
    }

    public Task<MedicalRecordResponse> UpdateDraftAsync(
        ClinicalActor actor, Guid id, UpdateMedicalRecordDraftRequest request,
        string correlationId, CancellationToken cancellationToken = default)
    {
        BeforeCall();
        if (actor.UserId != DoctorA) Denied();
        return Task.FromResult(Response(MedicalRecordContractStatus.Draft));
    }

    public Task<MedicalRecordResponse> FinalizeAsync(
        ClinicalActor actor, Guid id, FinalizeMedicalRecordRequest request,
        string correlationId, CancellationToken cancellationToken = default)
    {
        BeforeCall();
        if (actor.UserId != DoctorA) Denied();
        return Task.FromResult(Response(MedicalRecordContractStatus.Finalized));
    }

    public Task<IReadOnlyList<MedicalRecordResponse>> ListFinalizedForPatientProfileAsync(
        ClinicalActor actor, Guid profileId, CancellationToken cancellationToken = default)
    {
        BeforeCall();
        if (actor.UserId != PatientA || profileId != OwnedProfile) Denied();
        return Task.FromResult<IReadOnlyList<MedicalRecordResponse>>
            ([Response(MedicalRecordContractStatus.Finalized)]);
    }

    private void BeforeCall()
    {
        InvocationCount++;
        if (ThrowUnexpected)
            throw new InvalidOperationException("provider-secret clinical-text password=do-not-leak");
        if (NextFailure is { } failure) throw new ClinicalWorkflowException(failure);
    }

    private static void Denied() =>
        throw new ClinicalWorkflowException(ClinicalWorkflowFailure.AccessDenied);

    private static MedicalRecordResponse Response(MedicalRecordContractStatus status) => new()
    {
        Id = RecordId,
        AppointmentId = status == MedicalRecordContractStatus.Finalized
            ? FinalizedAppointment : DraftAppointment,
        PatientProfileId = OwnedProfile,
        DoctorId = DoctorA,
        ChiefComplaint = status == MedicalRecordContractStatus.Finalized ? "Synthetic complaint" : null,
        Diagnosis = status == MedicalRecordContractStatus.Finalized ? "Synthetic diagnosis" : null,
        Status = status,
        RowVersion = Version,
        CreatedAt = new DateTime(2026, 11, 7, 0, 0, 0, DateTimeKind.Utc)
    };
}
